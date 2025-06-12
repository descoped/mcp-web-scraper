/**
 * Advanced Caching System for Content Extraction
 * Caches pattern results, rule effectiveness, and optimization data
 */

import {ExtractionResult} from '../types';
import {EnhancedContentQuality} from '../quality/enhancedQualityAnalyzer';

export interface CacheEntry {
    url: string;
    urlPattern: string; // Domain + path pattern for similar URLs
    extractionResult: ExtractionResult;
    qualityMetrics: EnhancedContentQuality;
    ruleId?: string;
    timestamp: Date;
    hitCount: number;
    lastAccessed: Date;
}

export interface PatternCacheEntry {
    urlPattern: string;
    domain: string;
    successfulSelectors: Map<string, string[]>; // field -> successful selectors
    failedSelectors: Map<string, string[]>; // field -> failed selectors
    averageQuality: number;
    sampleCount: number;
    lastUpdated: Date;
}

export interface RuleOptimizationCache {
    ruleId: string;
    optimizedSelectors: {
        [field: string]: {
            selectors: string[];
            confidence: number;
            successRate: number;
            lastTested: Date;
        };
    };
    knownFailureModes: {
        pattern: string;
        reason: string;
        frequency: number;
    }[];
    lastOptimized: Date;
}

export interface CacheConfig {
    maxEntries: number;
    maxAge: number; // milliseconds
    patternCacheSize: number;
    optimizationCacheSize: number;
    enableCompression: boolean;
    persistToDisk: boolean;
}

export class ExtractionCache {
    private cache: Map<string, CacheEntry> = new Map();
    private patternCache: Map<string, PatternCacheEntry> = new Map();
    private optimizationCache: Map<string, RuleOptimizationCache> = new Map();
    private config: CacheConfig;
    private cleanupTimer?: NodeJS.Timeout;

    constructor(config: Partial<CacheConfig> = {}) {
        this.config = {
            maxEntries: 1000,
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            patternCacheSize: 500,
            optimizationCacheSize: 100,
            enableCompression: false,
            persistToDisk: false,
            ...config
        };

        // Start cleanup timer
        this.startCleanupTimer();
    }

    /**
     * Store extraction result in cache
     */
    store(
        url: string,
        extractionResult: ExtractionResult,
        qualityMetrics: EnhancedContentQuality,
        ruleId?: string
    ): void {
        const urlPattern = this.generateUrlPattern(url);
        const now = new Date();

        const entry: CacheEntry = {
            url,
            urlPattern,
            extractionResult: this.deepClone(extractionResult),
            qualityMetrics: this.deepClone(qualityMetrics),
            ruleId,
            timestamp: now,
            hitCount: 0,
            lastAccessed: now
        };

        // Store in main cache
        this.cache.set(url, entry);

        // Update pattern cache
        this.updatePatternCache(urlPattern, extractionResult, qualityMetrics);

        // Update optimization cache if using a rule
        if (ruleId) {
            this.updateOptimizationCache(ruleId, extractionResult, url);
        }

        // Evict old entries if needed
        this.evictIfNeeded();
    }

    /**
     * Retrieve cached extraction result
     */
    get(url: string): CacheEntry | null {
        const entry = this.cache.get(url);

        if (!entry) {
            return null;
        }

        // Check if entry is still valid
        const age = Date.now() - entry.timestamp.getTime();
        if (age > this.config.maxAge) {
            this.cache.delete(url);
            return null;
        }

        // Update access statistics
        entry.hitCount++;
        entry.lastAccessed = new Date();

        return this.deepClone(entry);
    }

    /**
     * Find similar cached results by URL pattern
     */
    findSimilar(url: string, maxResults: number = 5): CacheEntry[] {
        const urlPattern = this.generateUrlPattern(url);
        const results: CacheEntry[] = [];

        for (const entry of this.cache.values()) {
            if (entry.urlPattern === urlPattern && entry.url !== url) {
                const age = Date.now() - entry.timestamp.getTime();
                if (age <= this.config.maxAge) {
                    results.push(this.deepClone(entry));
                }
            }
        }

        // Sort by quality score and hit count
        return results
            .sort((a, b) => {
                const scoreA = a.qualityMetrics.score * (1 + a.hitCount * 0.1);
                const scoreB = b.qualityMetrics.score * (1 + b.hitCount * 0.1);
                return scoreB - scoreA;
            })
            .slice(0, maxResults);
    }

    /**
     * Get optimized selectors for a domain/pattern
     */
    getOptimizedSelectors(domain: string, ruleId?: string): Map<string, string[]> | null {
        // First try rule-specific optimization cache
        if (ruleId) {
            const ruleCache = this.optimizationCache.get(ruleId);
            if (ruleCache) {
                const optimizedSelectors = new Map<string, string[]>();
                for (const [field, data] of Object.entries(ruleCache.optimizedSelectors)) {
                    if (data.confidence > 0.7) {
                        optimizedSelectors.set(field, data.selectors);
                    }
                }
                if (optimizedSelectors.size > 0) {
                    return optimizedSelectors;
                }
            }
        }

        // Fall back to pattern cache
        const pattern = `${domain}/*`;
        const patternEntry = this.patternCache.get(pattern);

        if (patternEntry && patternEntry.sampleCount >= 3) {
            return new Map(patternEntry.successfulSelectors);
        }

        return null;
    }

    /**
     * Record selector success/failure for learning
     */
    recordSelectorPerformance(
        url: string,
        field: string,
        selector: string,
        success: boolean,
        ruleId?: string
    ): void {
        const domain = this.extractDomain(url);
        const pattern = `${domain}/*`;

        // Update pattern cache
        let patternEntry = this.patternCache.get(pattern);
        if (!patternEntry) {
            patternEntry = {
                urlPattern: pattern,
                domain,
                successfulSelectors: new Map(),
                failedSelectors: new Map(),
                averageQuality: 0,
                sampleCount: 0,
                lastUpdated: new Date()
            };
            this.patternCache.set(pattern, patternEntry);
        }

        // Update selector tracking
        if (success) {
            const successful = patternEntry.successfulSelectors.get(field) || [];
            if (!successful.includes(selector)) {
                successful.push(selector);
                patternEntry.successfulSelectors.set(field, successful);
            }
        } else {
            const failed = patternEntry.failedSelectors.get(field) || [];
            if (!failed.includes(selector)) {
                failed.push(selector);
                patternEntry.failedSelectors.set(field, failed);
            }
        }

        patternEntry.lastUpdated = new Date();

        // Update rule optimization cache
        if (ruleId) {
            this.recordRuleSelectorPerformance(ruleId, field, selector, success);
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): {
        totalEntries: number;
        hitRate: number;
        averageAge: number;
        topDomains: { domain: string; count: number }[];
        patternCacheSize: number;
        optimizationCacheSize: number;
        memoryUsage: number;
    } {
        const now = Date.now();
        let totalHits = 0;
        let totalRequests = 0;
        let totalAge = 0;
        const domainCounts = new Map<string, number>();

        for (const entry of this.cache.values()) {
            totalHits += entry.hitCount;
            totalRequests += entry.hitCount + 1; // +1 for initial store
            totalAge += now - entry.timestamp.getTime();

            const domain = this.extractDomain(entry.url);
            domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
        }

        const topDomains = Array.from(domainCounts.entries())
            .map(([domain, count]) => ({domain, count}))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Rough memory usage estimation
        const entrySize = 1000; // Average bytes per entry
        const memoryUsage = this.cache.size * entrySize +
            this.patternCache.size * 500 +
            this.optimizationCache.size * 300;

        return {
            totalEntries: this.cache.size,
            hitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
            averageAge: this.cache.size > 0 ? totalAge / this.cache.size : 0,
            topDomains,
            patternCacheSize: this.patternCache.size,
            optimizationCacheSize: this.optimizationCache.size,
            memoryUsage
        };
    }

    /**
     * Generate cache key for a URL (public method for Phase 4A.1 analytics)
     */
    generateCacheKey(url: string): string {
        return this.generateUrlPattern(url);
    }

    /**
     * Clear all cache data
     */
    clear(): void {
        this.cache.clear();
        this.patternCache.clear();
        this.optimizationCache.clear();
    }

    /**
     * Clean up expired entries
     */
    cleanup(): void {
        const now = Date.now();
        const expiredUrls: string[] = [];

        for (const [url, entry] of this.cache.entries()) {
            const age = now - entry.timestamp.getTime();
            if (age > this.config.maxAge) {
                expiredUrls.push(url);
            }
        }

        for (const url of expiredUrls) {
            this.cache.delete(url);
        }

        console.log(`Cache cleanup: removed ${expiredUrls.length} expired entries`);
    }

    /**
     * Export cache data for persistence
     */
    export(): {
        cache: Array<CacheEntry>;
        patternCache: Array<PatternCacheEntry>;
        optimizationCache: Array<RuleOptimizationCache>;
        timestamp: Date;
    } {
        return {
            cache: Array.from(this.cache.values()),
            patternCache: Array.from(this.patternCache.values()),
            optimizationCache: Array.from(this.optimizationCache.values()),
            timestamp: new Date()
        };
    }

    // Private helper methods

    private generateUrlPattern(url: string): string {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace(/^www\./, '');

            // Generate pattern by replacing article IDs and dates with wildcards
            let pattern = urlObj.pathname;

            // Replace common article ID patterns
            pattern = pattern.replace(/\/\d+\//g, '/*/'); // /123456/
            pattern = pattern.replace(/\/\d+$/g, '/*'); // /123456
            pattern = pattern.replace(/\/[a-f0-9]{8,}/gi, '/*'); // /abc123def
            pattern = pattern.replace(/\/\d{4}\/\d{1,2}\/\d{1,2}/g, '/*/*/*/*'); // /2024/01/15

            // Replace UUIDs and long alphanumeric strings
            pattern = pattern.replace(/\/[a-z0-9]{20,}/gi, '/*');

            return `${domain}${pattern}`;
        } catch {
            return url;
        }
    }

    private updatePatternCache(
        urlPattern: string,
        extractionResult: ExtractionResult,
        qualityMetrics: EnhancedContentQuality
    ): void {
        const domain = this.extractDomain(urlPattern);

        let entry = this.patternCache.get(urlPattern);
        if (!entry) {
            entry = {
                urlPattern,
                domain,
                successfulSelectors: new Map(),
                failedSelectors: new Map(),
                averageQuality: qualityMetrics.score,
                sampleCount: 1,
                lastUpdated: new Date()
            };
        } else {
            // Update running average
            entry.averageQuality = (entry.averageQuality * entry.sampleCount + qualityMetrics.score) / (entry.sampleCount + 1);
            entry.sampleCount++;
            entry.lastUpdated = new Date();
        }

        this.patternCache.set(urlPattern, entry);

        // Evict old pattern cache entries
        if (this.patternCache.size > this.config.patternCacheSize) {
            const oldest = Array.from(this.patternCache.entries())
                .sort(([, a], [, b]) => a.lastUpdated.getTime() - b.lastUpdated.getTime())[0];
            if (oldest) {
                this.patternCache.delete(oldest[0]);
            }
        }
    }

    private updateOptimizationCache(
        ruleId: string,
        extractionResult: ExtractionResult,
        url: string
    ): void {
        let entry = this.optimizationCache.get(ruleId);
        if (!entry) {
            entry = {
                ruleId,
                optimizedSelectors: {},
                knownFailureModes: [],
                lastOptimized: new Date()
            };
        }

        // Record successful extractions by field
        for (const [field, value] of Object.entries(extractionResult.data)) {
            if (value && typeof value === 'string' && value.length > 0) {
                if (!entry.optimizedSelectors[field]) {
                    entry.optimizedSelectors[field] = {
                        selectors: [],
                        confidence: 0,
                        successRate: 0,
                        lastTested: new Date()
                    };
                }
                // This is a simplified version - would need actual selector data from rule execution
            }
        }

        this.optimizationCache.set(ruleId, entry);

        // Evict old optimization cache entries
        if (this.optimizationCache.size > this.config.optimizationCacheSize) {
            const oldest = Array.from(this.optimizationCache.entries())
                .sort(([, a], [, b]) => a.lastOptimized.getTime() - b.lastOptimized.getTime())[0];
            if (oldest) {
                this.optimizationCache.delete(oldest[0]);
            }
        }
    }

    private recordRuleSelectorPerformance(
        ruleId: string,
        field: string,
        selector: string,
        success: boolean
    ): void {
        let entry = this.optimizationCache.get(ruleId);
        if (!entry) return;

        if (!entry.optimizedSelectors[field]) {
            entry.optimizedSelectors[field] = {
                selectors: [],
                confidence: 0,
                successRate: 0,
                lastTested: new Date()
            };
        }

        const fieldData = entry.optimizedSelectors[field];

        if (success && !fieldData.selectors.includes(selector)) {
            fieldData.selectors.push(selector);
        }

        // Update confidence and success rate (simplified)
        fieldData.confidence = Math.min(1, fieldData.confidence + (success ? 0.1 : -0.05));
        fieldData.lastTested = new Date();
    }

    private evictIfNeeded(): void {
        if (this.cache.size <= this.config.maxEntries) {
            return;
        }

        // Evict least recently used entries
        const entries = Array.from(this.cache.entries())
            .sort(([, a], [, b]) => a.lastAccessed.getTime() - b.lastAccessed.getTime());

        const toEvict = entries.slice(0, Math.floor(this.config.maxEntries * 0.1));
        for (const [url] of toEvict) {
            this.cache.delete(url);
        }
    }

    private startCleanupTimer(): void {
        // Cleanup every hour
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, 60 * 60 * 1000);
    }

    private extractDomain(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace(/^www\./, '');
        } catch {
            return 'unknown';
        }
    }

    private deepClone<T>(obj: T): T {
        return JSON.parse(JSON.stringify(obj));
    }

    // Cleanup on destruction
    destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
    }
}