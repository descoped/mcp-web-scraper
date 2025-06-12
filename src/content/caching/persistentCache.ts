/**
 * Phase 4C.3 - Persistent Cache System with SQLite Storage
 * Cross-session learning and performance optimization with database persistence
 */

import Database from 'better-sqlite3';
import {promises as fs} from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';
import type {ExtractedContent} from '../rules/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CachedExtraction {
    id: string;
    url: string;
    domain: string;
    urlHash: string;
    extractedContent: ExtractedContent;
    extractionMethod: string;
    confidence: number;
    qualityScore: number;
    ruleId?: string;
    ruleName?: string;
    metadata: CacheEntryMetadata;
    createdAt: Date;
    lastAccessed: Date;
    accessCount: number;
    isValid: boolean;
}

export interface CacheEntryMetadata {
    userAgent?: string;
    extractionTime: number;
    contentLength: number;
    wordCount: number;
    hasStructuredData: boolean;
    language?: string;
    region?: string;
    platform?: string;
    pageLoadTime?: number;
    responseSize?: number;
    htmlSignature: string; // Hash of key DOM elements for change detection
}

export interface CacheStatistics {
    totalEntries: number;
    validEntries: number;
    invalidEntries: number;
    totalSize: number;
    hitRate: number;
    averageQuality: number;
    entriesByDomain: Record<string, number>;
    entriesByMethod: Record<string, number>;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    topDomains: Array<{ domain: string; count: number; avgQuality: number }>;
}

export interface CacheOptimization {
    type: 'cleanup' | 'revalidation' | 'compression' | 'indexing';
    description: string;
    affectedEntries: number;
    spaceSaved: number;
    performanceGain: number;
}

export interface CrossSessionLearning {
    domainPatterns: Record<string, DomainPattern>;
    extractionPatterns: Record<string, ExtractionPattern>;
    qualityTrends: QualityTrend[];
    performanceBaselines: Record<string, PerformanceBaseline>;
}

export interface DomainPattern {
    domain: string;
    commonSelectors: string[];
    bestMethods: string[];
    averageLoadTime: number;
    successRate: number;
    qualityScore: number;
    lastUpdated: Date;
    sampleSize: number;
}

export interface ExtractionPattern {
    method: string;
    successRate: number;
    averageQuality: number;
    averageTime: number;
    bestDomains: string[];
    commonFailures: string[];
    improvementSuggestions: string[];
}

export interface QualityTrend {
    date: Date;
    domain: string;
    method: string;
    qualityScore: number;
    sampleSize: number;
}

export interface PerformanceBaseline {
    domain: string;
    method: string;
    targetTime: number;
    targetQuality: number;
    targetSuccessRate: number;
    lastCalibrated: Date;
}

export class PersistentCache {
    private db: Database.Database;
    private dbPath: string;
    private isInitialized = false;
    private hitCount = 0;
    private missCount = 0;
    private maxEntries: number;
    private maxAge: number; // in milliseconds
    private compressionEnabled: boolean;

    constructor(options: {
        dbPath?: string;
        maxEntries?: number;
        maxAge?: number; // in hours
        compressionEnabled?: boolean;
    } = {}) {
        this.dbPath = options.dbPath || path.join(__dirname, '../../../data/extraction_cache.db');
        this.maxEntries = options.maxEntries || 50000;
        this.maxAge = (options.maxAge || 168) * 60 * 60 * 1000; // Default 1 week
        this.compressionEnabled = options.compressionEnabled || true;
        this.db = null as any; // Will be initialized in initialize()
    }

    /**
     * Initialize the persistent cache system
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.dbPath);
            await fs.mkdir(dataDir, {recursive: true});

            // Initialize SQLite database
            this.db = new Database(this.dbPath);
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('synchronous = NORMAL');
            this.db.pragma('cache_size = 10000');
            this.db.pragma('foreign_keys = ON');

            // Create tables
            this.createTables();

            // Create indexes for performance
            this.createIndexes();

            // Perform startup maintenance
            await this.performStartupMaintenance();

            this.isInitialized = true;
            console.log('💾 Persistent Cache initialized with SQLite backend');

            const stats = this.getStatistics();
            console.log(`   📊 ${stats.totalEntries} entries, ${stats.validEntries} valid`);
            console.log(`   💽 Database size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);

        } catch (error) {
            console.error('Failed to initialize Persistent Cache:', error);
            throw error;
        }
    }

    /**
     * Create database tables
     */
    private createTables(): void {
        // Main cache entries table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS cache_entries
            (
                id
                TEXT
                PRIMARY
                KEY,
                url
                TEXT
                NOT
                NULL,
                domain
                TEXT
                NOT
                NULL,
                url_hash
                TEXT
                NOT
                NULL
                UNIQUE,
                extracted_content
                TEXT
                NOT
                NULL,
                extraction_method
                TEXT
                NOT
                NULL,
                confidence
                REAL
                NOT
                NULL,
                quality_score
                REAL
                NOT
                NULL,
                rule_id
                TEXT,
                rule_name
                TEXT,
                metadata
                TEXT
                NOT
                NULL,
                created_at
                DATETIME
                NOT
                NULL,
                last_accessed
                DATETIME
                NOT
                NULL,
                access_count
                INTEGER
                DEFAULT
                1,
                is_valid
                BOOLEAN
                DEFAULT
                1
            );
        `);

        // Domain patterns for cross-session learning
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS domain_patterns
            (
                domain
                TEXT
                PRIMARY
                KEY,
                common_selectors
                TEXT
                NOT
                NULL,
                best_methods
                TEXT
                NOT
                NULL,
                average_load_time
                REAL
                NOT
                NULL,
                success_rate
                REAL
                NOT
                NULL,
                quality_score
                REAL
                NOT
                NULL,
                last_updated
                DATETIME
                NOT
                NULL,
                sample_size
                INTEGER
                NOT
                NULL
            );
        `);

        // Extraction patterns
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS extraction_patterns
            (
                method
                TEXT
                PRIMARY
                KEY,
                success_rate
                REAL
                NOT
                NULL,
                average_quality
                REAL
                NOT
                NULL,
                average_time
                REAL
                NOT
                NULL,
                best_domains
                TEXT
                NOT
                NULL,
                common_failures
                TEXT
                NOT
                NULL,
                improvement_suggestions
                TEXT
                NOT
                NULL,
                last_updated
                DATETIME
                NOT
                NULL
            );
        `);

        // Quality trends
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS quality_trends
            (
                id
                INTEGER
                PRIMARY
                KEY
                AUTOINCREMENT,
                date
                DATETIME
                NOT
                NULL,
                domain
                TEXT
                NOT
                NULL,
                method
                TEXT
                NOT
                NULL,
                quality_score
                REAL
                NOT
                NULL,
                sample_size
                INTEGER
                NOT
                NULL
            );
        `);

        // Performance baselines
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS performance_baselines
            (
                domain_method
                TEXT
                PRIMARY
                KEY,
                domain
                TEXT
                NOT
                NULL,
                method
                TEXT
                NOT
                NULL,
                target_time
                REAL
                NOT
                NULL,
                target_quality
                REAL
                NOT
                NULL,
                target_success_rate
                REAL
                NOT
                NULL,
                last_calibrated
                DATETIME
                NOT
                NULL
            );
        `);
    }

    /**
     * Create database indexes for performance
     */
    private createIndexes(): void {
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_cache_url_hash ON cache_entries(url_hash);
            CREATE INDEX IF NOT EXISTS idx_cache_domain ON cache_entries(domain);
            CREATE INDEX IF NOT EXISTS idx_cache_method ON cache_entries(extraction_method);
            CREATE INDEX IF NOT EXISTS idx_cache_quality ON cache_entries(quality_score);
            CREATE INDEX IF NOT EXISTS idx_cache_last_accessed ON cache_entries(last_accessed);
            CREATE INDEX IF NOT EXISTS idx_cache_valid ON cache_entries(is_valid);
            CREATE INDEX IF NOT EXISTS idx_quality_trends_date ON quality_trends(date);
            CREATE INDEX IF NOT EXISTS idx_quality_trends_domain ON quality_trends(domain);
        `);
    }

    /**
     * Get cached extraction by URL
     */
    async get(url: string): Promise<CachedExtraction | null> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const urlHash = this.hashUrl(url);

        try {
            const stmt = this.db.prepare(`
                SELECT *
                FROM cache_entries
                WHERE url_hash = ?
                  AND is_valid = 1
                ORDER BY created_at DESC LIMIT 1
            `);

            const row = stmt.get(urlHash);

            if (!row) {
                this.missCount++;
                return null;
            }

            // Check if entry is expired
            const entry = this.rowToCacheEntry(row);
            if (this.isExpired(entry)) {
                // Mark as invalid instead of deleting immediately
                this.markInvalid(entry.id);
                this.missCount++;
                return null;
            }

            // Update access tracking
            this.updateAccess(entry.id);
            this.hitCount++;

            console.log(`💾 Cache hit for ${entry.domain}: ${entry.extractionMethod}`);
            return entry;

        } catch (error) {
            console.error('Error retrieving from cache:', error);
            this.missCount++;
            return null;
        }
    }

    /**
     * Store extraction in cache
     */
    async set(
        url: string,
        extractedContent: ExtractedContent,
        extractionMethod: string,
        confidence: number,
        qualityScore: number,
        metadata: Partial<CacheEntryMetadata>,
        ruleId?: string,
        ruleName?: string
    ): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const id = crypto.randomUUID();
        const domain = this.extractDomain(url);
        const urlHash = this.hashUrl(url);
        const now = new Date();

        // Generate HTML signature for change detection
        const htmlSignature = metadata.htmlSignature || this.generateHtmlSignature(extractedContent);

        const fullMetadata: CacheEntryMetadata = {
            extractionTime: metadata.extractionTime || 0,
            contentLength: extractedContent.content?.length || 0,
            wordCount: extractedContent.content?.split(/\s+/).length || 0,
            hasStructuredData: metadata.hasStructuredData || false,
            language: metadata.language,
            region: metadata.region,
            platform: metadata.platform,
            pageLoadTime: metadata.pageLoadTime,
            responseSize: metadata.responseSize,
            htmlSignature,
            ...metadata
        };

        try {
            // Check if we need to cleanup old entries
            await this.enforceMaxEntries();

            const stmt = this.db.prepare(`
                INSERT
                OR REPLACE INTO cache_entries (
                    id, url, domain, url_hash, extracted_content, extraction_method,
                    confidence, quality_score, rule_id, rule_name, metadata,
                    created_at, last_accessed, access_count, is_valid
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
            `);

            stmt.run(
                id,
                url,
                domain,
                urlHash,
                JSON.stringify(extractedContent),
                extractionMethod,
                confidence,
                qualityScore,
                ruleId || null,
                ruleName || null,
                JSON.stringify(fullMetadata),
                now.toISOString(),
                now.toISOString(),
                1
            );

            // Update cross-session learning data
            await this.updateLearningData(domain, extractionMethod, confidence, qualityScore, fullMetadata);

            console.log(`💾 Cached extraction for ${domain}: ${extractionMethod}`);

        } catch (error) {
            console.error('Error storing in cache:', error);
        }
    }

    /**
     * Invalidate cache entries for a domain
     */
    async invalidateDomain(domain: string): Promise<number> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            const stmt = this.db.prepare(`
                UPDATE cache_entries
                SET is_valid      = 0,
                    last_accessed = ?
                WHERE domain = ? AND is_valid = 1
            `);

            const result = stmt.run(new Date().toISOString(), domain);
            console.log(`💾 Invalidated ${result.changes} entries for domain: ${domain}`);
            return result.changes || 0;

        } catch (error) {
            console.error('Error invalidating domain cache:', error);
            return 0;
        }
    }

    /**
     * Clear expired entries
     */
    async clearExpired(): Promise<number> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const cutoffDate = new Date(Date.now() - this.maxAge);

        try {
            const stmt = this.db.prepare(`
                DELETE
                FROM cache_entries
                WHERE created_at < ?
                   OR is_valid = 0
            `);

            const result = stmt.run(cutoffDate.toISOString());
            console.log(`💾 Cleared ${result.changes} expired/invalid entries`);
            return result.changes || 0;

        } catch (error) {
            console.error('Error clearing expired entries:', error);
            return 0;
        }
    }

    /**
     * Get cache statistics
     */
    getStatistics(): CacheStatistics {
        if (!this.isInitialized) {
            return {
                totalEntries: 0,
                validEntries: 0,
                invalidEntries: 0,
                totalSize: 0,
                hitRate: 0,
                averageQuality: 0,
                entriesByDomain: {},
                entriesByMethod: {},
                oldestEntry: null,
                newestEntry: null,
                topDomains: []
            };
        }

        try {
            // Basic counts
            const totalEntriesResult = this.db.prepare('SELECT COUNT(*) as count FROM cache_entries').get() as {
                count: number
            } | undefined;
            const totalEntries = totalEntriesResult?.count || 0;

            const validEntriesResult = this.db.prepare('SELECT COUNT(*) as count FROM cache_entries WHERE is_valid = 1').get() as {
                count: number
            } | undefined;
            const validEntries = validEntriesResult?.count || 0;
            const invalidEntries = totalEntries - validEntries;

            // Quality metrics
            const avgQualityResult = this.db.prepare('SELECT AVG(quality_score) as avg FROM cache_entries WHERE is_valid = 1').get() as {
                avg: number
            } | undefined;
            const avgQuality = avgQualityResult?.avg || 0;

            // Hit rate
            const totalRequests = this.hitCount + this.missCount;
            const hitRate = totalRequests > 0 ? this.hitCount / totalRequests : 0;

            // Domain statistics
            const domainStats = this.db.prepare(`
                SELECT domain, COUNT (*) as count, AVG (quality_score) as avg_quality
                FROM cache_entries
                WHERE is_valid = 1
                GROUP BY domain
                ORDER BY count DESC
                    LIMIT 10
            `).all();

            const entriesByDomain: Record<string, number> = {};
            const topDomains = domainStats.map((row: any) => {
                entriesByDomain[row.domain] = row.count;
                return {
                    domain: row.domain,
                    count: row.count,
                    avgQuality: row.avg_quality
                };
            });

            // Method statistics
            const methodStats = this.db.prepare(`
                SELECT extraction_method, COUNT(*) as count
                FROM cache_entries
                WHERE is_valid = 1
                GROUP BY extraction_method
            `).all();

            const entriesByMethod: Record<string, number> = {};
            methodStats.forEach((row: any) => {
                entriesByMethod[row.extraction_method] = row.count;
            });

            // Date range
            const dateRange = this.db.prepare(`
                SELECT MIN(created_at) as oldest, MAX(created_at) as newest
                FROM cache_entries
                WHERE is_valid = 1
            `).get() as { oldest: string | null, newest: string | null } | undefined;

            // Database size (approximate)
            const sizeInfo = this.db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get() as {
                size: number
            } | undefined;
            const totalSize = sizeInfo?.size || 0;

            return {
                totalEntries,
                validEntries,
                invalidEntries,
                totalSize,
                hitRate,
                averageQuality: avgQuality,
                entriesByDomain,
                entriesByMethod,
                oldestEntry: dateRange?.oldest ? new Date(dateRange.oldest) : null,
                newestEntry: dateRange?.newest ? new Date(dateRange.newest) : null,
                topDomains
            };

        } catch (error) {
            console.error('Error getting cache statistics:', error);
            return {
                totalEntries: 0,
                validEntries: 0,
                invalidEntries: 0,
                totalSize: 0,
                hitRate: 0,
                averageQuality: 0,
                entriesByDomain: {},
                entriesByMethod: {},
                oldestEntry: null,
                newestEntry: null,
                topDomains: []
            };
        }
    }

    /**
     * Get cross-session learning data
     */
    getCrossSessionLearning(): CrossSessionLearning {
        if (!this.isInitialized) {
            return {
                domainPatterns: {},
                extractionPatterns: {},
                qualityTrends: [],
                performanceBaselines: {}
            };
        }

        try {
            // Domain patterns
            const domainRows = this.db.prepare('SELECT * FROM domain_patterns').all();
            const domainPatterns: Record<string, DomainPattern> = {};
            domainRows.forEach((row: any) => {
                domainPatterns[row.domain] = {
                    domain: row.domain,
                    commonSelectors: JSON.parse(row.common_selectors),
                    bestMethods: JSON.parse(row.best_methods),
                    averageLoadTime: row.average_load_time,
                    successRate: row.success_rate,
                    qualityScore: row.quality_score,
                    lastUpdated: new Date(row.last_updated),
                    sampleSize: row.sample_size
                };
            });

            // Extraction patterns
            const extractionRows = this.db.prepare('SELECT * FROM extraction_patterns').all();
            const extractionPatterns: Record<string, ExtractionPattern> = {};
            extractionRows.forEach((row: any) => {
                extractionPatterns[row.method] = {
                    method: row.method,
                    successRate: row.success_rate,
                    averageQuality: row.average_quality,
                    averageTime: row.average_time,
                    bestDomains: JSON.parse(row.best_domains),
                    commonFailures: JSON.parse(row.common_failures),
                    improvementSuggestions: JSON.parse(row.improvement_suggestions)
                };
            });

            // Quality trends (last 30 days)
            const trendsRows = this.db.prepare(`
                SELECT *
                FROM quality_trends
                WHERE date >= date ('now', '-30 days')
                ORDER BY date DESC
            `).all();

            const qualityTrends = trendsRows.map((row: any) => ({
                date: new Date(row.date),
                domain: row.domain,
                method: row.method,
                qualityScore: row.quality_score,
                sampleSize: row.sample_size
            }));

            // Performance baselines
            const baselineRows = this.db.prepare('SELECT * FROM performance_baselines').all();
            const performanceBaselines: Record<string, PerformanceBaseline> = {};
            baselineRows.forEach((row: any) => {
                performanceBaselines[row.domain_method] = {
                    domain: row.domain,
                    method: row.method,
                    targetTime: row.target_time,
                    targetQuality: row.target_quality,
                    targetSuccessRate: row.target_success_rate,
                    lastCalibrated: new Date(row.last_calibrated)
                };
            });

            return {
                domainPatterns,
                extractionPatterns,
                qualityTrends,
                performanceBaselines
            };

        } catch (error) {
            console.error('Error getting cross-session learning data:', error);
            return {
                domainPatterns: {},
                extractionPatterns: {},
                qualityTrends: [],
                performanceBaselines: {}
            };
        }
    }

    /**
     * Optimize cache performance
     */
    async optimizeCache(): Promise<CacheOptimization[]> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const optimizations: CacheOptimization[] = [];

        try {
            // 1. Cleanup expired entries
            const expiredCleaned = await this.clearExpired();
            if (expiredCleaned > 0) {
                optimizations.push({
                    type: 'cleanup',
                    description: 'Removed expired and invalid entries',
                    affectedEntries: expiredCleaned,
                    spaceSaved: expiredCleaned * 1024, // Estimate
                    performanceGain: 0.05
                });
            }

            // 2. Vacuum database
            this.db.exec('VACUUM');
            optimizations.push({
                type: 'compression',
                description: 'Compacted database file',
                affectedEntries: 0,
                spaceSaved: 0, // Would need before/after size comparison
                performanceGain: 0.1
            });

            // 3. Update statistics
            this.db.exec('ANALYZE');
            optimizations.push({
                type: 'indexing',
                description: 'Updated query optimizer statistics',
                affectedEntries: 0,
                spaceSaved: 0,
                performanceGain: 0.02
            });

            // 4. Revalidate old entries (check if still valid)
            const revalidationCandidates = this.db.prepare(`
                SELECT id, url_hash
                FROM cache_entries
                WHERE last_accessed < date ('now'
                    , '-7 days')
                  AND is_valid = 1
                    LIMIT 100
            `).all();

            if (revalidationCandidates.length > 0) {
                optimizations.push({
                    type: 'revalidation',
                    description: 'Identified entries for revalidation',
                    affectedEntries: revalidationCandidates.length,
                    spaceSaved: 0,
                    performanceGain: 0.03
                });
            }

            console.log(`💾 Cache optimization complete: ${optimizations.length} optimizations applied`);
            return optimizations;

        } catch (error) {
            console.error('Error optimizing cache:', error);
            return optimizations;
        }
    }

    /**
     * Helper methods
     */
    private hashUrl(url: string): string {
        return crypto.createHash('sha256').update(url).digest('hex');
    }

    private extractDomain(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace(/^www\./, '');
        } catch {
            return 'unknown';
        }
    }

    private generateHtmlSignature(content: ExtractedContent): string {
        const signatureData = [
            content.title || '',
            content.author || '',
            content.date || '',
            (content.content || '').slice(0, 500)
        ].join('|');

        return crypto.createHash('md5').update(signatureData).digest('hex');
    }

    private rowToCacheEntry(row: any): CachedExtraction {
        return {
            id: row.id,
            url: row.url,
            domain: row.domain,
            urlHash: row.url_hash,
            extractedContent: JSON.parse(row.extracted_content),
            extractionMethod: row.extraction_method,
            confidence: row.confidence,
            qualityScore: row.quality_score,
            ruleId: row.rule_id,
            ruleName: row.rule_name,
            metadata: JSON.parse(row.metadata),
            createdAt: new Date(row.created_at),
            lastAccessed: new Date(row.last_accessed),
            accessCount: row.access_count,
            isValid: Boolean(row.is_valid)
        };
    }

    private isExpired(entry: CachedExtraction): boolean {
        return Date.now() - entry.createdAt.getTime() > this.maxAge;
    }

    private markInvalid(id: string): void {
        const stmt = this.db.prepare('UPDATE cache_entries SET is_valid = 0 WHERE id = ?');
        stmt.run(id);
    }

    private updateAccess(id: string): void {
        const stmt = this.db.prepare(`
            UPDATE cache_entries
            SET last_accessed = ?,
                access_count  = access_count + 1
            WHERE id = ?
        `);
        stmt.run(new Date().toISOString(), id);
    }

    private async enforceMaxEntries(): Promise<void> {
        const currentCountResult = this.db.prepare('SELECT COUNT(*) as count FROM cache_entries WHERE is_valid = 1').get() as {
            count: number
        } | undefined;
        const currentCount = currentCountResult?.count || 0;

        if (currentCount >= this.maxEntries) {
            const deleteCount = Math.floor(this.maxEntries * 0.1); // Remove 10%

            // Delete oldest, least accessed entries
            const stmt = this.db.prepare(`
                DELETE
                FROM cache_entries
                WHERE id IN (SELECT id
                             FROM cache_entries
                             WHERE is_valid = 1
                             ORDER BY last_accessed ASC, access_count ASC
                    LIMIT ?
                    )
            `);

            stmt.run(deleteCount);
            console.log(`💾 Removed ${deleteCount} old entries to enforce max limit`);
        }
    }

    private async performStartupMaintenance(): Promise<void> {
        // Clear very old entries
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const stmt = this.db.prepare('DELETE FROM cache_entries WHERE created_at < ?');
        const result = stmt.run(monthAgo.toISOString());

        if (result.changes && result.changes > 0) {
            console.log(`💾 Startup cleanup: removed ${result.changes} entries older than 30 days`);
        }
    }

    private async updateLearningData(
        domain: string,
        method: string,
        confidence: number,
        qualityScore: number,
        metadata: CacheEntryMetadata
    ): Promise<void> {
        // Update domain patterns
        const domainStmt = this.db.prepare(`
            INSERT
            OR REPLACE INTO domain_patterns (
                domain, common_selectors, best_methods, average_load_time,
                success_rate, quality_score, last_updated, sample_size
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // This is simplified - in reality, we'd aggregate data from multiple entries
        domainStmt.run(
            domain,
            JSON.stringify([]), // Would track actual selectors used
            JSON.stringify([method]),
            metadata.extractionTime || 0,
            confidence,
            qualityScore,
            new Date().toISOString(),
            1
        );

        // Add quality trend entry
        const trendStmt = this.db.prepare(`
            INSERT INTO quality_trends (date, domain, method, quality_score, sample_size)
            VALUES (?, ?, ?, ?, ?)
        `);

        trendStmt.run(
            new Date().toISOString(),
            domain,
            method,
            qualityScore,
            1
        );
    }

    /**
     * Close database connection
     */
    close(): void {
        if (this.db) {
            this.db.close();
            this.isInitialized = false;
            console.log('💾 Persistent Cache closed');
        }
    }
}

// Singleton instance
export const persistentCache = new PersistentCache();