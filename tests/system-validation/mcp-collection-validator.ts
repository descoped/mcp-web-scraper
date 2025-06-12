/**
 * Phase 3.6 - MCP Collection Validator
 * Domain: Article URL discovery using production MCP tools
 */

import {MCPTestHelpers} from './utils/mcp-test-helpers.js';
import type {CollectedUrl, CollectionConfig, CollectionResult, DomainTarget} from './types/system-validation-types.js';

export class MCPCollectionValidator {
    private mcpHelpers: MCPTestHelpers;
    private config: CollectionConfig;

    constructor(config: CollectionConfig, browserPoolSize: number = 4) {
        this.config = config;
        this.mcpHelpers = new MCPTestHelpers(browserPoolSize);
    }

    /**
     * Collect article URLs for a domain using MCP tools
     */
    async collectUrlsForDomain(domainTarget: DomainTarget): Promise<CollectionResult> {
        const startTime = Date.now();
        const errors: string[] = [];
        const collectedUrls: CollectedUrl[] = [];

        console.log(`🔍 Starting MCP collection for ${domainTarget.domain}`);

        try {
            // Discover URLs using MCP navigation and scraping tools
            const discoveredUrls = await this.mcpHelpers.discoverUrlsWithMCP(
                domainTarget.domain,
                this.config.discovery_strategies,
                20 // Discover more than needed for filtering
            );

            console.log(`   📡 Discovered ${discoveredUrls.length} potential URLs`);

            // Validate each discovered URL if validation is enabled
            let validatedUrls = discoveredUrls;
            if (this.config.validate_during_collection) {
                validatedUrls = await this.validateDiscoveredUrls(
                    discoveredUrls,
                    domainTarget
                );
            }

            // Create CollectedUrl objects
            for (const url of validatedUrls) {
                try {
                    const collectedUrl = await this.createCollectedUrl(
                        url,
                        domainTarget,
                        'homepage' // Simplified - would track actual discovery method
                    );

                    if (collectedUrl.is_valid &&
                        collectedUrl.quality_score >= this.config.min_content_quality &&
                        collectedUrl.frontpage_risk <= this.config.frontpage_risk_threshold) {
                        collectedUrls.push(collectedUrl);
                    }
                } catch (error) {
                    errors.push(`URL validation failed for ${url}: ${error.message}`);
                }
            }

            // Sort by quality and take best URLs
            collectedUrls.sort((a, b) => b.quality_score - a.quality_score);
            const finalUrls = collectedUrls.slice(0, 5); // Keep top 5 quality URLs

            const collectionTime = Date.now() - startTime;
            const averageQuality = finalUrls.length > 0
                ? finalUrls.reduce((sum, url) => sum + url.quality_score, 0) / finalUrls.length
                : 0;

            console.log(`   ✅ Collected ${finalUrls.length} high-quality URLs (avg quality: ${(averageQuality * 100).toFixed(1)}%)`);

            return {
                domain: domainTarget.domain,
                region: domainTarget.region,
                urls_discovered: discoveredUrls.length,
                urls_validated: validatedUrls.length,
                urls_added: finalUrls.length,
                discovery_methods_used: this.config.discovery_strategies,
                collection_time_ms: collectionTime,
                average_quality_score: averageQuality,
                collected_urls: finalUrls,
                errors
            };

        } catch (error) {
            console.error(`   ❌ Collection failed for ${domainTarget.domain}:`, error.message);

            return {
                domain: domainTarget.domain,
                region: domainTarget.region,
                urls_discovered: 0,
                urls_validated: 0,
                urls_added: 0,
                discovery_methods_used: this.config.discovery_strategies,
                collection_time_ms: Date.now() - startTime,
                average_quality_score: 0,
                collected_urls: [],
                errors: [error.message]
            };
        }
    }

    /**
     * Validate discovered URLs using MCP tools
     */
    private async validateDiscoveredUrls(
        urls: string[],
        domainTarget: DomainTarget
    ): Promise<string[]> {
        const validUrls: string[] = [];
        const batchSize = 3; // Process URLs in small batches

        console.log(`   🧪 Validating ${urls.length} URLs with MCP tools...`);

        for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);

            const validationPromises = batch.map(async (url) => {
                try {
                    const result = await this.mcpHelpers.validateUrlWithMCP(
                        url,
                        domainTarget.domain,
                        domainTarget.region,
                        true, // Enable consent handling
                        true  // Enable rate limiting
                    );

                    return result.success ? url : null;
                } catch (error) {
                    console.warn(`     ⚠️ Validation failed for ${url}: ${error.message}`);
                    return null;
                }
            });

            const batchResults = await Promise.all(validationPromises);
            const validBatchUrls = batchResults.filter(url => url !== null);
            validUrls.push(...validBatchUrls);

            console.log(`     📊 Batch ${Math.floor(i / batchSize) + 1}: ${validBatchUrls.length}/${batch.length} URLs valid`);
        }

        return validUrls;
    }

    /**
     * Create a CollectedUrl object with metadata
     */
    private async createCollectedUrl(
        url: string,
        domainTarget: DomainTarget,
        discoveryMethod: string
    ): Promise<CollectedUrl> {
        // Extract basic metadata
        const title = this.extractTitleFromUrl(url);
        const qualityScore = this.estimateQualityFromUrl(url, domainTarget);
        const frontpageRisk = this.assessFrontpageRisk(url);

        return {
            url,
            domain: domainTarget.domain,
            title,
            discovered_via: discoveryMethod,
            collection_timestamp: new Date().toISOString(),
            quality_score: qualityScore,
            frontpage_risk,
            is_valid: qualityScore >= this.config.min_content_quality &&
                frontpageRisk <= this.config.frontpage_risk_threshold
        };
    }

    /**
     * Extract potential title from URL structure
     */
    private extractTitleFromUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            const pathSegments = urlObj.pathname.split('/').filter(segment => segment.length > 0);

            // Look for title-like segments (usually the last meaningful segment)
            const titleSegment = pathSegments[pathSegments.length - 1];

            if (titleSegment && titleSegment.length > 3) {
                // Convert URL-friendly format to readable title
                return titleSegment
                    .replace(/[-_]/g, ' ')
                    .replace(/\b\w/g, l => l.toUpperCase())
                    .slice(0, 100); // Limit length
            }

            return `Article from ${new URL(url).hostname}`;
        } catch {
            return 'Unknown Article';
        }
    }

    /**
     * Estimate content quality based on URL patterns
     */
    private estimateQualityFromUrl(url: string, domainTarget: DomainTarget): number {
        let score = 0.5; // Base score

        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname.toLowerCase();

            // Article indicators boost score
            const articleIndicators = [
                '/article/', '/news/', '/story/', '/i/', '/reportage/',
                '/feature/', '/analysis/', '/opinion/', '/sport/'
            ];

            if (articleIndicators.some(indicator => path.includes(indicator))) {
                score += 0.3;
            }

            // Length and structure indicators
            if (path.split('/').length >= 3) {
                score += 0.1; // Deeper paths often indicate articles
            }

            // Date patterns in URL
            if (/\/20\d{2}\/\d{2}\/\d{2}\//.test(path)) {
                score += 0.2; // Date structure indicates news article
            }

            // Domain-specific patterns
            if (domainTarget.has_bespoke_rule) {
                score += 0.1; // Domains with bespoke rules likely have better URLs
            }

            // Penalize certain patterns
            if (path.includes('/tag/') || path.includes('/category/') ||
                path.includes('/search') || path === '/') {
                score -= 0.4;
            }

            return Math.max(0, Math.min(1, score));
        } catch {
            return 0.3; // Conservative score for malformed URLs
        }
    }

    /**
     * Assess risk that URL points to a frontpage rather than article
     */
    private assessFrontpageRisk(url: string): number {
        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname.toLowerCase();

            // High risk indicators
            if (path === '/' || path === '') return 0.9;
            if (path.includes('/category') || path.includes('/tag')) return 0.8;
            if (path.includes('/search') || path.includes('/archive')) return 0.7;
            if (path.endsWith('/sport') || path.endsWith('/news')) return 0.6;

            // Medium risk indicators
            if (path.split('/').length <= 2) return 0.5;

            // Low risk indicators (good article URLs)
            const articlePatterns = ['/article/', '/story/', '/i/', '/news/', '/sport/'];
            if (articlePatterns.some(pattern => path.includes(pattern))) {
                return 0.1;
            }

            // Date patterns reduce frontpage risk
            if (/\/20\d{2}\//.test(path)) return 0.2;

            return 0.3; // Default medium-low risk
        } catch {
            return 0.5;
        }
    }

    /**
     * Batch collection for multiple domains
     */
    async collectUrlsForDomains(
        domainTargets: DomainTarget[],
        progressCallback?: (current: number, total: number, domain: string) => void
    ): Promise<CollectionResult[]> {
        const results: CollectionResult[] = [];

        console.log(`🚀 Starting MCP collection for ${domainTargets.length} domains`);

        for (let i = 0; i < domainTargets.length; i++) {
            const domainTarget = domainTargets[i];

            if (progressCallback) {
                progressCallback(i, domainTargets.length, domainTarget.domain);
            }

            try {
                const result = await this.collectUrlsForDomain(domainTarget);
                results.push(result);

                // Small delay between domains to be respectful
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`❌ Failed to collect URLs for ${domainTarget.domain}:`, error.message);

                // Add failure result
                results.push({
                    domain: domainTarget.domain,
                    region: domainTarget.region,
                    urls_discovered: 0,
                    urls_validated: 0,
                    urls_added: 0,
                    discovery_methods_used: this.config.discovery_strategies,
                    collection_time_ms: 0,
                    average_quality_score: 0,
                    collected_urls: [],
                    errors: [error.message]
                });
            }
        }

        return results;
    }

    /**
     * Clean up resources
     */
    async cleanup(): Promise<void> {
        await this.mcpHelpers.cleanup();
    }
}