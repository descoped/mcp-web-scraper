/**
 * Scrape with Session tool - Scrape content from current page in an existing session
 */

import {z} from 'zod';
import {BaseNavigationTool} from '@/tools/baseNavigationTool.js';

export class ScrapeWithSessionTool extends BaseNavigationTool {
  name = 'scrape_with_session';
  description = 'Extract article content from the current page in an existing browser session';

  inputSchema = z.object({
    sessionId: z.string().describe('Session ID of existing browser session with target page loaded'),
    extractSelectors: z.object({
      title: z.string().optional().describe('CSS selector for article title'),
      content: z.string().optional().describe('CSS selector for article content'),
      author: z.string().optional().describe('CSS selector for author'),
      date: z.string().optional().describe('CSS selector for publish date'),
      summary: z.string().optional().describe('CSS selector for article summary')
    }).optional().describe('Custom selectors for content extraction')
  });

    async execute(args: z.infer<typeof this.inputSchema>, context: import('@/types/index.js').NavigationToolContext): Promise<import('@/types/index.js').ToolResult> {
    const session = await this.getOrCreateSession(args, context);

    try {
      const page = session.page;
      const customSelectors = args.extractSelectors || {};

      // Default selectors for common article structures
      const selectors = {
        title: customSelectors.title || 'h1, .article-title, .post-title, [itemprop="headline"]',
        content: customSelectors.content || 'article, .article-content, .post-content, .entry-content, main [itemprop="articleBody"]',
        author: customSelectors.author || '.author, .by-line, .writer, [itemprop="author"]',
        date: customSelectors.date || '.publish-date, .post-date, time, [itemprop="datePublished"]',
        summary: customSelectors.summary || '.article-summary, .post-excerpt, .lead, [itemprop="description"]'
      };

      // Extract content using selectors
      const extracted = await page.evaluate((sels) => {
        const getText = (selector: string): string => {
          const element = document.querySelector(selector);
          return element?.textContent?.trim() || '';
        };

        const getMultipleText = (selector: string): string => {
          const elements = document.querySelectorAll(selector);
          return Array.from(elements)
              .map(el => el.textContent?.trim() || '')
              .filter(text => text.length > 0)
              .join('\n\n');
        };

        return {
          title: getText(sels.title),
          content: getMultipleText(sels.content),
          author: getText(sels.author),
          date: getText(sels.date),
          summary: getText(sels.summary)
        };
      }, selectors);

      // Get full page text as fallback
      const fullText = await page.evaluate(() => {
        // Remove script and style elements
        const scripts = document.querySelectorAll('script, style');
        scripts.forEach(el => el.remove());

        return document.body?.innerText || '';
      });

      // Get page metadata
      const metadata = await page.evaluate(() => {
        const getMeta = (name: string): string => {
          const element = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
          return element?.getAttribute('content') || '';
        };

        return {
          description: getMeta('description') || getMeta('og:description'),
          keywords: getMeta('keywords'),
          ogTitle: getMeta('og:title'),
          ogImage: getMeta('og:image'),
          author: getMeta('author') || getMeta('article:author'),
          publishedTime: getMeta('article:published_time')
        };
      });

      // Clean up extracted content
      if (!extracted.title && metadata.ogTitle) {
        extracted.title = metadata.ogTitle;
      }
      if (!extracted.author && metadata.author) {
        extracted.author = metadata.author;
      }
      if (!extracted.summary && metadata.description) {
        extracted.summary = metadata.description;
      }

      // Calculate content quality score
      const contentQuality = {
        hasTitle: !!extracted.title,
        hasContent: extracted.content.length > 100,
        hasAuthor: !!extracted.author,
        hasDate: !!extracted.date,
        contentLength: extracted.content.length,
        score: 0
      };

        contentQuality.score =
        (contentQuality.hasTitle ? 25 : 0) +
        (contentQuality.hasContent ? 50 : 0) +
        (contentQuality.hasAuthor ? 15 : 0) +
        (contentQuality.hasDate ? 10 : 0);

        const resultData = {
        success: true,
        sessionId: session.id,
        url: page.url(),
        extracted,
        metadata,
        fullText: fullText.substring(0, 5000), // Limit full text
        contentQuality,
        timestamp: new Date().toISOString()
        };

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(resultData, null, 2)
                }
            ]
        };

    } catch (error: unknown) {
        const errorMessage = `Content extraction failed: ${error instanceof Error ? error.message : String(error)}`;
        const errorData = {
            success: false,
            error: errorMessage,
        sessionId: session.id,
            url: session.page.url(),
            timestamp: new Date().toISOString()
        };

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(errorData, null, 2)
                }
            ],
            isError: true
        };
    }
  }
}