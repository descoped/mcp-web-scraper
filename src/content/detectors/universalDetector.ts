/**
 * Universal content detector - Tier 1 patterns
 * Targets >80% accuracy across all sites using structured data and semantic HTML5
 */

import {Page} from 'playwright';
import {ContentQuality, DetectionContext, DetectionPattern, DetectionTier, ExtractionResult} from '../types';

export class UniversalDetector {
    private readonly structuredDataPatterns: DetectionPattern[] = [
        {
            name: 'json-ld-article',
            tier: DetectionTier.UNIVERSAL,
            selectors: ['script[type="application/ld+json"]'],
            weight: 1.0,
            description: 'Schema.org JSON-LD Article markup'
        },
        {
            name: 'microdata-article',
            tier: DetectionTier.UNIVERSAL,
            selectors: ['[itemscope][itemtype*="Article"]', '[itemscope][itemtype*="NewsArticle"]'],
            weight: 0.95,
            description: 'Schema.org Microdata Article'
        },
        {
            name: 'opengraph-article',
            tier: DetectionTier.UNIVERSAL,
            selectors: ['meta[property="og:type"][content="article"]'],
            weight: 0.85,
            description: 'OpenGraph article metadata'
        }
    ];

    private readonly semanticPatterns: DetectionPattern[] = [
        {
            name: 'html5-article',
            tier: DetectionTier.UNIVERSAL,
            selectors: ['article'],
            weight: 0.9,
            description: 'HTML5 semantic article element'
        },
        {
            name: 'html5-main',
            tier: DetectionTier.UNIVERSAL,
            selectors: ['main'],
            weight: 0.8,
            description: 'HTML5 semantic main element'
        },
        {
            name: 'aria-article',
            tier: DetectionTier.UNIVERSAL,
            selectors: ['[role="article"]', '[role="main"]'],
            weight: 0.75,
            description: 'ARIA role-based article identification'
        }
    ];

    async detectContext(page: Page): Promise<DetectionContext> {
        const context: DetectionContext = {
            url: page.url(),
            hasStructuredData: false,
            isHtml5: false
        };

        try {
            // Detect document type
            const doctype = await page.evaluate(() => {
                const dt = document.doctype;
                if (!dt) return null;
                return `<!DOCTYPE ${dt.name}${dt.publicId ? ` PUBLIC "${dt.publicId}"` : ''}${dt.systemId ? ` "${dt.systemId}"` : ''}>`;
            });

            context.doctype = doctype || undefined;
            context.isHtml5 = !!(doctype?.includes('html') && !doctype.includes('PUBLIC'));

            // Check for structured data
            const hasJsonLd = await page.locator('script[type="application/ld+json"]').count() > 0;
            const hasMicrodata = await page.locator('[itemscope][itemtype*="Article"]').count() > 0;
            const hasOpenGraph = await page.locator('meta[property="og:type"][content="article"]').count() > 0;

            context.hasStructuredData = !!(hasJsonLd || hasMicrodata || hasOpenGraph);

            // Detect language and charset
            const lang = await page.getAttribute('html', 'lang');
            context.language = lang || undefined;
            context.charset = await page.evaluate(() => {
                const meta = document.querySelector('meta[charset]');
                return meta?.getAttribute('charset') ||
                    document.querySelector('meta[http-equiv="Content-Type"]')?.getAttribute('content')?.match(/charset=([^;]+)/)?.[1];
            }) || undefined;

        } catch (error) {
            console.warn('Error detecting page context:', error);
        }

        return context;
    }

    async extractStructuredData(page: Page): Promise<Partial<ExtractionResult['data']>> {
        const result: Partial<ExtractionResult['data']> = {};

        try {
            // Extract JSON-LD data
            const jsonLdData = await page.evaluate(() => {
                const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
                for (const script of scripts) {
                    try {
                        const data = JSON.parse(script.textContent || '');
                        // Handle both single objects and arrays
                        const items = Array.isArray(data) ? data : [data];

                        for (const item of items) {
                            if (item['@type'] === 'Article' || item['@type'] === 'NewsArticle') {
                                return {
                                    title: item.headline || item.name,
                                    content: item.articleBody,
                                    author: item.author?.name || (Array.isArray(item.author) ? item.author[0]?.name : undefined),
                                    date: item.datePublished || item.dateCreated,
                                    summary: item.description
                                };
                            }
                        }
                    } catch (e) {
                        continue;
                    }
                }
                return null;
            });

            if (jsonLdData) {
                Object.assign(result, jsonLdData);
            }

            // Extract Microdata if JSON-LD not found
            if (!result.title || !result.content) {
                const microdataData = await page.evaluate(() => {
                    const article = document.querySelector('[itemscope][itemtype*="Article"]');
                    if (!article) return null;

                    return {
                        title: article.querySelector('[itemprop="headline"]')?.textContent?.trim() ||
                            article.querySelector('[itemprop="name"]')?.textContent?.trim(),
                        content: article.querySelector('[itemprop="articleBody"]')?.textContent?.trim(),
                        author: article.querySelector('[itemprop="author"]')?.textContent?.trim(),
                        date: article.querySelector('[itemprop="datePublished"]')?.getAttribute('datetime') ||
                            article.querySelector('[itemprop="datePublished"]')?.textContent?.trim(),
                        summary: article.querySelector('[itemprop="description"]')?.textContent?.trim()
                    };
                });

                if (microdataData) {
                    Object.assign(result, microdataData);
                }
            }

            // Extract OpenGraph data as fallback
            if (!result.title) {
                const ogData = await page.evaluate(() => ({
                    title: document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
                    summary: document.querySelector('meta[property="og:description"]')?.getAttribute('content'),
                    author: document.querySelector('meta[property="article:author"]')?.getAttribute('content'),
                    date: document.querySelector('meta[property="article:published_time"]')?.getAttribute('content')
                }));

                Object.assign(result, ogData);
            }

        } catch (error) {
            console.warn('Error extracting structured data:', error);
        }

        return result;
    }

    async extractSemanticContent(page: Page): Promise<Partial<ExtractionResult['data']>> {
        const result: Partial<ExtractionResult['data']> = {};

        try {
            // Find semantic article container
            const articleData = await page.evaluate(() => {
                // Priority order: article > main > [role="article"]
                const containers = [
                    document.querySelector('article'),
                    document.querySelector('main'),
                    document.querySelector('[role="article"]'),
                    document.querySelector('[role="main"]')
                ].filter(Boolean);

                for (const container of containers) {
                    if (!container) continue;

                    const title = container.querySelector('h1')?.textContent?.trim() ||
                        container.querySelector('header h1')?.textContent?.trim();

                    // Extract content from paragraphs within the container
                    const contentParas = Array.from(container.querySelectorAll('p'))
                        .map(p => p.textContent?.trim())
                        .filter(text => text && text.length > 20);

                    const content = contentParas.join('\n\n');

                    // Look for time/date elements
                    const timeEl = container.querySelector('time[datetime]');
                    const date = timeEl?.getAttribute('datetime') || timeEl?.textContent?.trim();

                    // Look for author information
                    const authorEl = container.querySelector('address[rel="author"]') ||
                        container.querySelector('[rel="author"]') ||
                        container.querySelector('.author') ||
                        container.querySelector('.byline');

                    const author = authorEl?.textContent?.trim();

                    if (title || (content && content.length > 100)) {
                        return {title, content, author, date};
                    }
                }

                return null;
            });

            if (articleData) {
                Object.assign(result, articleData);
            }

        } catch (error) {
            console.warn('Error extracting semantic content:', error);
        }

        return result;
    }

    async calculateContentQuality(page: Page, extractedData: Partial<ExtractionResult['data']>): Promise<ContentQuality> {
        const quality: ContentQuality = {
            contentLength: 0,
            wordCount: 0,
            paragraphCount: 0,
            textDensity: 0,
            linkDensity: 0,
            metadataComplete: false,
            cleanContent: false,
            score: 0
        };

        try {
            const content = extractedData.content || '';
            quality.contentLength = content.length;
            quality.wordCount = content.split(/\s+/).filter(word => word.length > 0).length;

            // Count paragraphs in extracted content
            quality.paragraphCount = (content.match(/\n\n/g) || []).length + 1;

            // Calculate text density and link density from the page
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

            quality.textDensity = densityData.textDensity;
            quality.linkDensity = densityData.linkDensity;

            // Check metadata completeness
            quality.metadataComplete = !!(extractedData.title && (extractedData.author || extractedData.date));

            // Assess content cleanliness (basic check)
            quality.cleanContent = quality.linkDensity < 0.3 && quality.textDensity > 0.25;

            // Calculate overall score
            let score = 0;
            score += quality.wordCount > 100 ? 0.25 : (quality.wordCount / 100) * 0.25;
            score += quality.paragraphCount > 2 ? 0.2 : (quality.paragraphCount / 2) * 0.2;
            score += Math.min(quality.textDensity * 4, 1) * 0.2; // Cap at textDensity = 0.25
            score += quality.linkDensity < 0.3 ? 0.15 : Math.max(0, (0.3 - quality.linkDensity) / 0.3) * 0.15;
            score += quality.metadataComplete ? 0.2 : 0;

            // Ensure minimum score for any extracted content
            if (quality.wordCount > 5) {
                score = Math.max(score, 0.25);
            }

            quality.score = Math.min(score, 1);

        } catch (error) {
            console.warn('Error calculating content quality:', error);
        }

        return quality;
    }

    async extract(page: Page): Promise<ExtractionResult> {
        const startTime = Date.now();

        try {
            const context = await this.detectContext(page);

            // Try structured data first (highest confidence)
            let extractedData = await this.extractStructuredData(page);
            let method = 'structured-data';
            let confidence = 0.9;

            // Fall back to semantic HTML5 if structured data incomplete
            if (!extractedData.title || !extractedData.content) {
                const semanticData = await this.extractSemanticContent(page);

                // Merge with structured data, preferring structured data where available
                extractedData = {
                    title: extractedData.title || semanticData.title,
                    content: extractedData.content || semanticData.content,
                    author: extractedData.author || semanticData.author,
                    date: extractedData.date || semanticData.date,
                    summary: extractedData.summary || semanticData.summary
                };

                method = context.hasStructuredData ? 'hybrid' : 'semantic-html5';
                confidence = context.hasStructuredData ? 0.8 : 0.7;
            }

            const contentQuality = await this.calculateContentQuality(page, extractedData);
            const extractionTime = Date.now() - startTime;

            // Success criteria: must have title OR content with minimum quality
            const hasValidTitle = extractedData.title && extractedData.title.trim().length > 3;
            const hasValidContent = extractedData.content && extractedData.content.trim().length > 50;
            const hasMinimalQuality = contentQuality.wordCount > 20 || contentQuality.score > 0.3;

            const success = (hasValidTitle || hasValidContent) && hasMinimalQuality;

            // Adjust confidence based on content quality only if successful
            if (success) {
                confidence *= Math.max(contentQuality.score, 0.3); // Minimum confidence floor
            } else {
                confidence = 0;
            }

            return {
                success: Boolean(success),
                confidence,
                method,
                data: extractedData,
                metadata: {
                    selectors_used: {
                        method,
                        context: JSON.stringify(context)
                    },
                    extraction_time: extractionTime,
                    content_quality: contentQuality
                }
            };

        } catch (error) {
            console.error('Universal detector error:', error);

            return {
                success: false,
                confidence: 0,
                method: 'error',
                data: {},
                metadata: {
                    selectors_used: {error: String(error)},
                    extraction_time: Date.now() - startTime,
                    content_quality: {
                        contentLength: 0,
                        wordCount: 0,
                        paragraphCount: 0,
                        textDensity: 0,
                        linkDensity: 0,
                        metadataComplete: false,
                        cleanContent: false,
                        score: 0
                    }
                }
            };
        }
    }
}