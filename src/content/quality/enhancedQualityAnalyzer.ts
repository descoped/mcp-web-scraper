/**
 * Enhanced Content Quality Analyzer for Phase 3 Quality & Optimization
 * Provides advanced content quality metrics beyond basic scoring
 */

import {Page} from 'playwright';
import {ExtractionResult} from '../types';

export interface EnhancedContentQuality {
    // Basic metrics (existing)
    contentLength: number;
    wordCount: number;
    paragraphCount: number;
    textDensity: number;
    linkDensity: number;
    metadataComplete: boolean;
    cleanContent: boolean;
    score: number;

    // Enhanced metrics (new)
    articleIndicators: ArticleIndicators;
    contentStructure: ContentStructure;
    languageAnalysis: LanguageAnalysis;
    readabilityMetrics: ReadabilityMetrics;
    extractionQuality: ExtractionQuality;
    frontpageRisk: FrontpageRisk;
}

export interface ArticleIndicators {
    hasStructuredData: boolean;
    hasArticleSchema: boolean;
    hasOpenGraphArticle: boolean;
    hasCanonicalUrl: boolean;
    hasPublishDate: boolean;
    hasAuthorInfo: boolean;
    hasDateInfo: boolean;
    singleArticleScore: number; // 0-1 indicating single article vs frontpage
}

export interface ContentStructure {
    hasMainContent: boolean;
    contentDepth: number; // Average nesting level of content
    headerHierarchy: number[]; // Count of h1, h2, h3, etc.
    mediaElements: {
        images: number;
        videos: number;
        embeds: number;
    };
    navigationElements: number;
    advertisingElements: number;
}

export interface LanguageAnalysis {
    detectedLanguage: string | null;
    isNorwegian: boolean;
    norwegianIndicators: {
        hasNorwegianCharacters: boolean; // æ, ø, å
        hasNorwegianPhrases: boolean; // Common Norwegian phrases
        hasNorwegianDateFormat: boolean; // "15. januar 2024"
    };
    contentLanguageConsistency: number; // 0-1
}

export interface ReadabilityMetrics {
    averageWordsPerSentence: number;
    averageSyllablesPerWord: number;
    fleschKincaidGradeLevel: number;
    contentComplexity: 'simple' | 'moderate' | 'complex';
    hasLongParagraphs: boolean;
}

export interface ExtractionQuality {
    titleQuality: number; // 0-1 based on length, capitalization, etc.
    contentQuality: number; // 0-1 based on structure, completeness
    metadataQuality: number; // 0-1 based on author, date presence/format
    extractionMethod: string;
    confidence: number;
    bespokeRuleUsed: boolean;
    extractionTime: number;
}

export interface FrontpageRisk {
    risk: 'low' | 'medium' | 'high';
    riskScore: number; // 0-1, higher = more likely to be frontpage
    indicators: {
        multipleHeadlines: boolean;
        navigationHeavy: boolean;
        categoryLinks: boolean;
        articleListStructure: boolean;
        noSingleArticleContent: boolean;
    };
    recommendation: 'extract' | 'warn' | 'reject';
}

export class EnhancedQualityAnalyzer {

    async analyzeContentQuality(
        page: Page,
        extractedData: Partial<ExtractionResult['data']>,
        extractionResult: ExtractionResult
    ): Promise<EnhancedContentQuality> {

        const [
            articleIndicators,
            contentStructure,
            languageAnalysis,
            readabilityMetrics,
            frontpageRisk
        ] = await Promise.all([
            this.analyzeArticleIndicators(page),
            this.analyzeContentStructure(page),
            this.analyzeLanguage(page, extractedData),
            this.analyzeReadability(extractedData),
            this.analyzeFrontpageRisk(page, extractedData)
        ]);

        const extractionQuality = this.analyzeExtractionQuality(extractedData, extractionResult);

        // Calculate basic metrics (maintaining compatibility)
        const basicMetrics = await this.calculateBasicMetrics(page, extractedData);

        // Calculate enhanced overall score
        const enhancedScore = this.calculateEnhancedScore({
            articleIndicators,
            contentStructure,
            languageAnalysis,
            readabilityMetrics,
            extractionQuality,
            frontpageRisk,
            basicMetrics
        });

        return {
            // Basic metrics
            ...basicMetrics,
            score: enhancedScore,

            // Enhanced metrics
            articleIndicators,
            contentStructure,
            languageAnalysis,
            readabilityMetrics,
            extractionQuality,
            frontpageRisk
        };
    }

    private async analyzeArticleIndicators(page: Page): Promise<ArticleIndicators> {
        return await page.evaluate(() => {
            // Check for structured data
            const hasJsonLd = !!document.querySelector('script[type="application/ld+json"]');
            const hasArticleSchema = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
                .some(script => {
                    try {
                        const data = JSON.parse(script.textContent || '');
                        const items = Array.isArray(data) ? data : [data];
                        return items.some(item => item['@type'] === 'Article' || item['@type'] === 'NewsArticle');
                    } catch {
                        return false;
                    }
                });

            const hasOpenGraphArticle = !!document.querySelector('meta[property="og:type"][content="article"]');
            const hasCanonicalUrl = !!document.querySelector('link[rel="canonical"]');
            const hasPublishDate = !!(
                document.querySelector('time[datetime]') ||
                document.querySelector('[itemprop="datePublished"]') ||
                document.querySelector('meta[property="article:published_time"]')
            );
            const hasAuthorInfo = !!(
                document.querySelector('[itemprop="author"]') ||
                document.querySelector('meta[property="article:author"]') ||
                document.querySelector('[rel="author"]')
            );

            // Calculate single article score
            let singleArticleScore = 0;
            if (hasArticleSchema) singleArticleScore += 0.3;
            if (hasOpenGraphArticle) singleArticleScore += 0.2;
            if (hasPublishDate) singleArticleScore += 0.2;
            if (hasAuthorInfo) singleArticleScore += 0.2;
            if (document.querySelectorAll('h1').length === 1) singleArticleScore += 0.1;

            return {
                hasStructuredData: hasJsonLd,
                hasArticleSchema,
                hasOpenGraphArticle,
                hasCanonicalUrl,
                hasPublishDate,
                hasAuthorInfo,
                hasDateInfo: hasPublishDate || !!document.querySelector('time, .date, .published'),
                singleArticleScore: Math.min(singleArticleScore, 1)
            };
        });
    }

    private async analyzeContentStructure(page: Page): Promise<ContentStructure> {
        return await page.evaluate(() => {
            const article = document.querySelector('article') ||
                document.querySelector('main') ||
                document.body;

            const hasMainContent = !!(
                document.querySelector('article') ||
                document.querySelector('main') ||
                document.querySelector('[role="main"]')
            );

            // Calculate content depth
            const contentElements = article.querySelectorAll('p, div, section');
            let totalDepth = 0;
            contentElements.forEach(el => {
                let depth = 0;
                let parent = el.parentElement;
                while (parent && parent !== document.body) {
                    depth++;
                    parent = parent.parentElement;
                }
                totalDepth += depth;
            });
            const contentDepth = contentElements.length > 0 ? totalDepth / contentElements.length : 0;

            // Header hierarchy
            const headerHierarchy = [
                document.querySelectorAll('h1').length,
                document.querySelectorAll('h2').length,
                document.querySelectorAll('h3').length,
                document.querySelectorAll('h4').length,
                document.querySelectorAll('h5').length,
                document.querySelectorAll('h6').length
            ];

            // Media elements
            const mediaElements = {
                images: document.querySelectorAll('img').length,
                videos: document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length,
                embeds: document.querySelectorAll('embed, object, iframe').length
            };

            // Navigation and advertising
            const navigationElements = document.querySelectorAll('nav, .nav, .navigation, .menu').length;
            const advertisingElements = document.querySelectorAll('.ad, .advertisement, [data-ad], .banner').length;

            return {
                hasMainContent,
                contentDepth,
                headerHierarchy,
                mediaElements,
                navigationElements,
                advertisingElements
            };
        });
    }

    private async analyzeLanguage(page: Page, extractedData: Partial<ExtractionResult['data']>): Promise<LanguageAnalysis> {
        const content = extractedData.content || '';
        const title = extractedData.title || '';
        const allText = `${title} ${content}`.toLowerCase();

        // Detect Norwegian characteristics
        const hasNorwegianCharacters = /[æøå]/.test(allText);
        const norwegianPhrases = [
            'og', 'til', 'som', 'for', 'med', 'det', 'en', 'av', 'har', 'var',
            'les også', 'se video', 'publisert', 'skrevet av', 'oppdatert'
        ];
        const hasNorwegianPhrases = norwegianPhrases.some(phrase => allText.includes(phrase));

        const norwegianDatePattern = /\d{1,2}\.\s+(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\s+\d{4}/;
        const hasNorwegianDateFormat = norwegianDatePattern.test(allText);

        const isNorwegian = hasNorwegianCharacters || (hasNorwegianPhrases && hasNorwegianDateFormat);

        // Get page language
        const detectedLanguage = await page.getAttribute('html', 'lang');

        return {
            detectedLanguage,
            isNorwegian,
            norwegianIndicators: {
                hasNorwegianCharacters,
                hasNorwegianPhrases,
                hasNorwegianDateFormat
            },
            contentLanguageConsistency: (detectedLanguage === 'no' || detectedLanguage === 'nb') && isNorwegian ? 1 : 0.5
        };
    }

    private analyzeReadability(extractedData: Partial<ExtractionResult['data']>): ReadabilityMetrics {
        const content = extractedData.content || '';

        if (!content) {
            return {
                averageWordsPerSentence: 0,
                averageSyllablesPerWord: 0,
                fleschKincaidGradeLevel: 0,
                contentComplexity: 'simple',
                hasLongParagraphs: false
            };
        }

        // Basic readability analysis
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const words = content.split(/\s+/).filter(w => w.length > 0);
        const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);

        const averageWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;

        // Simple syllable counting (approximation)
        const averageSyllablesPerWord = words.length > 0 ?
            words.reduce((sum, word) => sum + this.countSyllables(word), 0) / words.length : 0;

        // Flesch-Kincaid Grade Level (simplified)
        const fleschKincaidGradeLevel = sentences.length > 0 ?
            (0.39 * averageWordsPerSentence) + (11.8 * averageSyllablesPerWord) - 15.59 : 0;

        // Content complexity assessment
        let contentComplexity: 'simple' | 'moderate' | 'complex' = 'simple';
        if (fleschKincaidGradeLevel > 13) contentComplexity = 'complex';
        else if (fleschKincaidGradeLevel > 9) contentComplexity = 'moderate';

        // Check for long paragraphs
        const hasLongParagraphs = paragraphs.some(p => p.split(/\s+/).length > 100);

        return {
            averageWordsPerSentence,
            averageSyllablesPerWord,
            fleschKincaidGradeLevel,
            contentComplexity,
            hasLongParagraphs
        };
    }

    private countSyllables(word: string): number {
        // Simple syllable counting heuristic
        word = word.toLowerCase();
        if (word.length <= 3) return 1;

        const vowels = word.match(/[aeiouyæøå]/g);
        const vowelCount = vowels ? vowels.length : 1;

        // Adjust for common endings
        if (word.endsWith('e')) return Math.max(1, vowelCount - 1);
        if (word.endsWith('ed')) return Math.max(1, vowelCount - 1);
        if (word.endsWith('es')) return Math.max(1, vowelCount - 1);

        return Math.max(1, vowelCount);
    }

    private async analyzeFrontpageRisk(page: Page, extractedData: Partial<ExtractionResult['data']>): Promise<FrontpageRisk> {
        const indicators = await page.evaluate(() => {
            // Check for multiple headlines
            const h1Count = document.querySelectorAll('h1').length;
            const h2Count = document.querySelectorAll('h2').length;
            const multipleHeadlines = h1Count > 1 || h2Count > 5;

            // Check for navigation heavy content
            const navElements = document.querySelectorAll('nav, .nav, .navigation, .menu').length;
            const totalElements = document.querySelectorAll('*').length;
            const navigationHeavy = navElements > 3 || (navElements / totalElements) > 0.1;

            // Check for category links
            const categoryLinks = document.querySelectorAll('a[href*="/category/"], a[href*="/section/"], a[href*="/topic/"]').length > 3;

            // Check for article list structure
            const listElements = document.querySelectorAll('ul, ol, .article-list, .news-list').length;
            const articleLinks = document.querySelectorAll('a[href*="/article/"], a[href*="/story/"], a[href*="/news/"]').length;
            const articleListStructure = listElements > 2 && articleLinks > 5;

            // Check if we have single article content
            const hasMainArticle = !!(
                document.querySelector('article') ||
                document.querySelector('[itemtype*="Article"]') ||
                document.querySelector('meta[property="og:type"][content="article"]')
            );
            const noSingleArticleContent = !hasMainArticle;

            return {
                multipleHeadlines,
                navigationHeavy,
                categoryLinks,
                articleListStructure,
                noSingleArticleContent
            };
        });

        // Calculate risk score
        let riskScore = 0;
        if (indicators.multipleHeadlines) riskScore += 0.3;
        if (indicators.navigationHeavy) riskScore += 0.2;
        if (indicators.categoryLinks) riskScore += 0.2;
        if (indicators.articleListStructure) riskScore += 0.2;
        if (indicators.noSingleArticleContent) riskScore += 0.1;

        // Additional risk factors from extracted data
        const hasMinimalContent = !extractedData.content || extractedData.content.length < 200;
        const hasNoMetadata = !extractedData.author && !extractedData.date;
        if (hasMinimalContent) riskScore += 0.1;
        if (hasNoMetadata) riskScore += 0.1;

        // Determine risk level and recommendation
        let risk: 'low' | 'medium' | 'high' = 'low';
        let recommendation: 'extract' | 'warn' | 'reject' = 'extract';

        if (riskScore >= 0.7) {
            risk = 'high';
            recommendation = 'reject';
        } else if (riskScore >= 0.4) {
            risk = 'medium';
            recommendation = 'warn';
        }

        return {
            risk,
            riskScore,
            indicators,
            recommendation
        };
    }

    private analyzeExtractionQuality(
        extractedData: Partial<ExtractionResult['data']>,
        extractionResult: ExtractionResult
    ): ExtractionQuality {

        // Title quality assessment
        const title = extractedData.title || '';
        let titleQuality = 0;
        if (title.length > 10 && title.length < 200) titleQuality += 0.4;
        if (title.charAt(0) === title.charAt(0).toUpperCase()) titleQuality += 0.2;
        if (!title.includes('|') && !title.includes('-')) titleQuality += 0.2; // Not likely to be nav/meta title
        if (!/^(home|news|category|section)/i.test(title)) titleQuality += 0.2;

        // Content quality assessment
        const content = extractedData.content || '';
        let contentQuality = 0;
        if (content.length > 200) contentQuality += 0.3;
        if (content.split(/\n\s*\n/).length > 2) contentQuality += 0.2; // Multiple paragraphs
        if (content.split(/[.!?]/).length > 5) contentQuality += 0.2; // Multiple sentences
        if (!/click here|read more|continue reading/i.test(content)) contentQuality += 0.3; // Not navigation text

        // Metadata quality assessment
        let metadataQuality = 0;
        if (extractedData.author) metadataQuality += 0.4;
        if (extractedData.date) metadataQuality += 0.4;
        if (extractedData.summary) metadataQuality += 0.2;

        return {
            titleQuality,
            contentQuality,
            metadataQuality,
            extractionMethod: extractionResult.method,
            confidence: extractionResult.confidence,
            bespokeRuleUsed: extractionResult.method.startsWith('bespoke-'),
            extractionTime: extractionResult.metadata.extraction_time || 0
        };
    }

    private async calculateBasicMetrics(page: Page, extractedData: Partial<ExtractionResult['data']>) {
        const content = extractedData.content || '';
        const contentLength = content.length;
        const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
        const paragraphCount = (content.match(/\n\s*\n/g) || []).length + 1;

        // Get density metrics from page
        const densityData = await page.evaluate(() => {
            const article = document.querySelector('article') ||
                document.querySelector('main') ||
                document.querySelector('[role="article"]') ||
                document.body;

            const textLength = article.textContent?.length || 0;
            const htmlLength = article.innerHTML?.length || 1;
            const linkElements = article.querySelectorAll('a');
            const linkTextLength = Array.from(linkElements)
                .reduce((sum, link) => sum + (link.textContent?.length || 0), 0);

            return {
                textDensity: textLength / htmlLength,
                linkDensity: textLength > 0 ? linkTextLength / textLength : 0
            };
        });

        const metadataComplete = !!(extractedData.title && (extractedData.author || extractedData.date));
        const cleanContent = densityData.linkDensity < 0.3 && densityData.textDensity > 0.25;

        return {
            contentLength,
            wordCount,
            paragraphCount,
            textDensity: densityData.textDensity,
            linkDensity: densityData.linkDensity,
            metadataComplete,
            cleanContent
        };
    }

    private calculateEnhancedScore(metrics: {
        articleIndicators: ArticleIndicators;
        contentStructure: ContentStructure;
        languageAnalysis: LanguageAnalysis;
        readabilityMetrics: ReadabilityMetrics;
        extractionQuality: ExtractionQuality;
        frontpageRisk: FrontpageRisk;
        basicMetrics: any;
    }): number {

        let score = 0;
        const weights = {
            articleIndicators: 0.25,
            extractionQuality: 0.25,
            frontpageRisk: 0.20,
            contentStructure: 0.15,
            basicMetrics: 0.10,
            languageAnalysis: 0.05
        };

        // Article indicators score
        score += metrics.articleIndicators.singleArticleScore * weights.articleIndicators;

        // Extraction quality score
        const avgExtractionQuality = (
            metrics.extractionQuality.titleQuality +
            metrics.extractionQuality.contentQuality +
            metrics.extractionQuality.metadataQuality
        ) / 3;
        score += avgExtractionQuality * weights.extractionQuality;

        // Frontpage risk penalty
        const frontpageBonus = Math.max(0, 1 - metrics.frontpageRisk.riskScore);
        score += frontpageBonus * weights.frontpageRisk;

        // Content structure score
        const structureScore = Math.min(1, (
            (metrics.contentStructure.hasMainContent ? 0.3 : 0) +
            (metrics.contentStructure.headerHierarchy[0] === 1 ? 0.2 : 0) + // Single h1
            (metrics.contentStructure.mediaElements.images > 0 ? 0.1 : 0) +
            (metrics.contentStructure.navigationElements < 3 ? 0.2 : 0) +
            (metrics.contentStructure.advertisingElements < 2 ? 0.2 : 0)
        ));
        score += structureScore * weights.contentStructure;

        // Basic metrics score (existing logic)
        let basicScore = 0;
        basicScore += metrics.basicMetrics.wordCount > 100 ? 0.25 : (metrics.basicMetrics.wordCount / 100) * 0.25;
        basicScore += metrics.basicMetrics.paragraphCount > 2 ? 0.2 : (metrics.basicMetrics.paragraphCount / 2) * 0.2;
        basicScore += Math.min(metrics.basicMetrics.textDensity * 4, 1) * 0.2;
        basicScore += metrics.basicMetrics.linkDensity < 0.3 ? 0.15 : Math.max(0, (0.3 - metrics.basicMetrics.linkDensity) / 0.3) * 0.15;
        basicScore += metrics.basicMetrics.metadataComplete ? 0.2 : 0;
        score += Math.min(basicScore, 1) * weights.basicMetrics;

        // Language analysis bonus
        const languageBonus = metrics.languageAnalysis.isNorwegian ?
            metrics.languageAnalysis.contentLanguageConsistency : 0.5;
        score += languageBonus * weights.languageAnalysis;

        return Math.min(score, 1);
    }
}