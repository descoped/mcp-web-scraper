/**
 * Test framework for Hybrid Detector - v1.0.1 bespoke rule system
 * Testing combination of universal detection + site-specific rules
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {Browser, chromium} from 'playwright';
import {HybridDetector} from '@/content/detectors/hybridDetector';

describe('Hybrid Detector', () => {
    let browser: Browser;
    let detector: HybridDetector;

    beforeAll(async () => {
        browser = await chromium.launch();
        detector = new HybridDetector();
        await detector.initialize();
    });

    afterAll(async () => {
        await browser.close();
    });

    describe('Initialization and Rule Loading', () => {
        it('should load Norwegian site rules correctly', async () => {
            const rulesInfo = detector.getRulesInfo();

            expect(rulesInfo.totalRules).toBeGreaterThan(10);
            expect(rulesInfo.domainsWithRules).toBeGreaterThan(5);

            console.log(`📊 Loaded ${rulesInfo.totalRules} rules covering ${rulesInfo.domainsWithRules} domains`);
        });

        it('should match Norwegian domains to correct rules', async () => {
            const testCases = [
                {url: 'https://www.vg.no/sport/test-article', expectedRuleId: 'vg_no_articles'},
                {url: 'https://www.nrk.no/sport/test-article', expectedRuleId: 'nrk_no_articles'},
                {url: 'https://www.dagbladet.no/sport/test-article', expectedRuleId: 'dagbladet_no_articles'},
                {url: 'https://www.tv2.no/sport/test-article', expectedRuleId: 'tv2_no_articles'},
                {url: 'https://e24.no/business-article', expectedRuleId: 'e24_no_business'}
            ];

            for (const testCase of testCases) {
                const match = detector.testUrlMatch(testCase.url);

                expect(match.hasMatch).toBe(true);
                expect(match.rule?.id).toBe(testCase.expectedRuleId);
                expect(match.matchScore).toBeGreaterThan(0.8);

                console.log(`✅ ${testCase.url} -> ${match.rule?.name}`);
            }
        });

        it('should fall back to universal detection for unmatched domains', async () => {
            const unknownUrl = 'https://unknown-site.com/article';
            const match = detector.testUrlMatch(unknownUrl);

            expect(match.hasMatch).toBe(false);
            expect(match.rule).toBeUndefined();
        });
    });

    describe('Bespoke Rule Extraction', () => {
        it('should extract VG.no articles using bespoke rules', async () => {
            const page = await browser.newPage();

            // Mock VG.no content structure
            const mockContent = `
        <!DOCTYPE html>
        <html lang="no">
          <head><meta charset="UTF-8"></head>
          <body>
            <article class="article-entity">
              <h1 data-cy="article-headline">Magnus Carlsen vinner sjakk-VM</h1>
              <div class="article-body">
                <div class="text-body">
                  <p>Magnus Carlsen har vunnet sjakk-VM i en dramatisk finale.</p>
                  <p>Den norske sjakkspilleren viste igjen hvorfor han er verdens beste.</p>
                  <p>Dette er en historisk seier for norsk sjakk.</p>
                </div>
              </div>
              <div data-cy="byline-author">
                <a href="#">Av Sjakk Journalist</a>
              </div>
              <time data-cy="publish-time" datetime="2024-01-15">15. januar 2024</time>
              <div class="article-lead">Dette er en viktig seier for Magnus Carlsen.</div>
            </article>
          </body>
        </html>
      `;

            // Route the VG.no URL to return our mock content
            await page.route('https://www.vg.no/sport/magnus-carlsen-vinner-sjakk-vm', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    body: mockContent
                });
            });

            await page.goto('https://www.vg.no/sport/magnus-carlsen-vinner-sjakk-vm');

            const result = await detector.extract(page);

            expect(result.success).toBe(true);
            expect(result.method).toBe('bespoke-vg_no_articles');
            expect(result.confidence).toBeGreaterThan(0.75);
            expect(result.data.title).toBe('Magnus Carlsen vinner sjakk-VM');
            expect(result.data.content).toContain('Magnus Carlsen har vunnet sjakk-VM');
            expect(result.data.author).toBe('Av Sjakk Journalist');
            expect(result.data.date).toBe('2024-01-15');
            expect(result.data.summary).toBe('Dette er en viktig seier for Magnus Carlsen.');

            await page.close();
        });

        it('should extract NRK.no articles using bespoke rules', async () => {
            const page = await browser.newPage();

            // Mock NRK.no content structure
            const mockContent = `
        <!DOCTYPE html>
        <html lang="no">
          <head><meta charset="UTF-8"></head>
          <body>
            <article role="article">
              <h1 class="article-title">Norsk fotball i krise</h1>
              <div class="article-body">
                <p>Den norske fotballen står overfor store utfordringer.</p>
                <p>Ekspertene mener at store endringer må til.</p>
                <p>Dette er en omfattende analyse av situasjonen.</p>
              </div>
              <div class="byline-author">NRK Sport</div>
              <time class="article-date" datetime="2024-01-15">15. januar 2024</time>
              <div class="article-ingress">En grundig gjennomgang av norsk fotballs utfordringer.</div>
            </article>
          </body>
        </html>
      `;

            // Route the NRK.no URL to return our mock content
            await page.route('https://www.nrk.no/sport/norsk-fotball-i-krise', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    body: mockContent
                });
            });

            await page.goto('https://www.nrk.no/sport/norsk-fotball-i-krise');

            const result = await detector.extract(page);

            expect(result.success).toBe(true);
            expect(result.method).toBe('bespoke-nrk_no_articles');
            expect(result.confidence).toBeGreaterThan(0.75);
            expect(result.data.title).toBe('Norsk fotball i krise');
            expect(result.data.content).toContain('Den norske fotballen står overfor');
            expect(result.data.author).toBe('NRK Sport');
            expect(result.data.date).toBe('2024-01-15');

            await page.close();
        });

        it('should extract Dagbladet.no articles using bespoke rules', async () => {
            const page = await browser.newPage();

            // Mock Dagbladet.no content structure
            const mockContent = `
        <!DOCTYPE html>
        <html lang="no">
          <head><meta charset="UTF-8"></head>
          <body>
            <article class="article">
              <h1 data-testid="article-headline">Ny rekord i norsk idrett</h1>
              <div class="article-text">
                <p>En norsk utøver har satt ny verdensrekord.</p>
                <p>Dette er en historisk prestasjon som vil bli husket lenge.</p>
                <p>Prestasjonen kom som en stor overraskelse for mange.</p>
              </div>
              <div class="article-byline">
                <a href="#">Av Sport Journalist</a>
              </div>
              <time class="article-publish-time" datetime="2024-01-15">15. januar 2024</time>
              <div class="article-lead">En fantastisk prestasjon av norsk utøver.</div>
            </article>
          </body>
        </html>
      `;

            // Route the Dagbladet.no URL to return our mock content
            await page.route('https://www.dagbladet.no/sport/ny-rekord-i-norsk-idrett', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    body: mockContent
                });
            });

            await page.goto('https://www.dagbladet.no/sport/ny-rekord-i-norsk-idrett');

            const result = await detector.extract(page);

            expect(result.success).toBe(true);
            expect(result.method).toBe('bespoke-dagbladet_no_articles');
            expect(result.confidence).toBeGreaterThan(0.75);
            expect(result.data.title).toBe('Ny rekord i norsk idrett');
            expect(result.data.content).toContain('En norsk utøver har satt ny verdensrekord');
            expect(result.data.author).toBe('Av Sport Journalist');
            expect(result.data.date).toBe('2024-01-15');

            await page.close();
        });
    });

    describe('Fallback to Universal Detection', () => {
        it('should fall back to universal detection for unknown sites', async () => {
            const page = await browser.newPage();

            // Mock unknown site content structure
            const mockContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@type": "Article",
                "headline": "Unknown Site Article",
                "articleBody": "This is content from an unknown site that should be handled by universal detection.",
                "author": {"name": "Unknown Author"},
                "datePublished": "2024-01-15"
              }
            </script>
          </head>
          <body>
            <article>
              <h1>Unknown Site Article</h1>
              <p>This is content from an unknown site that should be handled by universal detection.</p>
            </article>
          </body>
        </html>
      `;

            // Route unknown site URL to return our mock content
            await page.route('https://unknown-news-site.com/article', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    body: mockContent
                });
            });

            await page.goto('https://unknown-news-site.com/article');

            const result = await detector.extract(page);

            expect(result.success).toBe(true);
            expect(result.method).toBe('structured-data'); // Universal detection method
            expect(result.confidence).toBeGreaterThan(0.4);
            expect(result.data.title).toBe('Unknown Site Article');
            expect(result.data.content).toContain('unknown site that should be handled');
            expect(result.data.author).toBe('Unknown Author');
            expect(result.data.date).toBe('2024-01-15');

            await page.close();
        });
    });

    describe('Content Processing Rules', () => {
        it('should apply Norwegian content processing rules', async () => {
            const page = await browser.newPage();

            // Mock VG.no content with Norwegian phrases to be processed
            const mockContent = `
        <!DOCTYPE html>
        <html lang="no">
          <head><meta charset="UTF-8"></head>
          <body>
            <article class="article-entity">
              <h1 data-cy="article-headline">Test artikkel</h1>
              <div class="article-body">
                <div class="text-body">
                  <p>Dette er innholdet i artikkelen.</p>
                  <p>Les også: Relatert artikkel som skal fjernes.</p>
                  <p>Se video: Video som skal fjernes.</p>
                  <p>Mer innhold her.</p>
                </div>
              </div>
              <div data-cy="byline-author">
                <a href="#">Av Test Forfatter</a>
              </div>
              <time data-cy="publish-time" datetime="2024-01-15">15. januar 2024</time>
            </article>
          </body>
        </html>
      `;

            // Route the VG.no URL to return our mock content
            await page.route('https://www.vg.no/sport/test-artikkel', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    body: mockContent
                });
            });

            await page.goto('https://www.vg.no/sport/test-artikkel');

            const result = await detector.extract(page);

            expect(result.success).toBe(true);
            expect(result.method).toBe('bespoke-vg_no_articles');

            // Content processing should remove "Les også:" and "Se video:" phrases
            expect(result.data.content).not.toContain('Les også:');
            expect(result.data.content).not.toContain('Se video:');
            expect(result.data.content).toContain('Dette er innholdet i artikkelen');
            expect(result.data.content).toContain('Mer innhold her');

            await page.close();
        });

        it('should normalize Norwegian date formats', async () => {
            const page = await browser.newPage();

            // Mock NRK.no content with Norwegian date format
            const mockContent = `
        <!DOCTYPE html>
        <html lang="no">
          <head><meta charset="UTF-8"></head>
          <body>
            <article role="article">
              <h1 class="article-title">Test dato normalisering</h1>
              <div class="article-body">
                <p>Test innhold for dato normalisering.</p>
              </div>
              <div class="byline-author">Test Forfatter</div>
              <time class="article-date">15. januar 2024</time>
            </article>
          </body>
        </html>
      `;

            // Route the NRK.no URL to return our mock content
            await page.route('https://www.nrk.no/sport/test-dato-normalisering', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    body: mockContent
                });
            });

            await page.goto('https://www.nrk.no/sport/test-dato-normalisering');

            const result = await detector.extract(page);

            expect(result.success).toBe(true);
            expect(result.method).toBe('bespoke-nrk_no_articles');

            // Norwegian date should be normalized to ISO format
            expect(result.data.date).toBe('2024-01-15');

            await page.close();
        });
    });

    describe('Quality Metrics and Performance', () => {
        it('should provide high confidence for bespoke rule matches', async () => {
            const page = await browser.newPage();

            // Mock VG.no content for quality testing
            const mockContent = `
        <!DOCTYPE html>
        <html lang="no">
          <head><meta charset="UTF-8"></head>
          <body>
            <article class="article-entity">
              <h1 data-cy="article-headline">High Quality Article</h1>
              <div class="article-body">
                <div class="text-body">
                  <p>This is a high quality article with substantial content.</p>
                  <p>It has multiple paragraphs and good structure.</p>
                  <p>The content quality should result in high confidence scoring.</p>
                  <p>Bespoke rules should provide better results than universal detection.</p>
                </div>
              </div>
              <div data-cy="byline-author">
                <a href="#">Av Quality Author</a>
              </div>
              <time data-cy="publish-time" datetime="2024-01-15">15. januar 2024</time>
            </article>
          </body>
        </html>
      `;

            // Route the VG.no URL to return our mock content
            await page.route('https://www.vg.no/sport/high-quality-article', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    body: mockContent
                });
            });

            await page.goto('https://www.vg.no/sport/high-quality-article');

            const result = await detector.extract(page);

            expect(result.success).toBe(true);
            expect(result.method).toBe('bespoke-vg_no_articles');
            expect(result.confidence).toBeGreaterThan(0.75); // High confidence for bespoke rules
            expect(result.metadata.content_quality.score).toBeGreaterThan(0.7);
            expect(result.metadata.content_quality.wordCount).toBeGreaterThan(20);
            expect(result.metadata.content_quality.metadataComplete).toBe(true);

            await page.close();
        });

        it('should extract efficiently with reasonable performance', async () => {
            const page = await browser.newPage();

            // Mock VG.no content for performance testing
            const mockContent = `
        <!DOCTYPE html>
        <html lang="no">
          <head><meta charset="UTF-8"></head>
          <body>
            <article class="article-entity">
              <h1 data-cy="article-headline">Performance Test Article</h1>
              <div class="article-body">
                <div class="text-body">
                  <p>Testing extraction performance with bespoke rules.</p>
                  <p>The extraction should complete quickly and efficiently.</p>
                </div>
              </div>
              <div data-cy="byline-author">
                <a href="#">Av Performance Tester</a>
              </div>
              <time data-cy="publish-time" datetime="2024-01-15">15. januar 2024</time>
            </article>
          </body>
        </html>
      `;

            // Route the VG.no URL to return our mock content
            await page.route('https://www.vg.no/sport/performance-test', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    body: mockContent
                });
            });

            await page.goto('https://www.vg.no/sport/performance-test');

            const startTime = Date.now();
            const result = await detector.extract(page);
            const endTime = Date.now();

            const extractionTime = endTime - startTime;

            expect(result.success).toBe(true);
            expect(extractionTime).toBeLessThan(1000); // Should complete within 1 second
            expect(result.metadata.extraction_time).toBeLessThan(1000);

            console.log(`⚡ Extraction completed in ${extractionTime}ms`);

            await page.close();
        });
    });
});