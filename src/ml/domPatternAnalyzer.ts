/**
 * Phase 4B.1 - ML-based DOM Pattern Analysis System
 * Automatically analyzes DOM structures to generate optimal extraction selectors
 */

import type {Page} from 'playwright';

export interface ElementData {
    tagName: string;
    className: string;
    id: string;
    textContent: string;
}

export interface DOMFeatures {
    // Element identification features
    tagName: string;
    classNames: string[];
    id?: string;

    // Content features
    textLength: number;
    hasText: boolean;
    textDensity: number; // text length / element size

    // Structural features
    depth: number;
    siblingCount: number;
    childCount: number;
    parentTagName: string;

    // Semantic features
    semanticScore: number; // How likely this is article content
    headingLevel?: number; // h1-h6 level
    isStructuredData: boolean;

    // Visual features (estimated)
    estimatedWidth: number;
    estimatedHeight: number;
    isVisible: boolean;

    // Content type indicators
    containsDate: boolean;
    containsAuthor: boolean;
    containsTime: boolean;
    hasLinks: boolean;
    hasParagraphs: boolean;

    // Language features
    language?: string;
    wordCount: number;
    sentenceCount: number;
}

export interface ExtractedPattern {
    field: 'title' | 'content' | 'author' | 'date' | 'summary';
    selectors: string[];
    confidence: number;
    features: DOMFeatures;
    reasoning: string[];
    alternatives: Array<{
        selector: string;
        confidence: number;
        reasoning: string;
    }>;
}

export interface DOMAnalysisResult {
    url: string;
    domain: string;
    patterns: ExtractedPattern[];
    overallConfidence: number;
    analysisMetadata: {
        elementsAnalyzed: number;
        analysisTime: number;
        uniqueSelectors: number;
        structuredDataFound: boolean;
    };
}

export class DOMPatternAnalyzer {
    private semanticKeywords: Record<string, string[]> = {
        title: [
            'title', 'headline', 'header', 'heading', 'subject',
            'tittel', 'overskrift' // Norwegian
        ],
        content: [
            'content', 'body', 'article', 'text', 'story', 'post',
            'innhold', 'tekst', 'artikkel' // Norwegian
        ],
        author: [
            'author', 'byline', 'writer', 'journalist', 'by',
            'forfatter', 'skrevet', 'av' // Norwegian
        ],
        date: [
            'date', 'time', 'published', 'timestamp', 'when',
            'dato', 'tid', 'publisert' // Norwegian
        ],
        summary: [
            'summary', 'excerpt', 'abstract', 'lead', 'intro',
            'sammendrag', 'ingress', 'utdrag' // Norwegian
        ]
    };

    private structuredDataSelectors = [
        '[itemscope]',
        '[typeof]',
        'script[type="application/ld+json"]',
        'meta[property^="og:"]',
        'meta[name^="twitter:"]',
        'meta[name="description"]'
    ];

    /**
     * Analyze a page's DOM structure to extract content patterns
     */
    async analyzePage(page: Page): Promise<DOMAnalysisResult> {
        console.log('🔍 Starting ML-based DOM pattern analysis...');
        const startTime = Date.now();

        const url = page.url();
        const domain = this.extractDomain(url);

        // Extract all relevant elements and their features
        const elements = await this.extractElementFeatures(page);
        console.log(`📊 Analyzed ${elements.length} DOM elements`);

        // Check for structured data
        const structuredDataFound = await this.detectStructuredData(page);

        // Generate patterns for each content field
        const patterns: ExtractedPattern[] = [];

        for (const field of ['title', 'content', 'author', 'date', 'summary'] as const) {
            const pattern = await this.generateFieldPattern(field, elements, page);
            if (pattern) {
                patterns.push(pattern);
            }
        }

        const analysisTime = Date.now() - startTime;
        const overallConfidence = patterns.length > 0
            ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
            : 0;

        console.log(`✅ DOM analysis complete in ${analysisTime}ms. Generated ${patterns.length} patterns with ${(overallConfidence * 100).toFixed(1)}% confidence`);

        return {
            url,
            domain,
            patterns,
            overallConfidence,
            analysisMetadata: {
                elementsAnalyzed: elements.length,
                analysisTime,
                uniqueSelectors: new Set(patterns.flatMap(p => p.selectors)).size,
                structuredDataFound
            }
        };
    }

    /**
     * Extract features from all relevant DOM elements
     */
    private async extractElementFeatures(page: Page): Promise<Array<DOMFeatures & {
        selector: string;
        element: ElementData
    }>> {
        return await page.evaluate(() => {
            const features: Array<DOMFeatures & { selector: string; element: ElementData }> = [];

            // Get all potentially relevant elements
            const candidates = document.querySelectorAll(
                'h1, h2, h3, h4, h5, h6, p, div, span, article, section, header, time, .author, .byline, .date, .title, .content, .summary, [class*="title"], [class*="content"], [class*="author"], [class*="date"], [class*="summary"]'
            );

            candidates.forEach((element, _index) => {
                try {
                    const rect = element.getBoundingClientRect();
                    const text = element.textContent?.trim() || '';
                    const html = element.innerHTML;

                    // Generate unique selector
                    const selector = generateUniqueSelector(element);

                    // Extract comprehensive features
                    const feature: DOMFeatures & { selector: string; element: ElementData } = {
                        selector,
                        element: {
                            tagName: element.tagName.toLowerCase(),
                            className: element.className,
                            id: element.id,
                            textContent: text.slice(0, 500) // Limit for analysis
                        },

                        // Element identification
                        tagName: element.tagName.toLowerCase(),
                        classNames: Array.from(element.classList),
                        id: element.id || undefined,

                        // Content features
                        textLength: text.length,
                        hasText: text.length > 0,
                        textDensity: text.length / Math.max(html.length, 1),

                        // Structural features
                        depth: getElementDepth(element),
                        siblingCount: element.parentElement?.children.length || 0,
                        childCount: element.children.length,
                        parentTagName: element.parentElement?.tagName.toLowerCase() || '',

                        // Semantic analysis
                        semanticScore: calculateSemanticScore(element),
                        headingLevel: getHeadingLevel(element),
                        isStructuredData: hasStructuredData(element),

                        // Visual features
                        estimatedWidth: rect.width,
                        estimatedHeight: rect.height,
                        isVisible: rect.width > 0 && rect.height > 0 &&
                            getComputedStyle(element).visibility !== 'hidden',

                        // Content type detection
                        containsDate: containsDatePattern(text),
                        containsAuthor: containsAuthorPattern(text),
                        containsTime: containsTimePattern(text),
                        hasLinks: element.querySelectorAll('a').length > 0,
                        hasParagraphs: element.querySelectorAll('p').length > 0,

                        // Language analysis
                        language: detectLanguage(text),
                        wordCount: countWords(text),
                        sentenceCount: countSentences(text)
                    };

                    features.push(feature);
                } catch (error) {
                    console.warn('Error analyzing element:', error);
                }
            });

            return features;

            // Helper functions
            function generateUniqueSelector(element: Element): string {
                if (element.id) {
                    return `#${element.id}`;
                }

                const path: string[] = [];
                let current: Element | null = element;

                while (current && current !== document.body) {
                    let selector = current.tagName.toLowerCase();

                    if (current.className) {
                        const classes = Array.from(current.classList)
                            .filter(cls => cls.length > 0 && !/^\\d/.test(cls))
                            .slice(0, 2);
                        if (classes.length > 0) {
                            selector += '.' + classes.join('.');
                        }
                    }

                    // Add nth-child if needed for uniqueness
                    const siblings = Array.from(current.parentElement?.children || [])
                        .filter(el => el.tagName === current!.tagName);
                    if (siblings.length > 1) {
                        const index = siblings.indexOf(current) + 1;
                        selector += `:nth-child(${index})`;
                    }

                    path.unshift(selector);
                    current = current.parentElement;
                }

                return path.join(' > ');
            }

            function getElementDepth(element: Element): number {
                let depth = 0;
                let current = element.parentElement;
                while (current && current !== document.body) {
                    depth++;
                    current = current.parentElement;
                }
                return depth;
            }

            function calculateSemanticScore(element: Element): number {
                let score = 0;
                const text = element.textContent?.toLowerCase() || '';
                const className = element.className.toLowerCase();
                const tagName = element.tagName.toLowerCase();

                // Tag-based scoring
                const tagScores: Record<string, number> = {
                    'h1': 0.9, 'h2': 0.8, 'h3': 0.7,
                    'article': 0.8, 'section': 0.6,
                    'p': 0.5, 'div': 0.3, 'span': 0.2
                };
                score += tagScores[tagName] || 0;

                // Class-based scoring
                if (className.includes('title') || className.includes('headline')) score += 0.3;
                if (className.includes('content') || className.includes('article')) score += 0.3;
                if (className.includes('author') || className.includes('byline')) score += 0.2;
                if (className.includes('date') || className.includes('time')) score += 0.2;

                // Content-based scoring
                if (text.length > 50) score += 0.1;
                if (text.length > 200) score += 0.1;
                if (text.length > 1000) score += 0.2;

                return Math.min(score, 1.0);
            }

            function getHeadingLevel(element: Element): number | undefined {
                const match = element.tagName.match(/^H([1-6])$/);
                return match ? parseInt(match[1]) : undefined;
            }

            function hasStructuredData(element: Element): boolean {
                return element.hasAttribute('itemscope') ||
                    element.hasAttribute('typeof') ||
                    element.querySelector('[itemscope], [typeof]') !== null;
            }

            function containsDatePattern(text: string): boolean {
                const datePatterns = [
                    /\\d{1,2}[.\\/\\-]\\d{1,2}[.\\/\\-]\\d{2,4}/, // Date formats
                    /\\d{4}[.\\/\\-]\\d{1,2}[.\\/\\-]\\d{1,2}/, // ISO-ish dates
                    /(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)/i, // Norwegian months
                    /(january|february|march|april|may|june|july|august|september|october|november|december)/i // English months
                ];
                return datePatterns.some(pattern => pattern.test(text));
            }

            function containsAuthorPattern(text: string): boolean {
                const authorPatterns = [
                    /^(av|by)\\s+[a-zA-ZæøåÆØÅ\\s]+$/i,
                    /journalist/i,
                    /redaktør/i,
                    /reporter/i
                ];
                return authorPatterns.some(pattern => pattern.test(text.trim()));
            }

            function containsTimePattern(text: string): boolean {
                return /\\d{1,2}[:.:]\\d{2}/.test(text);
            }

            function detectLanguage(text: string): string | undefined {
                const norwegianWords = ['og', 'i', 'til', 'av', 'på', 'er', 'det', 'som', 'en', 'for'];
                const englishWords = ['the', 'and', 'to', 'of', 'in', 'is', 'it', 'that', 'a', 'for'];

                const words = text.toLowerCase().split(/\\s+/);
                const norwegianMatches = words.filter(word => norwegianWords.includes(word)).length;
                const englishMatches = words.filter(word => englishWords.includes(word)).length;

                if (norwegianMatches > englishMatches && norwegianMatches > 2) return 'no';
                if (englishMatches > norwegianMatches && englishMatches > 2) return 'en';
                return undefined;
            }

            function countWords(text: string): number {
                return text.trim().split(/\\s+/).filter(word => word.length > 0).length;
            }

            function countSentences(text: string): number {
                return text.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0).length;
            }
        });
    }

    /**
     * Generate optimal selector pattern for a specific content field
     */
    private async generateFieldPattern(
        field: 'title' | 'content' | 'author' | 'date' | 'summary',
        elements: Array<DOMFeatures & { selector: string; element: ElementData }>,
        _page: Page
    ): Promise<ExtractedPattern | null> {
        console.log(`🎯 Generating pattern for ${field}...`);

        // Score elements for this specific field
        const scoredElements = elements.map(element => ({
            ...element,
            fieldScore: this.calculateFieldScore(field, element)
        })).filter(el => el.fieldScore > 0.1);

        if (scoredElements.length === 0) {
            console.log(`❌ No suitable elements found for ${field}`);
            return null;
        }

        // Sort by field-specific score
        scoredElements.sort((a, b) => b.fieldScore - a.fieldScore);

        // Take top candidates and generate selectors
        const topCandidates = scoredElements.slice(0, 5);
        const selectors: string[] = [];
        const reasoning: string[] = [];
        const alternatives: Array<{ selector: string; confidence: number; reasoning: string }> = [];

        // Primary selector (highest scoring)
        const primary = topCandidates[0];
        selectors.push(primary.selector);
        reasoning.push(`Primary: ${field} detected with ${(primary.fieldScore * 100).toFixed(1)}% confidence based on ${this.getScoreReasons(field, primary)}`);

        // Generate generalized selectors
        const generalizedSelectors = this.generateGeneralizedSelectors(field, primary);
        selectors.push(...generalizedSelectors);

        // Add alternatives
        for (let i = 1; i < Math.min(3, topCandidates.length); i++) {
            const alt = topCandidates[i];
            alternatives.push({
                selector: alt.selector,
                confidence: alt.fieldScore,
                reasoning: this.getScoreReasons(field, alt)
            });
        }

        const confidence = primary.fieldScore;

        console.log(`✅ Generated ${field} pattern with ${(confidence * 100).toFixed(1)}% confidence`);

        return {
            field,
            selectors,
            confidence,
            features: primary,
            reasoning,
            alternatives
        };
    }

    /**
     * Calculate field-specific score for an element
     */
    private calculateFieldScore(field: string, element: DOMFeatures): number {
        let score = 0;

        // Base semantic score
        score += element.semanticScore * 0.3;

        // Field-specific scoring
        switch (field) {
            case 'title':
                score += this.scoreTitleElement(element);
                break;
            case 'content':
                score += this.scoreContentElement(element);
                break;
            case 'author':
                score += this.scoreAuthorElement(element);
                break;
            case 'date':
                score += this.scoreDateElement(element);
                break;
            case 'summary':
                score += this.scoreSummaryElement(element);
                break;
        }

        return Math.min(score, 1.0);
    }

    private scoreTitleElement(element: DOMFeatures): number {
        let score = 0;

        // Heading tags are strong indicators
        if (element.headingLevel === 1) score += 0.8;
        else if (element.headingLevel === 2) score += 0.6;
        else if (element.headingLevel && element.headingLevel <= 3) score += 0.4;

        // Class/ID name matching
        const keywords = this.semanticKeywords.title;
        const classText = element.classNames.join(' ').toLowerCase();
        const idText = element.id?.toLowerCase() || '';

        if (keywords.some(kw => classText.includes(kw) || idText.includes(kw))) {
            score += 0.5;
        }

        // Content characteristics
        if (element.textLength > 10 && element.textLength < 200) score += 0.3;
        if (element.depth < 5) score += 0.2; // Titles are usually not deeply nested
        if (!element.hasLinks) score += 0.1; // Titles usually don't contain links

        return score;
    }

    private scoreContentElement(element: DOMFeatures): number {
        let score = 0;

        // Tag preferences
        if (element.tagName === 'article') score += 0.6;
        else if (element.tagName === 'section') score += 0.4;
        else if (element.tagName === 'div') score += 0.2;
        else if (element.tagName === 'p') score += 0.3;

        // Class/ID name matching
        const keywords = this.semanticKeywords.content;
        const classText = element.classNames.join(' ').toLowerCase();
        if (keywords.some(kw => classText.includes(kw))) {
            score += 0.4;
        }

        // Content characteristics
        if (element.textLength > 500) score += 0.4;
        if (element.textLength > 1000) score += 0.2;
        if (element.hasParagraphs) score += 0.3;
        if (element.wordCount > 50) score += 0.2;
        if (element.sentenceCount > 3) score += 0.2;

        return score;
    }

    private scoreAuthorElement(element: DOMFeatures): number {
        let score = 0;

        // Class/ID name matching
        const keywords = this.semanticKeywords.author;
        const classText = element.classNames.join(' ').toLowerCase();
        const idText = element.id?.toLowerCase() || '';

        if (keywords.some(kw => classText.includes(kw) || idText.includes(kw))) {
            score += 0.6;
        }

        // Content pattern matching
        if (element.containsAuthor) score += 0.5;

        // Length characteristics
        if (element.textLength > 5 && element.textLength < 100) score += 0.3;
        if (element.wordCount >= 2 && element.wordCount <= 5) score += 0.2;

        return score;
    }

    private scoreDateElement(element: DOMFeatures): number {
        let score = 0;

        // Tag preferences
        if (element.tagName === 'time') score += 0.8;

        // Class/ID name matching
        const keywords = this.semanticKeywords.date;
        const classText = element.classNames.join(' ').toLowerCase();
        const idText = element.id?.toLowerCase() || '';

        if (keywords.some(kw => classText.includes(kw) || idText.includes(kw))) {
            score += 0.5;
        }

        // Content pattern matching
        if (element.containsDate) score += 0.6;
        if (element.containsTime) score += 0.3;

        // Length characteristics
        if (element.textLength > 5 && element.textLength < 50) score += 0.2;

        return score;
    }

    private scoreSummaryElement(element: DOMFeatures): number {
        let score = 0;

        // Class/ID name matching
        const keywords = this.semanticKeywords.summary;
        const classText = element.classNames.join(' ').toLowerCase();
        const idText = element.id?.toLowerCase() || '';

        if (keywords.some(kw => classText.includes(kw) || idText.includes(kw))) {
            score += 0.6;
        }

        // Content characteristics
        if (element.textLength > 50 && element.textLength < 500) score += 0.4;
        if (element.wordCount > 10 && element.wordCount < 100) score += 0.3;
        if (element.sentenceCount >= 2 && element.sentenceCount <= 5) score += 0.2;

        return score;
    }

    /**
     * Generate generalized selectors that work across similar elements
     */
    private generateGeneralizedSelectors(field: string, element: DOMFeatures & { selector: string }): string[] {
        const selectors: string[] = [];

        // Tag-based selectors
        if (field === 'title' && element.headingLevel) {
            selectors.push(`h${element.headingLevel}`);
        }

        // Class-based selectors
        if (element.classNames.length > 0) {
            const relevantClasses = element.classNames.filter(cls =>
                this.semanticKeywords[field].some(kw => cls.toLowerCase().includes(kw))
            );

            if (relevantClasses.length > 0) {
                selectors.push(`.${relevantClasses[0]}`);
                if (relevantClasses.length > 1) {
                    selectors.push(`.${relevantClasses.slice(0, 2).join('.')}`);
                }
            }
        }

        // Semantic selectors
        const semanticSelectors = this.semanticKeywords[field].map(kw =>
            `[class*="${kw}"], [id*="${kw}"]`
        );
        selectors.push(...semanticSelectors.slice(0, 2));

        return selectors;
    }

    /**
     * Get human-readable reasons for scoring
     */
    private getScoreReasons(field: string, element: DOMFeatures): string {
        const reasons: string[] = [];

        if (element.headingLevel) reasons.push(`H${element.headingLevel} tag`);
        if (element.semanticScore > 0.5) reasons.push('semantic HTML structure');
        if (element.isStructuredData) reasons.push('structured data');

        const keywords = this.semanticKeywords[field];
        const classMatches = element.classNames.filter(cls =>
            keywords.some(kw => cls.toLowerCase().includes(kw))
        );
        if (classMatches.length > 0) reasons.push(`class names: ${classMatches.join(', ')}`);

        if (field === 'content' && element.textLength > 500) reasons.push('substantial text content');
        if (field === 'author' && element.containsAuthor) reasons.push('author pattern detected');
        if (field === 'date' && element.containsDate) reasons.push('date pattern detected');

        return reasons.join(', ') || 'general DOM analysis';
    }

    /**
     * Detect structured data on the page
     */
    private async detectStructuredData(page: Page): Promise<boolean> {
        return await page.evaluate((selectors) => {
            return selectors.some(selector => document.querySelector(selector) !== null);
        }, this.structuredDataSelectors);
    }

    /**
     * Extract domain from URL
     */
    private extractDomain(url: string): string {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch {
            return 'unknown';
        }
    }
}