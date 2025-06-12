/**
 * Test framework for Pattern Scorer - v1.0.1 enhanced content extraction
 * Testing the weighted scoring system for selector evaluation
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {Browser, chromium} from 'playwright';
import {SimplePatternScorer} from '@/content/scoring/simplePatternScorer';
import {DetectionPattern, DetectionTier} from '@/content/types';

describe('Pattern Scorer', () => {
    let browser: Browser;
    let scorer: SimplePatternScorer;

    beforeAll(async () => {
        browser = await chromium.launch();
        scorer = new SimplePatternScorer();
    });

    afterAll(async () => {
        await browser.close();
    });

    // No need for function injection with SimplePatternScorer

    describe('Selector Scoring', () => {
        it('should score existing elements higher than non-existing', async () => {
            const page = await browser.newPage();
            // No injection needed
            await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <h1>Existing Title</h1>
            <p>Some content here</p>
          </body>
        </html>
      `);

            const existingScore = await scorer.scoreSelector(page, 'h1', 'title');
            const nonExistingScore = await scorer.scoreSelector(page, 'h2', 'title');

            expect(existingScore.element_exists).toBe(true);
            expect(existingScore.total_score).toBeGreaterThan(0);
            expect(nonExistingScore.element_exists).toBe(false);
            expect(nonExistingScore.total_score).toBe(0);

            await page.close();
        });

        it('should score semantic elements higher for appropriate content types', async () => {
            const page = await browser.newPage();
            // No injection needed
            await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <h1>Article Title</h1>
            <div class="title">Also a title</div>
            <time datetime="2024-01-15">January 15, 2024</time>
            <span class="date">January 15, 2024</span>
          </body>
        </html>
      `);

            // Title scoring: h1 should score higher than div
            const h1Score = await scorer.scoreSelector(page, 'h1', 'title');
            const divScore = await scorer.scoreSelector(page, 'div.title', 'title');

            expect(h1Score.semantic_score).toBeGreaterThan(divScore.semantic_score);

            // Date scoring: time element should score higher than span
            const timeScore = await scorer.scoreSelector(page, 'time', 'date');
            const spanScore = await scorer.scoreSelector(page, 'span.date', 'date');

            expect(timeScore.semantic_score).toBeGreaterThan(spanScore.semantic_score);

            await page.close();
        });

        it('should score content relevance appropriately', async () => {
            const page = await browser.newPage();
            // No injection needed
            await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <h1>Good Title Length</h1>
            <h1>This is a very long title that probably should not be considered a good title because it exceeds reasonable length expectations</h1>
            <div class="content">
              <p>This is a substantial article with multiple paragraphs.</p>
              <p>It contains enough content to be considered a proper article.</p>
              <p>The content has good structure and reasonable length.</p>
            </div>
            <div class="short">Short.</div>
          </body>
        </html>
      `);

            // Title relevance
            const goodTitleScore = await scorer.scoreSelector(page, 'h1:first-child', 'title');
            const longTitleScore = await scorer.scoreSelector(page, 'h1:last-child', 'title');

            expect(goodTitleScore.content_relevance).toBeGreaterThan(longTitleScore.content_relevance);

            // Content relevance
            const goodContentScore = await scorer.scoreSelector(page, 'div.content', 'content');
            const shortContentScore = await scorer.scoreSelector(page, 'div.short', 'content');

            expect(goodContentScore.content_relevance).toBeGreaterThan(shortContentScore.content_relevance);

            await page.close();
        });

        it('should score Norwegian content patterns correctly', async () => {
            const page = await browser.newPage();
            // No injection needed
            await page.setContent(`
        <!DOCTYPE html>
        <html lang="no">
          <body>
            <div class="author">Av John Doe</div>
            <div class="author">John Doe</div>
            <time>15. januar 2024</time>
            <time>2024-01-15</time>
          </body>
        </html>
      `);

            // Norwegian author pattern should score higher
            const norwegianAuthorScore = await scorer.scoreSelector(page, 'div.author:first-child', 'author');
            const regularAuthorScore = await scorer.scoreSelector(page, 'div.author:last-child', 'author');

            expect(norwegianAuthorScore.content_relevance).toBeGreaterThan(regularAuthorScore.content_relevance);

            // Norwegian date format should score well
            const norwegianDateScore = await scorer.scoreSelector(page, 'time:first-child', 'date');
            const isoDateScore = await scorer.scoreSelector(page, 'time:last-child', 'date');

            expect(norwegianDateScore.content_relevance).toBeGreaterThan(0.4);
            expect(isoDateScore.content_relevance).toBeGreaterThan(0.4);

            await page.close();
        });
    });

    describe('Pattern Evaluation', () => {
        it('should evaluate multiple patterns and return sorted scores', async () => {
            const page = await browser.newPage();
            // No injection needed
            await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <h1 itemprop="headline">Structured Title</h1>
            <h2>Secondary Title</h2>
            <div class="title">Class-based Title</div>
          </body>
        </html>
      `);

            const patterns: DetectionPattern[] = [
                {
                    name: 'structured-title',
                    tier: DetectionTier.UNIVERSAL,
                    selectors: ['h1[itemprop="headline"]'],
                    weight: 1.0
                },
                {
                    name: 'semantic-title',
                    tier: DetectionTier.UNIVERSAL,
                    selectors: ['h1', 'h2'],
                    weight: 0.9
                },
                {
                    name: 'class-title',
                    tier: DetectionTier.PATTERNS,
                    selectors: ['.title'],
                    weight: 0.7
                }
            ];

            const scores = await scorer.scorePatterns(page, patterns, 'title');

            expect(scores).toHaveLength(4); // 1 + 2 + 1 selectors
            expect(scores[0].total_score).toBeGreaterThanOrEqual(scores[1].total_score);
            expect(scores[1].total_score).toBeGreaterThanOrEqual(scores[2].total_score);

            // Structured data should score highest due to weight and semantic value
            const structuredScore = scores.find(s => s.selector === 'h1[itemprop="headline"]');
            expect(structuredScore).toBeDefined();
            expect(structuredScore!.total_score).toBeGreaterThan(0.5);

            await page.close();
        });

        it('should find best selector above threshold', async () => {
            const page = await browser.newPage();
            // No injection needed
            await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <article>
              <h1 itemprop="headline">High Quality Article Title</h1>
              <div itemprop="articleBody">
                <p>This is substantial article content with multiple paragraphs.</p>
                <p>The content demonstrates good structure and adequate length.</p>
                <p>Quality metrics should be favorable for this content.</p>
              </div>
              <address rel="author">Article Author</address>
              <time datetime="2024-01-15">January 15, 2024</time>
            </article>
          </body>
        </html>
      `);

            const titlePatterns: DetectionPattern[] = [
                {
                    name: 'microdata-title',
                    tier: DetectionTier.UNIVERSAL,
                    selectors: ['[itemprop="headline"]'],
                    weight: 1.0
                },
                {
                    name: 'semantic-title',
                    tier: DetectionTier.UNIVERSAL,
                    selectors: ['article h1', 'h1'],
                    weight: 0.9
                }
            ];

            const bestTitleSelector = await scorer.findBestSelector(page, titlePatterns, 'title');
            expect(bestTitleSelector).toBe('[itemprop="headline"]');

            const contentPatterns: DetectionPattern[] = [
                {
                    name: 'microdata-content',
                    tier: DetectionTier.UNIVERSAL,
                    selectors: ['[itemprop="articleBody"]'],
                    weight: 1.0
                },
                {
                    name: 'semantic-content',
                    tier: DetectionTier.UNIVERSAL,
                    selectors: ['article', 'main'],
                    weight: 0.8
                }
            ];

            const bestContentSelector = await scorer.findBestSelector(page, contentPatterns, 'content');
            expect(bestContentSelector).toBe('[itemprop="articleBody"]');

            await page.close();
        });

        it('should return null when no selector meets threshold', async () => {
            const page = await browser.newPage();
            // No injection needed
            await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <div>No relevant content here</div>
          </body>
        </html>
      `);

            const patterns: DetectionPattern[] = [
                {
                    name: 'article-title',
                    tier: DetectionTier.UNIVERSAL,
                    selectors: ['article h1', 'h1[itemprop="headline"]'],
                    weight: 1.0
                }
            ];

            const bestSelector = await scorer.findBestSelector(page, patterns, 'title');
            expect(bestSelector).toBeNull();

            await page.close();
        });
    });

    describe('Scoring Function Accuracy', () => {
        it('should evaluate title relevance correctly', async () => {
            const page = await browser.newPage();
            // No injection needed

            const testCases = [
                {text: 'Good Article Title', expected: 'high'},
                {
                    text: 'This is an extremely long title that should not be considered good because it exceeds reasonable length expectations for article headlines',
                    expected: 'low'
                },
                {text: 'Short', expected: 'low'},
                {text: '', expected: 'zero'}
            ];

            for (const testCase of testCases) {
                await page.setContent(`<h1>${testCase.text}</h1>`);
                const score = await scorer.scoreSelector(page, 'h1', 'title');

                switch (testCase.expected) {
                    case 'high':
                        expect(score.content_relevance).toBeGreaterThan(0.6);
                        break;
                    case 'low':
                        expect(score.content_relevance).toBeLessThan(0.5);
                        break;
                    case 'zero':
                        expect(score.content_relevance).toBe(0);
                        break;
                }
            }

            await page.close();
        });

        it('should evaluate content relevance correctly', async () => {
            const page = await browser.newPage();
            // No injection needed

            // High quality content
            await page.setContent(`
        <div class="content">
          <p>This is a substantial article with multiple paragraphs that demonstrates good content structure.</p>
          <p>The content has adequate length and provides meaningful information to readers.</p>
          <p>Quality metrics should recognize this as good article content.</p>
          <p>Additional paragraphs further enhance the content quality score.</p>
        </div>
      `);

            const goodScore = await scorer.scoreSelector(page, 'div.content', 'content');
            expect(goodScore.content_relevance).toBeGreaterThan(0.6);

            // Poor quality content
            await page.setContent(`
        <div class="content">
          <p>Short content.</p>
          <a href="#">Link 1</a>
          <a href="#">Link 2</a>
          <a href="#">Link 3</a>
        </div>
      `);

            const poorScore = await scorer.scoreSelector(page, 'div.content', 'content');
            expect(poorScore.content_relevance).toBeLessThan(0.4);

            await page.close();
        });

        it('should evaluate author patterns correctly', async () => {
            const page = await browser.newPage();
            // No injection needed

            const authorTests = [
                {text: 'Av John Doe', expected: 'high'}, // Norwegian pattern
                {text: 'By Jane Smith', expected: 'high'}, // English pattern
                {text: 'John Doe', expected: 'medium'}, // Name pattern
                {text: 'john.doe@example.com', expected: 'low'}, // Email (too long)
                {text: '', expected: 'zero'}
            ];

            for (const test of authorTests) {
                await page.setContent(`<div class="author">${test.text}</div>`);
                const score = await scorer.scoreSelector(page, 'div.author', 'author');

                switch (test.expected) {
                    case 'high':
                        expect(score.content_relevance).toBeGreaterThan(0.5);
                        break;
                    case 'medium':
                        expect(score.content_relevance).toBeGreaterThan(0.3);
                        expect(score.content_relevance).toBeLessThan(0.7);
                        break;
                    case 'low':
                        expect(score.content_relevance).toBeLessThan(0.4);
                        break;
                    case 'zero':
                        expect(score.content_relevance).toBe(0);
                        break;
                }
            }

            await page.close();
        });

        it('should evaluate date patterns correctly', async () => {
            const page = await browser.newPage();
            // No injection needed

            const dateTests = [
                {text: '2024-01-15', expected: 'high'}, // ISO format
                {text: '15. januar 2024', expected: 'high'}, // Norwegian format
                {text: 'January 15, 2024', expected: 'medium'}, // English format
                {text: 'Publisert: 15.01.2024', expected: 'medium'}, // With prefix
                {text: 'Not a date', expected: 'zero'}
            ];

            for (const test of dateTests) {
                await page.setContent(`<time>${test.text}</time>`);
                const score = await scorer.scoreSelector(page, 'time', 'date');

                switch (test.expected) {
                    case 'high':
                        expect(score.content_relevance).toBeGreaterThan(0.4);
                        break;
                    case 'medium':
                        expect(score.content_relevance).toBeGreaterThan(0.2);
                        break;
                    case 'zero':
                        expect(score.content_relevance).toBe(0);
                        break;
                }
            }

            await page.close();
        });
    });

    describe('Performance and Edge Cases', () => {
        it('should handle complex selectors efficiently', async () => {
            const page = await browser.newPage();
            // No injection needed
            await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <article itemscope itemtype="http://schema.org/Article">
              <header>
                <h1 itemprop="headline" class="article-title main-heading">Complex Selector Test</h1>
              </header>
            </article>
          </body>
        </html>
      `);

            const complexSelector = 'article[itemscope] header h1[itemprop="headline"].article-title';
            const startTime = Date.now();

            const score = await scorer.scoreSelector(page, complexSelector, 'title');

            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(1000); // Should complete within 1 second
            expect(score.element_exists).toBe(true);
            expect(score.total_score).toBeGreaterThan(0.5);

            await page.close();
        });

        it('should handle malformed selectors gracefully', async () => {
            const page = await browser.newPage();
            // No injection needed
            await page.setContent('<html><body><h1>Test</h1></body></html>');

            const malformedSelector = 'h1[invalid="';
            const score = await scorer.scoreSelector(page, malformedSelector, 'title');

            expect(score.element_exists).toBe(false);
            expect(score.total_score).toBe(0);

            await page.close();
        });

        it('should handle pages with no content', async () => {
            const page = await browser.newPage();
            // No injection needed
            await page.setContent('<html><body></body></html>');

            const score = await scorer.scoreSelector(page, 'h1', 'title');

            expect(score.element_exists).toBe(false);
            expect(score.total_score).toBe(0);

            await page.close();
        });
    });
});