/**
 * Phase 4C.2 - Content Platform Optimizer
 * Specialized optimization for content platforms like Medium, Substack, LinkedIn
 */

import type {Page} from 'playwright';
import type {ExtractedContent} from '../rules/types';

export interface PlatformOptimizationResult {
    optimizedContent: ExtractedContent;
    optimizationsApplied: PlatformOptimization[];
    platformMetadata: PlatformMetadata;
    confidence: number;
}

export interface PlatformOptimization {
    type: string;
    field: string;
    description: string;
    originalValue?: string;
    optimizedValue: string;
    confidenceGain: number;
}

export interface PlatformMetadata {
    platform: string;
    platformVersion?: string;
    contentType: 'article' | 'blog_post' | 'newsletter' | 'professional_post' | 'story';
    engagement?: {
        likes?: number;
        comments?: number;
        shares?: number;
        claps?: number; // Medium-specific
        views?: number;
    };
    platformSpecific?: Record<string, any>;
}

export class ContentPlatformOptimizer {
    private platformHandlers: Map<string, PlatformHandler> = new Map();

    constructor() {
        this.initializePlatformHandlers();
    }

    /**
     * Initialize platform-specific handlers
     */
    private initializePlatformHandlers(): void {
        this.platformHandlers.set('medium.com', new MediumOptimizer());
        this.platformHandlers.set('substack.com', new SubstackOptimizer());
        this.platformHandlers.set('linkedin.com', new LinkedInOptimizer());
        this.platformHandlers.set('dev.to', new DevToOptimizer());
        this.platformHandlers.set('hashnode.com', new HashnodeOptimizer());
        this.platformHandlers.set('ghost.org', new GhostOptimizer());
    }

    /**
     * Optimize content extraction for content platforms
     */
    async optimize(
        page: Page,
        extractedContent: ExtractedContent,
        domain: string
    ): Promise<PlatformOptimizationResult> {

        const platformKey = this.identifyPlatform(domain);
        const handler = this.platformHandlers.get(platformKey);

        if (!handler) {
            // Return original content if no platform-specific handler
            return {
                optimizedContent: extractedContent,
                optimizationsApplied: [],
                platformMetadata: {
                    platform: 'unknown',
                    contentType: 'article'
                },
                confidence: 0.5
            };
        }

        console.log(`🎯 Applying ${platformKey} optimizations...`);

        try {
            const result = await handler.optimize(page, extractedContent);
            console.log(`✅ Applied ${result.optimizationsApplied.length} optimizations for ${platformKey}`);
            return result;
        } catch (error) {
            console.error(`Failed to optimize for ${platformKey}:`, error);
            return {
                optimizedContent: extractedContent,
                optimizationsApplied: [],
                platformMetadata: {
                    platform: platformKey,
                    contentType: 'article'
                },
                confidence: 0.3
            };
        }
    }

    /**
     * Identify platform from domain
     */
    private identifyPlatform(domain: string): string {
        // Handle subdomains and variations
        if (domain.includes('medium.com')) return 'medium.com';
        if (domain.includes('substack.com')) return 'substack.com';
        if (domain.includes('linkedin.com')) return 'linkedin.com';
        if (domain.includes('dev.to')) return 'dev.to';
        if (domain.includes('hashnode.com')) return 'hashnode.com';
        if (domain.includes('ghost.org') || domain.includes('ghost.io')) return 'ghost.org';

        return 'unknown';
    }

    /**
     * Get supported platforms
     */
    getSupportedPlatforms(): string[] {
        return Array.from(this.platformHandlers.keys());
    }

    /**
     * Check if platform is supported
     */
    isPlatformSupported(domain: string): boolean {
        return this.identifyPlatform(domain) !== 'unknown';
    }
}

/**
 * Base platform handler interface
 */
abstract class PlatformHandler {
    abstract optimize(page: Page, content: ExtractedContent): Promise<PlatformOptimizationResult>;

    protected async extractText(page: Page, selector: string): Promise<string> {
        try {
            return await page.$eval(selector, el => el.textContent?.trim() || '');
        } catch {
            return '';
        }
    }

    protected async extractAttribute(page: Page, selector: string, attribute: string): Promise<string> {
        try {
            return await page.$eval(selector, (el, attr) => el.getAttribute(attr) || '', attribute);
        } catch {
            return '';
        }
    }

    protected async extractNumber(page: Page, selector: string): Promise<number> {
        const text = await this.extractText(page, selector);
        const match = text.match(/[\d,]+/);
        return match ? parseInt(match[0].replace(/,/g, ''), 10) : 0;
    }
}

/**
 * Medium platform optimizer
 */
class MediumOptimizer extends PlatformHandler {
    async optimize(page: Page, content: ExtractedContent): Promise<PlatformOptimizationResult> {
        const optimizations: PlatformOptimization[] = [];
        const optimizedContent = {...content};

        // Extract Medium-specific author information
        if (!optimizedContent.author || optimizedContent.author.length < 3) {
            const authorFromByline = await this.extractText(page, '[data-testid="authorName"]');
            const authorFromProfile = await this.extractText(page, '.pw-author-name');
            const authorFromMeta = await this.extractText(page, '.ui-captionStrong');

            const newAuthor = authorFromByline || authorFromProfile || authorFromMeta;
            if (newAuthor && newAuthor.length > 2) {
                optimizations.push({
                    type: 'author_extraction',
                    field: 'author',
                    description: 'Extracted author from Medium-specific selectors',
                    originalValue: optimizedContent.author,
                    optimizedValue: newAuthor,
                    confidenceGain: 0.15
                });
                optimizedContent.author = newAuthor;
            }
        }

        // Extract Medium subtitle as summary
        if (!optimizedContent.summary || optimizedContent.summary.length < 20) {
            const subtitle = await this.extractText(page, '.pw-subtitle-paragraph');
            const metaDescription = await this.extractAttribute(page, 'meta[name="description"]', 'content');

            const newSummary = subtitle || metaDescription;
            if (newSummary && newSummary.length > 20) {
                optimizations.push({
                    type: 'summary_extraction',
                    field: 'summary',
                    description: 'Extracted summary from Medium subtitle',
                    originalValue: optimizedContent.summary,
                    optimizedValue: newSummary,
                    confidenceGain: 0.1
                });
                optimizedContent.summary = newSummary;
            }
        }

        // Enhanced content extraction for Medium
        if (optimizedContent.content && optimizedContent.content.length < 500) {
            const enhancedContent = await this.extractText(page, '.pw-post-body-paragraph');
            if (enhancedContent && enhancedContent.length > optimizedContent.content.length) {
                optimizations.push({
                    type: 'content_enhancement',
                    field: 'content',
                    description: 'Enhanced content extraction using Medium-specific selectors',
                    originalValue: `${optimizedContent.content.length} chars`,
                    optimizedValue: `${enhancedContent.length} chars`,
                    confidenceGain: 0.2
                });
                optimizedContent.content = enhancedContent;
            }
        }

        // Extract engagement metrics
        const claps = await this.extractNumber(page, '[data-testid="clap-count"]');
        const responses = await this.extractNumber(page, '[data-testid="responses-count"]');

        // Clean up Medium-specific formatting
        if (optimizedContent.content) {
            // Remove Medium-specific artifacts
            optimizedContent.content = optimizedContent.content
                .replace(/Follow\s*\d+\s*Followers/g, '')
                .replace(/Sign up\s*Sign In/g, '')
                .replace(/Get unlimited access.*?Sign up/g, '')
                .trim();
        }

        const confidence = 0.8 + (optimizations.reduce((sum, opt) => sum + opt.confidenceGain, 0));

        return {
            optimizedContent,
            optimizationsApplied: optimizations,
            platformMetadata: {
                platform: 'medium',
                contentType: 'blog_post',
                engagement: {
                    claps: claps || undefined,
                    comments: responses || undefined
                },
                platformSpecific: {
                    mediumUrl: page.url(),
                    hasMemberOnlyContent: await page.$('.paywall') !== null
                }
            },
            confidence: Math.min(0.95, confidence)
        };
    }
}

/**
 * Substack platform optimizer
 */
class SubstackOptimizer extends PlatformHandler {
    async optimize(page: Page, content: ExtractedContent): Promise<PlatformOptimizationResult> {
        const optimizations: PlatformOptimization[] = [];
        const optimizedContent = {...content};

        // Extract newsletter-specific metadata
        const newsletterName = await this.extractText(page, '.publication-name');
        const authorName = await this.extractText(page, '.author-name');

        // Improve author extraction
        if (!optimizedContent.author && authorName) {
            optimizations.push({
                type: 'author_extraction',
                field: 'author',
                description: 'Extracted author from Substack newsletter metadata',
                originalValue: optimizedContent.author,
                optimizedValue: authorName,
                confidenceGain: 0.15
            });
            optimizedContent.author = authorName;
        }

        // Extract newsletter summary/description
        if (!optimizedContent.summary) {
            const subtitle = await this.extractText(page, '.subtitle');
            const firstParagraph = await this.extractText(page, '.available-content p:first-of-type');

            const newSummary = subtitle || (firstParagraph.length > 50 ? firstParagraph.slice(0, 200) + '...' : '');
            if (newSummary) {
                optimizations.push({
                    type: 'summary_extraction',
                    field: 'summary',
                    description: 'Extracted summary from newsletter content',
                    originalValue: optimizedContent.summary,
                    optimizedValue: newSummary,
                    confidenceGain: 0.1
                });
                optimizedContent.summary = newSummary;
            }
        }

        // Handle paywall content
        const paywallContent = await this.extractText(page, '.paywall-content');
        if (paywallContent && paywallContent.length > (optimizedContent.content?.length || 0)) {
            optimizations.push({
                type: 'paywall_content',
                field: 'content',
                description: 'Detected additional content behind paywall',
                originalValue: `${optimizedContent.content?.length || 0} chars`,
                optimizedValue: `${paywallContent.length} chars (partial)`,
                confidenceGain: 0.05
            });
        }

        // Clean Substack-specific elements
        if (optimizedContent.content) {
            optimizedContent.content = optimizedContent.content
                .replace(/Subscribe.*?Get \d+% off/g, '')
                .replace(/Share this post/g, '')
                .replace(/Leave a comment/g, '')
                .trim();
        }

        const likes = await this.extractNumber(page, '.like-count');
        const comments = await this.extractNumber(page, '.comment-count');

        const confidence = 0.75 + (optimizations.reduce((sum, opt) => sum + opt.confidenceGain, 0));

        return {
            optimizedContent,
            optimizationsApplied: optimizations,
            platformMetadata: {
                platform: 'substack',
                contentType: 'newsletter',
                engagement: {
                    likes: likes || undefined,
                    comments: comments || undefined
                },
                platformSpecific: {
                    newsletterName,
                    hasPaywall: await page.$('.paywall') !== null,
                    isEmail: await page.$('.email-post') !== null
                }
            },
            confidence: Math.min(0.95, confidence)
        };
    }
}

/**
 * LinkedIn platform optimizer
 */
class LinkedInOptimizer extends PlatformHandler {
    async optimize(page: Page, content: ExtractedContent): Promise<PlatformOptimizationResult> {
        const optimizations: PlatformOptimization[] = [];
        const optimizedContent = {...content};

        // Extract LinkedIn professional information
        const authorTitle = await this.extractText(page, '.author-info__title');
        const authorCompany = await this.extractText(page, '.author-info__company');

        // Enhance author with professional details
        if (optimizedContent.author && (authorTitle || authorCompany)) {
            const enhancedAuthor = `${optimizedContent.author}${authorTitle ? `, ${authorTitle}` : ''}${authorCompany ? ` at ${authorCompany}` : ''}`;
            optimizations.push({
                type: 'author_enhancement',
                field: 'author',
                description: 'Enhanced author with professional details',
                originalValue: optimizedContent.author,
                optimizedValue: enhancedAuthor,
                confidenceGain: 0.1
            });
            optimizedContent.author = enhancedAuthor;
        }

        // Extract article-specific content (different from posts)
        const articleContent = await this.extractText(page, '.reader-article-content');
        if (articleContent && articleContent.length > (optimizedContent.content?.length || 0)) {
            optimizations.push({
                type: 'article_content',
                field: 'content',
                description: 'Extracted LinkedIn article content',
                originalValue: `${optimizedContent.content?.length || 0} chars`,
                optimizedValue: `${articleContent.length} chars`,
                confidenceGain: 0.2
            });
            optimizedContent.content = articleContent;
        }

        // Clean LinkedIn-specific elements
        if (optimizedContent.content) {
            optimizedContent.content = optimizedContent.content
                .replace(/Follow.*?\d+ followers/g, '')
                .replace(/Connect with.*?on LinkedIn/g, '')
                .replace(/See more articles by/g, '')
                .trim();
        }

        const reactions = await this.extractNumber(page, '.social-counts-reactions__count');
        const comments = await this.extractNumber(page, '.comments-count');

        const confidence = 0.7 + (optimizations.reduce((sum, opt) => sum + opt.confidenceGain, 0));

        return {
            optimizedContent,
            optimizationsApplied: optimizations,
            platformMetadata: {
                platform: 'linkedin',
                contentType: 'professional_post',
                engagement: {
                    likes: reactions || undefined,
                    comments: comments || undefined
                },
                platformSpecific: {
                    authorTitle,
                    authorCompany,
                    isArticle: await page.$('.reader-article-content') !== null,
                    isPost: await page.$('.feed-shared-update-v2') !== null
                }
            },
            confidence: Math.min(0.95, confidence)
        };
    }
}

/**
 * Dev.to platform optimizer
 */
class DevToOptimizer extends PlatformHandler {
    async optimize(page: Page, content: ExtractedContent): Promise<PlatformOptimizationResult> {
        const optimizations: PlatformOptimization[] = [];
        const optimizedContent = {...content};

        // Extract tags and technical metadata
        const tags = await page.$$eval('.tag', els => els.map(el => el.textContent?.trim()).filter(Boolean));

        // Dev.to specific content extraction
        const techContent = await this.extractText(page, '.crayons-article__main');
        if (techContent && techContent.length > (optimizedContent.content?.length || 0)) {
            optimizations.push({
                type: 'tech_content',
                field: 'content',
                description: 'Extracted technical article content',
                originalValue: `${optimizedContent.content?.length || 0} chars`,
                optimizedValue: `${techContent.length} chars`,
                confidenceGain: 0.15
            });
            optimizedContent.content = techContent;
        }

        const reactions = await this.extractNumber(page, '.reactions-count');
        const comments = await this.extractNumber(page, '.comments-count');

        return {
            optimizedContent,
            optimizationsApplied: optimizations,
            platformMetadata: {
                platform: 'dev.to',
                contentType: 'blog_post',
                engagement: {
                    likes: reactions || undefined,
                    comments: comments || undefined
                },
                platformSpecific: {
                    tags: tags || [],
                    readingTime: await this.extractText(page, '.reading-time')
                }
            },
            confidence: 0.8
        };
    }
}

/**
 * Hashnode platform optimizer
 */
class HashnodeOptimizer extends PlatformHandler {
    async optimize(page: Page, content: ExtractedContent): Promise<PlatformOptimizationResult> {
        const optimizations: PlatformOptimization[] = [];
        const optimizedContent = {...content};

        // Hashnode-specific optimizations would go here
        // Similar pattern to other platforms

        return {
            optimizedContent,
            optimizationsApplied: optimizations,
            platformMetadata: {
                platform: 'hashnode',
                contentType: 'blog_post'
            },
            confidence: 0.75
        };
    }
}

/**
 * Ghost platform optimizer
 */
class GhostOptimizer extends PlatformHandler {
    async optimize(page: Page, content: ExtractedContent): Promise<PlatformOptimizationResult> {
        const optimizations: PlatformOptimization[] = [];
        const optimizedContent = {...content};

        // Ghost-specific optimizations would go here
        // Ghost is more flexible, so optimizations would be more generic

        return {
            optimizedContent,
            optimizationsApplied: optimizations,
            platformMetadata: {
                platform: 'ghost',
                contentType: 'blog_post'
            },
            confidence: 0.7
        };
    }
}