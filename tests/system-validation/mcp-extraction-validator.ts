/**
 * Phase 3.6 - MCP Extraction Validator
 * Domain: Production MCP tool validation with realistic conditions
 */

import {MCPTestHelpers} from './utils/mcp-test-helpers.js';
import type {
    DomainTarget,
    MCPValidationMetrics,
    ValidationConfig,
    ValidationResult
} from './types/system-validation-types.js';

export class MCPExtractionValidator {
    private mcpHelpers: MCPTestHelpers;
    private config: ValidationConfig;

    constructor(config: ValidationConfig, browserPoolSize: number = 4) {
        this.config = config;
        this.mcpHelpers = new MCPTestHelpers(browserPoolSize);
    }

    /**
     * Validate extraction for a single URL using production MCP tools
     */
    async validateUrl(
        url: string,
        domain: string,
        region: string
    ): Promise<ValidationResult> {
        console.log(`🧪 Validating: ${url}`);

        try {
            const result = await this.mcpHelpers.validateUrlWithMCP(
                url,
                domain,
                region,
                true, // Enable consent handling
                true  // Enable rate limiting
            );

            // Log validation result
            if (result.success) {
                console.log(`   ✅ Success - Quality: ${(result.quality_score * 100).toFixed(1)}%, Time: ${result.extraction_time_ms}ms`);
            } else {
                console.log(`   ❌ Failed - ${result.error_message || 'Unknown error'}`);
            }

            return result;
        } catch (error) {
            console.error(`   💥 Validation error for ${url}:`, error.message);

            return {
                url,
                domain,
                region,
                success: false,
                quality_score: 0,
                extraction_time_ms: 0,
                consent_handled: false,
                consent_time_ms: 0,
                method_used: 'mcp-scrape-article',
                fields_extracted: {
                    title: false,
                    content: false,
                    author: false,
                    date: false,
                    summary: false
                },
                error_message: error.message,
                retry_count: 0
            };
        }
    }

    /**
     * Validate extraction for multiple URLs with batching
     */
    async validateUrls(
        urls: Array<{ url: string; domain: string; region: string }>,
        progressCallback?: (current: number, total: number, currentUrl?: string) => void
    ): Promise<ValidationResult[]> {
        const results: ValidationResult[] = [];
        const batchSize = this.config.performance_benchmarking ? 1 : 3; // Single for benchmarking

        console.log(`🎯 Starting MCP validation for ${urls.length} URLs`);

        for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);

            if (progressCallback) {
                progressCallback(i, urls.length, batch[0]?.url);
            }

            if (batchSize === 1) {
                // Sequential processing for accurate performance benchmarking
                for (const urlInfo of batch) {
                    const result = await this.validateUrl(
                        urlInfo.url,
                        urlInfo.domain,
                        urlInfo.region
                    );
                    results.push(result);

                    // Rate limiting delay
                    if (i < urls.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, this.config.rate_limit_delay));
                    }
                }
            } else {
                // Parallel processing for faster validation
                const batchPromises = batch.map(urlInfo =>
                    this.validateUrl(urlInfo.url, urlInfo.domain, urlInfo.region)
                );

                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);

                // Rate limiting delay between batches
                if (i + batchSize < urls.length) {
                    await new Promise(resolve => setTimeout(resolve, this.config.rate_limit_delay));
                }
            }
        }

        return results;
    }

    /**
     * Validate all URLs for a domain target
     */
    async validateDomainTarget(
        domainTarget: DomainTarget,
        maxUrls: number = 5
    ): Promise<ValidationResult[]> {
        if (!domainTarget.existing_urls || domainTarget.existing_urls.length === 0) {
            console.log(`⚠️ No URLs to validate for ${domainTarget.domain}`);
            return [];
        }

        const urlsToValidate = domainTarget.existing_urls
            .slice(0, maxUrls)
            .map(url => ({
                url,
                domain: domainTarget.domain,
                region: domainTarget.region
            }));

        console.log(`🌐 Validating ${urlsToValidate.length} URLs for ${domainTarget.domain}`);

        return await this.validateUrls(urlsToValidate);
    }

    /**
     * Validate URLs across multiple domain targets
     */
    async validateDomainTargets(
        domainTargets: DomainTarget[],
        maxUrlsPerDomain: number = 5,
        progressCallback?: (current: number, total: number, domain?: string) => void
    ): Promise<ValidationResult[]> {
        const allResults: ValidationResult[] = [];

        console.log(`🚀 Starting MCP validation across ${domainTargets.length} domains`);

        for (let i = 0; i < domainTargets.length; i++) {
            const domainTarget = domainTargets[i];

            if (progressCallback) {
                progressCallback(i, domainTargets.length, domainTarget.domain);
            }

            try {
                const domainResults = await this.validateDomainTarget(
                    domainTarget,
                    maxUrlsPerDomain
                );
                allResults.push(...domainResults);

                console.log(`   📊 ${domainTarget.domain}: ${domainResults.filter(r => r.success).length}/${domainResults.length} successful`);

            } catch (error) {
                console.error(`❌ Validation failed for ${domainTarget.domain}:`, error.message);
            }
        }

        return allResults;
    }

    /**
     * Run comprehensive consent handling tests
     */
    async validateConsentHandling(
        testUrls: Array<{ url: string; domain: string; expectedLanguage?: string }>,
        languages: string[] = this.config.consent_languages
    ): Promise<{
        overall_detection_rate: number;
        overall_success_rate: number;
        language_coverage: Record<string, { detected: number; successful: number; total: number }>;
        average_consent_time: number;
    }> {
        console.log(`🍪 Starting consent handling validation for ${testUrls.length} URLs`);

        const results: Array<{
            url: string;
            domain: string;
            language?: string;
            detected: boolean;
            successful: boolean;
            time_ms: number;
        }> = [];

        for (const testUrl of testUrls) {
            try {
                const validationResult = await this.validateUrl(
                    testUrl.url,
                    testUrl.domain,
                    'consent-test'
                );

                results.push({
                    url: testUrl.url,
                    domain: testUrl.domain,
                    language: testUrl.expectedLanguage,
                    detected: validationResult.consent_time_ms > 0,
                    successful: validationResult.consent_handled,
                    time_ms: validationResult.consent_time_ms
                });

            } catch (error) {
                console.warn(`⚠️ Consent test failed for ${testUrl.url}:`, error.message);
                results.push({
                    url: testUrl.url,
                    domain: testUrl.domain,
                    language: testUrl.expectedLanguage,
                    detected: false,
                    successful: false,
                    time_ms: 0
                });
            }
        }

        // Analyze results
        const detectedCount = results.filter(r => r.detected).length;
        const successfulCount = results.filter(r => r.successful).length;
        const averageTime = results.filter(r => r.time_ms > 0)
            .reduce((sum, r) => sum + r.time_ms, 0) / Math.max(1, detectedCount);

        // Language-specific analysis
        const languageCoverage: Record<string, { detected: number; successful: number; total: number }> = {};

        for (const language of languages) {
            const languageResults = results.filter(r => r.language === language);
            languageCoverage[language] = {
                detected: languageResults.filter(r => r.detected).length,
                successful: languageResults.filter(r => r.successful).length,
                total: languageResults.length
            };
        }

        console.log(`🍪 Consent validation complete: ${detectedCount}/${results.length} detected, ${successfulCount}/${results.length} successful`);

        return {
            overall_detection_rate: detectedCount / results.length,
            overall_success_rate: successfulCount / results.length,
            language_coverage: languageCoverage,
            average_consent_time: averageTime
        };
    }

    /**
     * Generate comprehensive validation summary
     */
    generateValidationSummary(results: ValidationResult[]): {
        total_urls_tested: number;
        successful_extractions: number;
        overall_success_rate: number;
        consent_handling_rate: number;
        average_quality_score: number;
        average_extraction_time_ms: number;
        field_extraction_rates: {
            title: number;
            content: number;
            author: number;
            date: number;
            summary: number;
        };
        method_distribution: Record<string, number>;
        error_analysis: Record<string, number>;
        quality_distribution: {
            excellent: number; // > 0.8
            good: number;      // 0.6 - 0.8
            acceptable: number; // 0.4 - 0.6
            poor: number;       // < 0.4
        };
        performance_analysis: {
            fast: number;       // < 2000ms
            moderate: number;   // 2000-5000ms
            slow: number;       // > 5000ms
        };
    } {
        const totalUrls = results.length;
        const successfulResults = results.filter(r => r.success);
        const consentResults = results.filter(r => r.consent_handled);

        // Field extraction rates
        const fieldRates = {
            title: results.filter(r => r.fields_extracted.title).length / totalUrls,
            content: results.filter(r => r.fields_extracted.content).length / totalUrls,
            author: results.filter(r => r.fields_extracted.author).length / totalUrls,
            date: results.filter(r => r.fields_extracted.date).length / totalUrls,
            summary: results.filter(r => r.fields_extracted.summary).length / totalUrls
        };

        // Method distribution
        const methodDistribution: Record<string, number> = {};
        results.forEach(r => {
            methodDistribution[r.method_used] = (methodDistribution[r.method_used] || 0) + 1;
        });

        // Error analysis
        const errorAnalysis: Record<string, number> = {};
        results.filter(r => !r.success && r.error_message).forEach(r => {
            const errorType = this.categorizeError(r.error_message!);
            errorAnalysis[errorType] = (errorAnalysis[errorType] || 0) + 1;
        });

        // Quality distribution
        const qualityDist = {
            excellent: results.filter(r => r.quality_score > 0.8).length,
            good: results.filter(r => r.quality_score > 0.6 && r.quality_score <= 0.8).length,
            acceptable: results.filter(r => r.quality_score > 0.4 && r.quality_score <= 0.6).length,
            poor: results.filter(r => r.quality_score <= 0.4).length
        };

        // Performance analysis
        const perfAnalysis = {
            fast: results.filter(r => r.extraction_time_ms < 2000).length,
            moderate: results.filter(r => r.extraction_time_ms >= 2000 && r.extraction_time_ms <= 5000).length,
            slow: results.filter(r => r.extraction_time_ms > 5000).length
        };

        return {
            total_urls_tested: totalUrls,
            successful_extractions: successfulResults.length,
            overall_success_rate: successfulResults.length / totalUrls,
            consent_handling_rate: consentResults.length / totalUrls,
            average_quality_score: results.reduce((sum, r) => sum + r.quality_score, 0) / totalUrls,
            average_extraction_time_ms: results.reduce((sum, r) => sum + r.extraction_time_ms, 0) / totalUrls,
            field_extraction_rates: fieldRates,
            method_distribution: methodDistribution,
            error_analysis: errorAnalysis,
            quality_distribution: qualityDist,
            performance_analysis: perfAnalysis
        };
    }

    private categorizeError(errorMessage: string): string {
        const error = errorMessage.toLowerCase();

        if (error.includes('timeout') || error.includes('time out')) return 'timeout';
        if (error.includes('network') || error.includes('connection')) return 'network';
        if (error.includes('consent') || error.includes('cookie')) return 'consent_handling';
        if (error.includes('navigation') || error.includes('navigate')) return 'navigation';
        if (error.includes('selector') || error.includes('element')) return 'content_extraction';
        if (error.includes('blocked') || error.includes('rate limit')) return 'rate_limiting';

        return 'other';
    }

    /**
     * Get current MCP validation metrics
     */
    getMetrics(): MCPValidationMetrics {
        return this.mcpHelpers.getMetrics();
    }

    /**
     * Clean up resources
     */
    async cleanup(): Promise<void> {
        await this.mcpHelpers.cleanup();
    }
}