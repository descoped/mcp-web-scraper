/**
 * Phase 4C.1 - Global Content Detector
 * Extends HybridDetector with international site support and content platform optimization
 */

import type {Page} from 'playwright';
import {HybridDetector} from './hybridDetector';
import {type ExtractedContent, type ExtractionMetadata} from '../rules/types';
import {internationalRulesLoader, type InternationalSiteRule} from '../rules/internationalRulesLoader';
import {UniversalDetector} from './universalDetector';
import type {EnhancedContentQuality} from '../quality/enhancedQualityAnalyzer';

export interface GlobalDetectionResult {
    data: ExtractedContent;
    method: string;
    confidence: number;
    metadata: ExtractionMetadata & {
        international_rule_used?: boolean;
        content_platform?: string;
        region?: string;
        rule_type?: 'news_site' | 'content_platform' | 'universal' | 'fallback';
        quality_indicators_met?: boolean;
        platform_optimizations?: string[];
    };
}

export interface GlobalDetectionOptions {
    preferInternationalRules?: boolean;
    enableContentPlatforms?: boolean;
    regionPreference?: string;
    qualityThreshold?: number;
    fallbackToUniversal?: boolean;
}

export class GlobalDetector {
    private hybridDetector: HybridDetector;
    private universalDetector: UniversalDetector;
    private isInitialized = false;

    constructor() {
        this.hybridDetector = new HybridDetector();
        this.universalDetector = new UniversalDetector();
    }

    /**
     * Initialize the global detector with all rule sets
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            // Initialize international rules loader
            await internationalRulesLoader.initialize();

            // Initialize base detectors
            await this.hybridDetector.initialize();

            this.isInitialized = true;

            const stats = internationalRulesLoader.getStatistics();
            console.log('🌍 Global Detector initialized with:');
            console.log(`   📰 ${stats.newsSites} international news sites`);
            console.log(`   🎯 ${stats.contentPlatforms} content platforms`);
            console.log(`   🌐 ${stats.regions.length} regions: ${stats.regions.join(', ')}`);
            console.log(`   📱 ${stats.platforms.length} platforms: ${stats.platforms.join(', ')}`);

        } catch (error) {
            console.error('Failed to initialize Global Detector:', error);
            throw error;
        }
    }

    /**
     * Extract content using global detection capabilities
     */
    async extract(
        page: Page,
        options: GlobalDetectionOptions = {}
    ): Promise<GlobalDetectionResult> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const {
            preferInternationalRules = true,
            enableContentPlatforms = true,
            regionPreference,
            qualityThreshold = 0.6,
            fallbackToUniversal = true
        } = options;

        const url = page.url();
        const domain = this.extractDomain(url);

        console.log(`🌍 Global detection for: ${domain}`);

        // Phase 1: Try international/content platform rules
        if (preferInternationalRules) {
            const internationalResult = await this.tryInternationalRules(
                page,
                domain,
                enableContentPlatforms,
                regionPreference
            );

            if (internationalResult && internationalResult.confidence >= qualityThreshold) {
                console.log(`✅ International extraction successful: ${internationalResult.method}`);
                return internationalResult;
            }
        }

        // Phase 2: Try Norwegian/Scandinavian rules (HybridDetector)
        console.log('🔄 Falling back to Norwegian/Scandinavian rules...');
        try {
            const hybridResult = await this.hybridDetector.extract(page);

            if (hybridResult.confidence >= qualityThreshold) {
                console.log(`✅ Scandinavian extraction successful: ${hybridResult.method}`);
                return this.convertHybridResult(hybridResult, 'scandinavian_fallback');
            }
        } catch (error) {
            console.warn('HybridDetector failed:', error);
        }

        // Phase 3: Universal fallback
        if (fallbackToUniversal) {
            console.log('🔄 Falling back to universal detection...');
            try {
                const universalResult = await this.universalDetector.extract(page);
                console.log(`⚠️ Universal fallback used: confidence ${universalResult.confidence.toFixed(2)}`);
                return this.convertUniversalResult(universalResult, domain);
            } catch (error) {
                console.error('Universal detection failed:', error);
            }
        }

        // Phase 4: Emergency fallback with basic extraction
        console.log('🚨 Emergency fallback - basic extraction');
        return await this.emergencyFallback(page, domain);
    }

    /**
     * Try international and content platform rules
     */
    private async tryInternationalRules(
        page: Page,
        domain: string,
        enableContentPlatforms: boolean,
        regionPreference?: string
    ): Promise<GlobalDetectionResult | null> {

        // Get applicable rules
        let applicableRules = internationalRulesLoader.getRulesForDomain(domain);

        if (applicableRules.length === 0) {
            return null;
        }

        // Filter by region preference if specified
        if (regionPreference) {
            const regionRules = applicableRules.filter(rule =>
                rule.metadata?.region === regionPreference || rule.region === regionPreference
            );
            if (regionRules.length > 0) {
                applicableRules = regionRules;
            }
        }

        // Filter by content platform preference
        if (!enableContentPlatforms) {
            applicableRules = applicableRules.filter(rule =>
                !rule.platform && !rule.metadata?.platform
            );
        }

        // Try each applicable rule in priority order
        for (const rule of applicableRules) {
            try {
                console.log(`🔍 Trying international rule: ${rule.name} (${rule.id})`);
                const result = await this.extractWithInternationalRule(page, rule, domain);

                if (result && this.validateQualityIndicators(result, rule)) {
                    return result;
                }
            } catch (error) {
                console.warn(`Failed to extract with rule ${rule.id}:`, error);
                continue;
            }
        }

        return null;
    }

    /**
     * Extract content using a specific international rule
     */
    private async extractWithInternationalRule(
        page: Page,
        rule: InternationalSiteRule,
        domain: string
    ): Promise<GlobalDetectionResult | null> {

        const startTime = Date.now();
        const extractedData: ExtractedContent = {
            title: '',
            content: '',
            author: '',
            date: '',
            summary: ''
        };

        try {
            // Extract each field using the rule's selectors
            for (const [field, selectors] of Object.entries(rule.selectors)) {
                if (field === 'container' || field === 'exclusions') continue;

                const fieldSelectors = Array.isArray(selectors) ? selectors : [selectors];
                const extractedValue = await this.extractFieldContent(
                    page,
                    fieldSelectors,
                    rule.exclusions || []
                );

                // Only assign to simple string fields
                if (field === 'title' || field === 'content' || field === 'author' || field === 'date' || field === 'summary') {
                    (extractedData as any)[field] = extractedValue;
                }
            }

            // Apply platform-specific optimizations
            const platformOptimizations = await this.applyPlatformOptimizations(
                page,
                extractedData,
                rule
            );

            // Calculate confidence based on extraction success and quality
            const confidence = this.calculateInternationalConfidence(extractedData, rule);

            // Generate quality metrics
            const qualityMetrics = await this.generateQualityMetrics(extractedData, rule);

            const extractionTime = Date.now() - startTime;

            return {
                data: extractedData,
                method: rule.platform ? `platform-${rule.platform}` : `international-${rule.metadata?.region || 'global'}`,
                confidence,
                metadata: {
                    selectors_used: this.getSelectorSummary(rule.selectors),
                    rule_id: rule.id,
                    rule_name: rule.name,
                    rule_domain_match: true,
                    international_rule_used: true,
                    content_platform: rule.platform || rule.metadata?.platform,
                    region: rule.metadata?.region || rule.region,
                    rule_type: rule.platform ? 'content_platform' : 'news_site',
                    quality_indicators_met: this.validateQualityIndicators({
                        data: extractedData,
                        confidence
                    } as any, rule),
                    platform_optimizations: platformOptimizations,
                    extraction_time: extractionTime,
                    content_quality: qualityMetrics,
                    cache_hit: false,
                    retry_count: 0
                }
            };

        } catch (error) {
            console.error(`Error extracting with international rule ${rule.id}:`, error);
            return null;
        }
    }

    /**
     * Extract content for a specific field using selectors
     */
    private async extractFieldContent(
        page: Page,
        selectors: string[],
        exclusions: string[] = []
    ): Promise<string> {

        for (const selector of selectors) {
            try {
                const elements = await page.$$(selector);

                for (const element of elements) {
                    // Skip excluded elements
                    let isExcluded = false;
                    for (const exclusion of exclusions) {
                        try {
                            const excluded = await element.$(exclusion);
                            if (excluded) {
                                isExcluded = true;
                                break;
                            }
                        } catch {
                            // Ignore selector errors for exclusions
                        }
                    }

                    if (isExcluded) continue;

                    const text = await element.textContent();
                    if (text && text.trim().length > 10) {
                        return text.trim();
                    }
                }
            } catch (error) {
                // Continue to next selector if this one fails
                continue;
            }
        }

        return '';
    }

    /**
     * Apply platform-specific optimizations
     */
    private async applyPlatformOptimizations(
        page: Page,
        data: ExtractedContent,
        rule: InternationalSiteRule
    ): Promise<string[]> {
        const optimizations: string[] = [];

        const platform = rule.platform || rule.metadata?.platform;

        switch (platform) {
            case 'medium':
                // Medium-specific optimizations
                if (!data.author && data.content) {
                    // Try to extract author from content or claps section
                    try {
                        const authorFromClaps = await page.$eval(
                            '.u-accentColor--buttonNormal',
                            el => el.textContent?.trim() || ''
                        ).catch(() => '');
                        if (authorFromClaps) {
                            data.author = authorFromClaps;
                            optimizations.push('medium_author_from_claps');
                        }
                    } catch {
                    }
                }
                break;

            case 'substack':
                // Substack-specific optimizations
                if (!data.summary && data.content) {
                    // Use first paragraph as summary for Substack
                    const firstParagraph = data.content.split('\n')[0];
                    if (firstParagraph && firstParagraph.length > 50) {
                        data.summary = firstParagraph.slice(0, 200) + '...';
                        optimizations.push('substack_summary_from_content');
                    }
                }
                break;

            case 'linkedin':
                // LinkedIn-specific optimizations
                if (!data.date) {
                    // Try alternative date selectors
                    try {
                        const alternativeDate = await page.$eval(
                            '.update-components-actor__sub-description',
                            el => el.textContent?.trim() || ''
                        ).catch(() => '');
                        if (alternativeDate) {
                            data.date = alternativeDate;
                            optimizations.push('linkedin_alternative_date');
                        }
                    } catch {
                    }
                }
                break;
        }

        // International news site optimizations
        if (!platform && rule.metadata?.region) {
            switch (rule.metadata.region) {
                case 'uk':
                    // UK-specific date format handling
                    if (data.date && data.date.includes(' GMT')) {
                        data.date = data.date.replace(' GMT', '');
                        optimizations.push('uk_date_format_cleanup');
                    }
                    break;

                case 'us':
                    // US-specific content cleanup
                    if (data.content && data.content.includes('(CNN)')) {
                        data.content = data.content.replace(/\(CNN\)\s*/g, '');
                        optimizations.push('us_cnn_byline_cleanup');
                    }
                    break;
            }
        }

        return optimizations;
    }

    /**
     * Calculate confidence for international rule extraction
     */
    private calculateInternationalConfidence(
        data: ExtractedContent,
        rule: InternationalSiteRule
    ): number {
        let confidence = 0.5; // Base confidence for international rules

        // Required fields from quality indicators
        const requiredFields = rule.quality_indicators?.required_fields || ['title', 'content'];
        const foundRequiredFields = requiredFields.filter(field => {
            const value = data[field as keyof ExtractedContent];
            return value && typeof value === 'string' && value.length > 10;
        });

        // Calculate field completion ratio
        const fieldCompletionRatio = foundRequiredFields.length / requiredFields.length;
        confidence += fieldCompletionRatio * 0.3;

        // Content length bonus
        const minLength = rule.quality_indicators?.minimum_content_length || 200;
        if (data.content && typeof data.content === 'string' && data.content.length >= minLength) {
            confidence += 0.15;
        }

        // Metadata completeness bonus
        const metadataFields = ['author', 'date', 'summary'];
        const foundMetadata = metadataFields.filter(field => {
            const value = data[field as keyof ExtractedContent];
            return value && typeof value === 'string' && value.length > 5;
        });
        confidence += (foundMetadata.length / metadataFields.length) * 0.1;

        // Platform-specific bonuses
        if (rule.platform) {
            confidence += 0.05; // Platform rules are generally more reliable
        }

        return Math.min(0.95, Math.max(0.1, confidence));
    }

    /**
     * Validate quality indicators for a rule
     */
    private validateQualityIndicators(
        result: { data: ExtractedContent; confidence: number },
        rule: InternationalSiteRule
    ): boolean {
        if (!rule.quality_indicators) return true;

        const {required_fields, minimum_content_length} = rule.quality_indicators;

        // Check required fields
        if (required_fields) {
            const missingFields = required_fields.filter(field => {
                const value = result.data[field as keyof ExtractedContent];
                return !value || typeof value !== 'string' || value.length < 10;
            });
            if (missingFields.length > 0) {
                console.log(`⚠️ Missing required fields: ${missingFields.join(', ')}`);
                return false;
            }
        }

        // Check minimum content length
        if (minimum_content_length && result.data.content) {
            if (result.data.content.length < minimum_content_length) {
                console.log(`⚠️ Content too short: ${result.data.content.length} < ${minimum_content_length}`);
                return false;
            }
        }

        return true;
    }

    /**
     * Generate quality metrics for international extraction
     */
    private async generateQualityMetrics(
        data: ExtractedContent,
        rule: InternationalSiteRule
    ): Promise<EnhancedContentQuality> {
        const wordCount = data.content ? data.content.split(/\s+/).length : 0;
        const hasTitle = !!(data.title && data.title.length > 5);
        const hasAuthor = !!(data.author && data.author.length > 2);
        const hasDate = !!(data.date && data.date.length > 5);
        const hasSummary = !!(data.summary && data.summary.length > 10);

        const metadataComplete = [hasTitle, hasAuthor, hasDate, hasSummary].filter(Boolean).length >= 3;

        // Calculate quality score based on international standards
        let qualityScore = 0.3; // Base score

        if (hasTitle) qualityScore += 0.2;
        if (wordCount >= (rule.quality_indicators?.minimum_content_length || 200)) qualityScore += 0.25;
        if (hasAuthor) qualityScore += 0.1;
        if (hasDate) qualityScore += 0.1;
        if (hasSummary) qualityScore += 0.05;

        // Calculate metadata completeness 
        const metadataFields = ['author', 'date', 'summary'];
        const foundMetadataCount = metadataFields.filter(field => {
            const value = data[field as keyof ExtractedContent];
            return value && typeof value === 'string' && value.length > 5;
        }).length;

        return {
            // Basic metrics
            contentLength: data.content?.length || 0,
            wordCount,
            paragraphCount: data.content ? data.content.split(/\n\s*\n/).length : 0,
            textDensity: 0.8, // Reasonable default for rule-based extraction
            linkDensity: 0.1, // Low for article content
            metadataComplete,
            cleanContent: true, // International rules produce clean content
            score: Math.min(0.95, qualityScore),
            articleIndicators: {
                hasStructuredData: false, // Would need page analysis
                hasArticleSchema: false,
                hasOpenGraphArticle: false,
                hasCanonicalUrl: false,
                hasPublishDate: hasDate,
                hasAuthorInfo: hasAuthor,
                hasDateInfo: hasDate,
                singleArticleScore: 0.9 // High for international rule-based extraction
            },
            frontpageRisk: {
                risk: 'low' as const,
                riskScore: 0.1, // International rules are article-specific
                indicators: {
                    multipleHeadlines: false,
                    navigationHeavy: false,
                    categoryLinks: false,
                    articleListStructure: false,
                    noSingleArticleContent: false
                },
                recommendation: 'extract' as const
            },
            contentStructure: {
                hasMainContent: true,
                contentDepth: 2,
                headerHierarchy: [1, 0, 0, 0, 0, 0], // Assume h1 present
                mediaElements: {images: 0, videos: 0, embeds: 0},
                navigationElements: 0,
                advertisingElements: 0
            },
            languageAnalysis: {
                detectedLanguage: rule.metadata?.region || 'en',
                isNorwegian: false,
                norwegianIndicators: {
                    hasNorwegianCharacters: false,
                    hasNorwegianPhrases: false,
                    hasNorwegianDateFormat: false
                },
                contentLanguageConsistency: 0.9
            },
            readabilityMetrics: {
                averageWordsPerSentence: 15,
                averageSyllablesPerWord: 1.5,
                fleschKincaidGradeLevel: 8, // Grade level
                contentComplexity: 'moderate' as const,
                hasLongParagraphs: false
            },
            extractionQuality: {
                titleQuality: hasTitle ? 0.9 : 0.1,
                contentQuality: qualityScore,
                metadataQuality: (foundMetadataCount / metadataFields.length),
                extractionMethod: 'international_rule',
                confidence: qualityScore,
                bespokeRuleUsed: true,
                extractionTime: 0 // Would need to be passed in
            }
        };
    }

    /**
     * Convert HybridDetector result to GlobalDetectionResult
     */
    private convertHybridResult(
        hybridResult: any,
        fallbackType: string
    ): GlobalDetectionResult {
        return {
            data: hybridResult.data,
            method: `${fallbackType}_${hybridResult.method}`,
            confidence: hybridResult.confidence * 0.9, // Slight penalty for fallback
            metadata: {
                ...hybridResult.metadata,
                international_rule_used: false,
                rule_type: 'fallback'
            }
        };
    }

    /**
     * Convert UniversalDetector result to GlobalDetectionResult
     */
    private convertUniversalResult(
        universalResult: any,
        domain: string
    ): GlobalDetectionResult {
        return {
            data: universalResult.data,
            method: 'universal_global',
            confidence: universalResult.confidence * 0.8, // Penalty for universal fallback
            metadata: {
                ...universalResult.metadata,
                international_rule_used: false,
                rule_type: 'universal',
                region: this.guessRegionFromDomain(domain)
            }
        };
    }

    /**
     * Emergency fallback extraction
     */
    private async emergencyFallback(
        page: Page,
        domain: string
    ): Promise<GlobalDetectionResult> {

        const data: ExtractedContent = {
            title: '',
            content: '',
            author: '',
            date: '',
            summary: ''
        };

        try {
            // Try basic selectors
            data.title = await page.$eval('h1', el => el.textContent?.trim() || '').catch(() => '');
            data.content = await page.$eval('body', el => {
                // Remove script and style elements
                const cloned = el.cloneNode(true) as Element;
                cloned.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove());
                return cloned.textContent?.trim().slice(0, 5000) || '';
            }).catch(() => '');

            return {
                data,
                method: 'emergency_fallback',
                confidence: 0.1,
                metadata: {
                    selectors_used: {
                        'title': 'h1',
                        'content': 'body'
                    },
                    rule_id: null,
                    rule_name: 'Emergency Fallback',
                    rule_domain_match: false,
                    international_rule_used: false,
                    rule_type: 'fallback',
                    region: this.guessRegionFromDomain(domain),
                    extraction_time: 0,
                    content_quality: {
                        // Basic metrics
                        contentLength: data.content.length,
                        wordCount: data.content.split(/\s+/).length,
                        paragraphCount: 1,
                        textDensity: 0.3, // Low for emergency fallback
                        linkDensity: 0.5, // Higher due to unfiltered content
                        metadataComplete: false,
                        cleanContent: false,
                        score: 0.1,
                        articleIndicators: {
                            hasStructuredData: false,
                            hasArticleSchema: false,
                            hasOpenGraphArticle: false,
                            hasCanonicalUrl: false,
                            hasPublishDate: false,
                            hasAuthorInfo: false,
                            hasDateInfo: false,
                            singleArticleScore: 0.1 // Low for emergency fallback
                        },
                        frontpageRisk: {
                            risk: 'medium' as const,
                            riskScore: 0.5,
                            indicators: {
                                multipleHeadlines: false,
                                navigationHeavy: false,
                                categoryLinks: false,
                                articleListStructure: false,
                                noSingleArticleContent: false
                            },
                            recommendation: 'warn' as const
                        },
                        contentStructure: {
                            hasMainContent: false,
                            contentDepth: 1,
                            headerHierarchy: [0, 0, 0, 0, 0, 0],
                            mediaElements: {images: 0, videos: 0, embeds: 0},
                            navigationElements: 10, // Many nav elements in emergency fallback
                            advertisingElements: 5
                        },
                        languageAnalysis: {
                            detectedLanguage: null,
                            isNorwegian: false,
                            norwegianIndicators: {
                                hasNorwegianCharacters: false,
                                hasNorwegianPhrases: false,
                                hasNorwegianDateFormat: false
                            },
                            contentLanguageConsistency: 0.5
                        },
                        readabilityMetrics: {
                            averageWordsPerSentence: 10,
                            averageSyllablesPerWord: 1.8,
                            fleschKincaidGradeLevel: 12, // Higher complexity for unfiltered
                            contentComplexity: 'complex' as const,
                            hasLongParagraphs: true
                        },
                        extractionQuality: {
                            titleQuality: !!data.title ? 0.3 : 0.0,
                            contentQuality: 0.1,
                            metadataQuality: 0.0,
                            extractionMethod: 'emergency_fallback',
                            confidence: 0.1,
                            bespokeRuleUsed: false,
                            extractionTime: 0
                        }
                    },
                    cache_hit: false,
                    retry_count: 0
                }
            };
        } catch (error) {
            throw new Error(`Emergency fallback failed: ${error}`);
        }
    }

    /**
     * Extract domain from URL
     */
    private extractDomain(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace(/^www\./, '');
        } catch {
            return url;
        }
    }

    /**
     * Create selector summary for metadata
     */
    private getSelectorSummary(selectors: any): Record<string, string> {
        const summary: Record<string, string> = {};

        for (const [field, fieldSelectors] of Object.entries(selectors)) {
            if (Array.isArray(fieldSelectors)) {
                summary[field] = fieldSelectors.join(', ');
            } else if (typeof fieldSelectors === 'string') {
                summary[field] = fieldSelectors;
            }
        }

        return summary;
    }

    /**
     * Guess region from domain
     */
    private guessRegionFromDomain(domain: string): string {
        if (domain.endsWith('.uk') || domain.includes('bbc')) return 'uk';
        if (domain.endsWith('.de')) return 'de';
        if (domain.endsWith('.fr')) return 'fr';
        if (domain.includes('cnn') || domain.includes('ap')) return 'us';
        if (domain.endsWith('.no') || domain.endsWith('.se') || domain.endsWith('.dk')) return 'scandinavian';
        return 'international';
    }

    /**
     * Get information about global detection capabilities
     */
    getCapabilitiesInfo(): {
        internationalSites: number;
        contentPlatforms: number;
        supportedRegions: string[];
        supportedPlatforms: string[];
        totalDomains: number;
    } {
        if (!this.isInitialized) {
            return {
                internationalSites: 0,
                contentPlatforms: 0,
                supportedRegions: [],
                supportedPlatforms: [],
                totalDomains: 0
            };
        }

        const stats = internationalRulesLoader.getStatistics();
        return {
            internationalSites: stats.newsSites,
            contentPlatforms: stats.contentPlatforms,
            supportedRegions: stats.regions,
            supportedPlatforms: stats.platforms,
            totalDomains: stats.supportedDomains
        };
    }

    /**
     * Check if domain is supported by international rules
     */
    isDomainSupported(domain: string): boolean {
        return internationalRulesLoader.isDomainSupported(domain);
    }
}