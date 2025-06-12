/**
 * Phase 3.6 - MCP Test Helpers
 * Utilities for MCP tool integration in system validation
 */

import {ScrapeArticleTool} from '@/tools/scrapeArticleTool.js';
import {NavigateTool} from '@/tools/navigateTool.js';
import {ConsentTool} from '@/tools/consentTool.js';
import {BrowserPool} from '@/core/browserPool.js';
import {PageManager} from '@/core/pageManager.js';
import {RateLimiter} from '@/core/rateLimiter.js';
import type {MCPValidationMetrics, ValidationResult} from '@tests/system-validation/types/system-validation-types.js';
import type {ConsentPatterns, NavigationToolContext, ServerConfig} from '@/types/index.js';

export class MCPTestHelpers {
    private scrapeArticleTool: ScrapeArticleTool;
    private navigateTool: NavigateTool;
    private consentTool: ConsentTool;
    private browserPool: BrowserPool;
    private pageManager: PageManager;
    private rateLimiter: RateLimiter;
    private metrics: MCPValidationMetrics;
    private toolContext: NavigationToolContext;

    constructor(browserPoolSize: number = 4) {
        this.browserPool = new BrowserPool({maxBrowsers: browserPoolSize});
        this.pageManager = new PageManager(this.browserPool);
        this.rateLimiter = new RateLimiter({
            enabled: true,
            defaultLimits: {
                requestsPerMinute: 30,
                maxConcurrentRequests: 5,
                requestTimeoutMs: 30000
            },
            cleanup: {
                intervalMs: 300000,
                retentionMs: 3600000,
                maxEntries: 1000
            },
            monitoring: {
                logViolations: true,
                logSuccess: false,
                emitMetrics: false,
                includeContext: false
            }
        });

        // Create tool context
        this.toolContext = this.createToolContext();

        this.scrapeArticleTool = new ScrapeArticleTool();
        this.navigateTool = new NavigateTool();
        this.consentTool = new ConsentTool();

        this.initializeMetrics();
    }

    private createToolContext(): NavigationToolContext {
        const config: ServerConfig = {
            name: 'mcp-web-scraper',
            version: '1.0.0',
            port: 3001,
            browserPoolSize: 4,
            requestTimeout: 30000,
            consentTimeout: 3000,
            enableDebugLogging: false
        };

        const consentPatterns: ConsentPatterns = {
            attributes: ['data-cy', 'data-testid', 'id', 'class'],
            textPatterns: ['accept', 'agree', 'consent', 'cookie', 'gdpr'],
            frameworks: ['OneTrust', 'Cookiebot', 'TrustArc'],
            containers: ['cookie-banner', 'consent-dialog', 'gdpr-notice']
        };

        return {
            browserPool: this.browserPool,
            pageManager: this.pageManager,
            config,
            consentPatterns,
            progressToken: 'system-validation',
            correlationId: 'system-validation-' + Date.now()
        };
    }

    private initializeMetrics(): void {
        this.metrics = {
            tool_performance: {
                scrape_article_content: {
                    success_rate: 0,
                    average_time_ms: 0,
                    error_distribution: {}
                },
                navigate_tool: {
                    success_rate: 0,
                    average_time_ms: 0,
                    error_distribution: {}
                },
                consent_handling: {
                    detection_rate: 0,
                    success_rate: 0,
                    average_time_ms: 0,
                    languages_covered: []
                }
            },
            rate_limiting_effectiveness: {
                requests_throttled: 0,
                average_delay_ms: 0,
                no_blocks_detected: true
            },
            session_management: {
                sessions_created: 0,
                sessions_reused: 0,
                cleanup_success_rate: 0
            }
        };
    }

    /**
     * Test URL using production MCP tools with realistic conditions
     */
    async validateUrlWithMCP(
        url: string,
        domain: string,
        region: string,
        enableConsent: boolean = true,
        enableRateLimit: boolean = true
    ): Promise<ValidationResult> {
        const startTime = Date.now();
        let consentTime = 0;
        let consentHandled = false;
        let retryCount = 0;
        const maxRetries = 3;
        let rateLimitContext: any = null;

        while (retryCount <= maxRetries) {
            try {
                // Apply rate limiting
                if (enableRateLimit) {
                    rateLimitContext = {
                        connectionId: 'system-validation',
                        ipAddress: '127.0.0.1',
                        toolName: 'scrape_article_content',
                        userId: 'system',
                        requestId: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                    };

                    const limitResult = await this.rateLimiter.checkLimit(rateLimitContext);
                    if (!limitResult.allowed) {
                        // Wait for the recommended delay
                        if (limitResult.retryAfterMs) {
                            await new Promise(resolve => setTimeout(resolve, limitResult.retryAfterMs));
                        }
                        this.metrics.rate_limiting_effectiveness.requests_throttled++;
                    }

                    await this.rateLimiter.startRequest(rateLimitContext);
                }

                // Navigate to URL using MCP tool
                const navigationStart = Date.now();
                await this.navigateTool.execute({
                    url,
                    waitForPageState: 'domcontentloaded'
                }, this.toolContext);
                const navigationTime = Date.now() - navigationStart;
                this.updateNavigationMetrics(true, navigationTime);

                // Handle consent if enabled
                if (enableConsent) {
                    const consentStart = Date.now();
                    try {
                        const consentResult = await this.consentTool.execute({url, timeout: 5000}, this.toolContext);
                        consentTime = Date.now() - consentStart;
                        consentHandled = consentResult.success || false;
                        this.updateConsentMetrics(consentHandled, consentTime);
                    } catch (consentError) {
                        console.warn(`Consent handling failed for ${url}:`, consentError.message);
                        consentTime = Date.now() - consentStart;
                        this.updateConsentMetrics(false, consentTime);
                    }
                }

                // Extract content using MCP tool
                const extractionStart = Date.now();
                const extractionResult = await this.scrapeArticleTool.execute({
                    url,
                    outputFormats: ['text'],
                    extractSelectors: {
                        title: 'h1, title',
                        content: 'article, .content, main, .article-body',
                        author: '.author, .byline, [rel="author"]',
                        date: 'time, .date, .published'
                    }
                }, this.toolContext);

                const extractionTime = Date.now() - extractionStart;
                const totalTime = Date.now() - startTime;

                // Analyze extraction results
                const fieldsExtracted = {
                    title: !!(extractionResult.extracted?.title && extractionResult.extracted.title.length > 0),
                    content: !!(extractionResult.extracted?.content && extractionResult.extracted.content.length > 100),
                    author: !!(extractionResult.extracted?.author && extractionResult.extracted.author.length > 0),
                    date: !!(extractionResult.extracted?.date && extractionResult.extracted.date.length > 0),
                    summary: !!(extractionResult.extracted?.summary && extractionResult.extracted.summary.length > 0)
                };

                const qualityScore = this.calculateQualityScore(fieldsExtracted, extractionResult.extracted);
                const success = qualityScore >= 0.4 && fieldsExtracted.title && fieldsExtracted.content;

                this.updateExtractionMetrics(success, extractionTime);

                // Complete rate limiting if it was started
                if (enableRateLimit && rateLimitContext) {
                    await this.rateLimiter.completeRequest(rateLimitContext);
                }

                return {
                    url,
                    domain,
                    region,
                    success,
                    quality_score: qualityScore,
                    extraction_time_ms: totalTime,
                    consent_handled: consentHandled,
                    consent_time_ms: consentTime,
                    method_used: extractionResult.method || 'mcp-scrape-article',
                    fields_extracted: fieldsExtracted,
                    retry_count: retryCount
                };

            } catch (error) {
                // Complete rate limiting if it was started
                if (enableRateLimit && rateLimitContext) {
                    try {
                        await this.rateLimiter.completeRequest(rateLimitContext);
                    } catch (rateLimitError) {
                        console.warn('Rate limit completion failed:', rateLimitError.message);
                    }
                }

                retryCount++;
                console.warn(`Attempt ${retryCount} failed for ${url}:`, error.message);

                this.updateExtractionMetrics(false, Date.now() - startTime);

                if (retryCount <= maxRetries) {
                    // Progressive delay between retries
                    await new Promise(resolve => setTimeout(resolve, retryCount * 2000));
                }
            }
        }

        // All retries failed
        return {
            url,
            domain,
            region,
            success: false,
            quality_score: 0,
            extraction_time_ms: Date.now() - startTime,
            consent_handled: consentHandled,
            consent_time_ms: consentTime,
            method_used: 'mcp-scrape-article',
            fields_extracted: {
                title: false,
                content: false,
                author: false,
                date: false,
                summary: false
            },
            error_message: `Failed after ${maxRetries} retries`,
            retry_count: retryCount
        };
    }

    /**
     * Discover URLs using MCP navigation tools
     */
    async discoverUrlsWithMCP(
        domain: string,
        strategies: string[] = ['homepage'],
        maxUrls: number = 5
    ): Promise<string[]> {
        const discoveredUrls: string[] = [];

        for (const strategy of strategies) {
            try {
                switch (strategy) {
                    case 'homepage':
                        const homepageUrls = await this.discoverFromHomepage(domain, maxUrls);
                        discoveredUrls.push(...homepageUrls);
                        break;
                    case 'rss':
                        const rssUrls = await this.discoverFromRSS(domain, maxUrls);
                        discoveredUrls.push(...rssUrls);
                        break;
                    case 'sitemap':
                        const sitemapUrls = await this.discoverFromSitemap(domain, maxUrls);
                        discoveredUrls.push(...sitemapUrls);
                        break;
                    default:
                        console.warn(`Unknown discovery strategy: ${strategy}`);
                }

                if (discoveredUrls.length >= maxUrls) {
                    break;
                }
            } catch (error) {
                console.warn(`Discovery strategy ${strategy} failed for ${domain}:`, error.message);
            }
        }

        return Array.from(new Set(discoveredUrls)).slice(0, maxUrls);
    }

    private async discoverFromHomepage(domain: string, maxUrls: number): Promise<string[]> {
        const url = `https://${domain}`;

        await this.navigateTool.execute({
            url,
            waitForPageState: 'domcontentloaded'
        }, this.toolContext);

        // Use scrape tool to extract article links
        const result = await this.scrapeArticleTool.execute({
            url,
            extractSelectors: {
                article_links: 'a[href*="/article"], a[href*="/news"], a[href*="/story"], a[href*="/i/"], article a, .article-link'
            }
        }, this.toolContext);

        const links: string[] = [];
        // Extract article URLs from the scraped content
        // This is a simplified implementation - in practice, you'd parse the DOM more carefully

        return links.slice(0, maxUrls);
    }

    private async discoverFromRSS(domain: string, maxUrls: number): Promise<string[]> {
        const rssUrls = [
            `https://${domain}/rss`,
            `https://${domain}/feed`,
            `https://${domain}/rss.xml`,
            `https://${domain}/feed.xml`
        ];

        for (const rssUrl of rssUrls) {
            try {
                await this.navigateTool.execute({
                    url: rssUrl,
                    waitForPageState: 'domcontentloaded'
                }, this.toolContext);

                const result = await this.scrapeArticleTool.execute({
                    url: rssUrl,
                    extractSelectors: {
                        rss_links: 'item link, entry link, item guid'
                    }
                }, this.toolContext);

                // Parse RSS content and extract article URLs
                // Simplified implementation
                return [];
            } catch (error) {
                continue;
            }
        }

        return [];
    }

    private async discoverFromSitemap(domain: string, maxUrls: number): Promise<string[]> {
        const sitemapUrl = `https://${domain}/sitemap.xml`;

        try {
            await this.navigateTool.execute({
                url: sitemapUrl,
                waitForPageState: 'domcontentloaded'
            }, this.toolContext);

            const result = await this.scrapeArticleTool.execute({
                url: sitemapUrl,
                extractSelectors: {
                    sitemap_urls: 'url loc, sitemap loc'
                }
            }, this.toolContext);

            // Parse sitemap and extract article URLs
            // Simplified implementation
            return [];
        } catch (error) {
            return [];
        }
    }

    private calculateQualityScore(fieldsExtracted: any, extracted: any): number {
        let score = 0;

        if (fieldsExtracted.title) score += 0.3;
        if (fieldsExtracted.content) score += 0.4;
        if (fieldsExtracted.author) score += 0.1;
        if (fieldsExtracted.date) score += 0.1;
        if (fieldsExtracted.summary) score += 0.1;

        // Bonus for content length
        if (extracted?.content && extracted.content.length > 500) {
            score += 0.1;
        }

        return Math.min(score, 1.0);
    }

    private updateNavigationMetrics(success: boolean, timeMs: number): void {
        const nav = this.metrics.tool_performance.navigate_tool;
        const total = (nav.success_rate * 100) + (success ? 1 : 0);
        nav.success_rate = total / 101;
        nav.average_time_ms = (nav.average_time_ms + timeMs) / 2;
    }

    private updateConsentMetrics(success: boolean, timeMs: number): void {
        const consent = this.metrics.tool_performance.consent_handling;
        const total = (consent.success_rate * 100) + (success ? 1 : 0);
        consent.success_rate = total / 101;
        consent.average_time_ms = (consent.average_time_ms + timeMs) / 2;
    }

    private updateExtractionMetrics(success: boolean, timeMs: number): void {
        const extraction = this.metrics.tool_performance.scrape_article_content;
        const total = (extraction.success_rate * 100) + (success ? 1 : 0);
        extraction.success_rate = total / 101;
        extraction.average_time_ms = (extraction.average_time_ms + timeMs) / 2;
    }

    /**
     * Get current MCP validation metrics
     */
    getMetrics(): MCPValidationMetrics {
        return {...this.metrics};
    }

    /**
     * Clean up resources
     */
    async cleanup(): Promise<void> {
        try {
            await this.pageManager.cleanup();
            await this.browserPool.cleanup();
            console.log('✅ MCP test helpers cleanup completed');
        } catch (error) {
            console.error('❌ MCP test helpers cleanup failed:', error);
        }
    }
}