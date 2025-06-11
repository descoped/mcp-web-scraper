/**
 * Article scraping tool with intelligent cookie consent handling
 * Preserves all existing functionality with enhanced type safety
 * Now includes real-time progress notifications
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {v4 as uuidv4} from 'uuid';
import TurndownService from 'turndown';
import type {Browser, BrowserContext, Page} from 'playwright';
import {BaseTool} from '../core/toolRegistry.js';
import {ConsentHandler} from '../core/consentHandler.js';
import {defaultProgressManager} from '../core/progressTracker.js';
import {OperationStreamingTracker} from '../core/streamingManager.js';
import {ContentChunkType} from '../types/streaming.js';
import type {ArticleResult, ScrapeArticleArgs, ToolContext, ToolResult} from '../types/index.js';
import {
  ArticleResultSchema,
  DEFAULT_BROWSER_CONTEXT as DefaultContext,
  ScrapeArticleArgsSchema
} from '../types/index.js';
import {ProgressStage} from '../types/progress.js';

export class ScrapeArticleTool extends BaseTool {
  public readonly name = 'scrape_article_content';
    public readonly description = 'Scrape news article content from a URL with intelligent cookie consent handling. Supports multiple output formats: text, html, and markdown.';
  public readonly inputSchema = zodToJsonSchema(ScrapeArticleArgsSchema);

  private readonly consentHandler = new ConsentHandler();

    // Configure Turndown for HTML to Markdown conversion
    private readonly turndownService = new TurndownService({
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        fence: '```',
        emDelimiter: '_',
        strongDelimiter: '**',
        linkStyle: 'inlined',
        linkReferenceStyle: 'full'
    });

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const validatedArgs = this.validateArgs<ScrapeArticleArgs>(args, ScrapeArticleArgsSchema);

      // Create operation tracker for progress notifications with correlation context
    const operationId = uuidv4();
      const requestMetadata = {
          correlationId: validatedArgs.correlation_id || context.correlationId,
          requestId: context.requestMetadata?.requestId,
          connectionId: context.requestMetadata?.connectionId,
          timestamp: new Date().toISOString()
      };
      const progressTracker = defaultProgressManager.createOperation(operationId, this.name, requestMetadata);
    
    // Create streaming tracker if streaming is enabled
    let streamingTracker: OperationStreamingTracker | null = null;
    if (context.streamingEnabled && context.streamingManager) {
      streamingTracker = context.streamingManager.createStream(this.name, operationId);
      console.log(`Streaming enabled for operation ${operationId}`);
    }
    
    // Helper function for sending MCP progress notifications
    const sendProgress = async (progress: number, message: string) => {
      if (context.sendProgressNotification) {
        await context.sendProgressNotification(progress, message, 100);
      }
    };

    // Helper function for broadcasting progress to SSE connections (fallback when no progress token)
    const broadcastProgress = async (message: string, progress: number) => {
      if (context.connectionManager) {
        // Create a synthetic progress token for SSE-only broadcasting
        const syntheticToken = `operation-${operationId.slice(0, 8)}`;
        await context.connectionManager.broadcastNotification({
          method: "notifications/progress",
          params: {
            progressToken: syntheticToken,
            progress,
            total: 100,
            message
          }
        });
      }
    };
    
    let browser: Browser | null = null;
    let browserContext: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      // Start streaming if enabled
      if (streamingTracker) {
        streamingTracker.startStream(validatedArgs.url, [
          ContentChunkType.TITLE,
          ContentChunkType.AUTHOR,
          ContentChunkType.PUBLICATION_DATE,
          ContentChunkType.SUMMARY,
          ContentChunkType.CONTENT_PARAGRAPH
        ]);
      }

      // Stage 1: Initializing
      progressTracker.startStage(ProgressStage.INITIALIZING, 'Preparing browser environment', {
        estimatedDuration: 2000,
        stageData: { url: validatedArgs.url }
      });
      await sendProgress(5, 'Preparing browser environment');
      await broadcastProgress('Preparing browser environment', 5);

      // Get browser from pool
      browser = await context.browserPool.getBrowser();
      if (!browser) {
        throw new Error('No browser available from pool');
      }

      progressTracker.updateProgress(30, 'Browser acquired from pool');
      await sendProgress(15, 'Browser acquired from pool');

      // Create fresh context for isolation
      browserContext = await browser.newContext({
        userAgent: DefaultContext.userAgent,
        viewport: DefaultContext.viewport
      });

      progressTracker.updateProgress(60, 'Browser context created');
      await sendProgress(25, 'Browser context created');

      page = await browserContext.newPage();
      progressTracker.updateProgress(100, 'Page instance ready');
      progressTracker.completeStage({ browserReady: true });
      await sendProgress(30, 'Page instance ready');

      // Stage 2: Loading page
      progressTracker.startStage(ProgressStage.LOADING_PAGE, `Loading ${validatedArgs.url}`, {
        estimatedDuration: 5000,
        stageData: { url: validatedArgs.url }
      });
      await sendProgress(35, `Loading ${validatedArgs.url}`);

      // Navigate to the URL
      progressTracker.updateProgress(20, 'Navigating to URL');
      await sendProgress(40, 'Navigating to URL');
      await page.goto(validatedArgs.url, { 
        waitUntil: 'domcontentloaded',
        timeout: context.config.requestTimeout 
      });
      
      progressTracker.updateProgress(60, 'Page loaded, waiting for dynamic content');
      await sendProgress(50, 'Page loaded, waiting for dynamic content');
      // Wait for initial page load and potential cookie dialogs
      await page.waitForTimeout(1000);
      
      progressTracker.updateProgress(100, 'Page fully loaded');
      progressTracker.completeStage({ pageLoaded: true, url: validatedArgs.url });
      await sendProgress(55, 'Page fully loaded');
      await broadcastProgress('Page fully loaded', 55);

      // Stage 3: Handling cookie consent
      progressTracker.startStage(ProgressStage.HANDLING_CONSENT, 'Detecting and handling cookie consent dialogs', {
        estimatedDuration: 3000,
        stageData: { consentPatterns: Object.keys(context.consentPatterns).length }
      });
      await sendProgress(60, 'Detecting and handling cookie consent dialogs');
      
      progressTracker.updateProgress(20, 'Scanning for consent dialogs');
      await sendProgress(65, 'Scanning for consent dialogs');
      // Handle cookie consent with intelligent detection
      const consentResult = await this.consentHandler.handleCookieConsent(
        page, 
        context.config.consentTimeout
      );
      
      progressTracker.updateProgress(100, `Consent handled: ${consentResult.success ? 'Success' : 'No dialogs found'}`);
      progressTracker.completeStage({ 
        consentResult: consentResult,
        method: consentResult.method,
        success: consentResult.success 
      });
      await sendProgress(70, `Consent handled: ${consentResult.success ? 'Success' : 'No dialogs found'}`);

      // Stage 4: Extracting content
      progressTracker.startStage(ProgressStage.EXTRACTING_CONTENT, 'Extracting article content and metadata', {
        estimatedDuration: 4000,
        stageData: { 
          extractSelectors: validatedArgs.extractSelectors ? Object.keys(validatedArgs.extractSelectors).length : 0,
          waitForSelector: validatedArgs.waitForSelector 
        }
      });
      await sendProgress(75, 'Extracting article content and metadata');

      // Wait for optional selector if specified
      if (validatedArgs.waitForSelector) {
        progressTracker.updateProgress(10, `Waiting for custom selector: ${validatedArgs.waitForSelector}`);
        await sendProgress(77, `Waiting for custom selector: ${validatedArgs.waitForSelector}`);
        await page.waitForSelector(validatedArgs.waitForSelector, { timeout: 10000 });
      }
      
      progressTracker.updateProgress(20, 'Setting up content extraction selectors');
      await sendProgress(80, 'Setting up content extraction selectors');
      // Define default selectors for content extraction
      const defaultSelectors = {
        title: 'h1, .headline, .title, [class*="title"], [class*="headline"]',
        content: 'article, .content, .article-body, [class*="content"], [class*="article"]',
        author: '.author, .byline, [class*="author"], [class*="byline"]',
        date: '.date, .timestamp, time, [class*="date"], [class*="time"]',
        summary: '.summary, .excerpt, .lead, [class*="summary"], [class*="excerpt"]'
      };

      // Merge with custom selectors if provided
      const selectors = { ...defaultSelectors, ...validatedArgs.extractSelectors };
      const selectorKeys = Object.keys(selectors);

      progressTracker.updateProgress(30, `Extracting content using ${selectorKeys.length} selectors`);
      
      // Extract structured data with streaming
      const extractedData: Record<string, string | undefined> = {};
      let processedSelectors = 0;
      
      for (const [key, selector] of Object.entries(selectors)) {
        if (!selector) continue; // Skip undefined selectors
        
        try {
          const element = await page.$(selector);
          if (element) {
            const text = await element.textContent();
            const trimmedText = text?.trim();
            extractedData[key] = trimmedText || undefined;
            
            // Stream content chunk if we found meaningful content
            if (streamingTracker && trimmedText && trimmedText.length > 10) {
              let chunkType: ContentChunkType;
              switch (key) {
                case 'title':
                  chunkType = ContentChunkType.TITLE;
                  break;
                case 'author':
                  chunkType = ContentChunkType.AUTHOR;
                  break;
                case 'date':
                  chunkType = ContentChunkType.PUBLICATION_DATE;
                  break;
                case 'summary':
                  chunkType = ContentChunkType.SUMMARY;
                  break;
                case 'content':
                  chunkType = ContentChunkType.CONTENT_PARAGRAPH;
                  break;
                default:
                  chunkType = ContentChunkType.METADATA;
              }
              
              streamingTracker.streamContentChunk(chunkType, trimmedText, processedSelectors, true);
              console.log(`Streamed ${key}: ${trimmedText.slice(0, 100)}...`);
            }
          }
          processedSelectors++;
          
          // Update progress based on selector processing
          const selectorProgress = Math.min(90, 30 + (processedSelectors / selectorKeys.length) * 50);
          progressTracker.updateProgress(selectorProgress, `Extracted ${key}: ${extractedData[key] ? 'Found' : 'Not found'}`);
          
        } catch (error) {
          console.warn(`Failed to extract ${key} with selector ${selector}:`, error);
          // Continue with other extractions
        }
      }

        progressTracker.updateProgress(90, 'Extracting content in requested formats');
        await sendProgress(90, 'Extracting content in requested formats');

        // Extract content in requested formats
        const contentResults: {
            fullText?: string;
            fullHtml?: string;
            fullMarkdown?: string;
        } = {};

        const requestedFormats = validatedArgs.outputFormats || ['text'];
        console.log(`Generating content in formats: ${requestedFormats.join(', ')}`);

        // Get HTML content first (base for all formats)
        let htmlContent = '';
        if (requestedFormats.includes('html') || requestedFormats.includes('markdown')) {
            htmlContent = await page.content();
            if (requestedFormats.includes('html')) {
                contentResults.fullHtml = htmlContent;
            }
        }

        // Generate markdown from HTML if requested
        if (requestedFormats.includes('markdown') && htmlContent) {
            try {
                contentResults.fullMarkdown = this.turndownService.turndown(htmlContent);
            } catch (error) {
                console.warn('Failed to convert HTML to Markdown:', error);
                // Fallback to plain text
                contentResults.fullMarkdown = await page.$eval('body', el => el.innerText).catch(() => '');
            }
        }

        // Get plain text if requested
        if (requestedFormats.includes('text')) {
            const bodyText = await page.$eval('body', el => el.innerText).catch(() => '');
            contentResults.fullText = bodyText.slice(0, 10000); // Reasonable limit for text
        }

        // Stream content in chunks if streaming is enabled and we have substantial content
        if (streamingTracker && contentResults.fullText && contentResults.fullText.length > 500) {
        const chunkSize = 1000; // Stream in 1000 character chunks
        const chunks = [];
            for (let i = 0; i < contentResults.fullText.length; i += chunkSize) {
                const chunk = contentResults.fullText.slice(i, i + chunkSize);
          chunks.push(chunk);
        }
        
        console.log(`Streaming full text in ${chunks.length} chunks`);
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          if (chunk) {
            streamingTracker.streamContentChunk(
              ContentChunkType.FULL_TEXT_CHUNK, 
              chunk, 
              i, 
              i === chunks.length - 1 // Mark last chunk as complete
            );
          }
        }
      }
      
      progressTracker.updateProgress(100, `Content extraction complete. Title: ${extractedData.title ? 'Found' : 'Not found'}`);
      progressTracker.completeStage({ 
        extractedFields: Object.keys(extractedData).filter(key => extractedData[key]),
        totalFields: selectorKeys.length,
          generatedFormats: requestedFormats,
          contentSizes: {
              text: contentResults.fullText?.length || 0,
              html: contentResults.fullHtml?.length || 0,
              markdown: contentResults.fullMarkdown?.length || 0
          }
      });
      await sendProgress(92, `Content extraction complete. Title: ${extractedData.title ? 'Found' : 'Not found'}`);

      // Stage 5: Processing results
      progressTracker.startStage(ProgressStage.PROCESSING_RESULTS, 'Formatting and validating scraped data', {
        estimatedDuration: 1000
      });
      await sendProgress(95, 'Formatting and validating scraped data');

      progressTracker.updateProgress(30, 'Structuring extracted data');
      await sendProgress(97, 'Structuring extracted data');

        // Create result object with only requested formats
      const result: ArticleResult = {
        url: validatedArgs.url,
        extracted: {
          title: extractedData.title,
          content: extractedData.content,
          author: extractedData.author,
          date: extractedData.date,
          summary: extractedData.summary,
        },
        timestamp: new Date().toISOString(),
        cookieConsent: consentResult
      };

        // Add content fields based on requested formats
        if (contentResults.fullText !== undefined) {
            result.fullText = contentResults.fullText;
        }
        if (contentResults.fullHtml !== undefined) {
            result.fullHtml = contentResults.fullHtml;
        }
        if (contentResults.fullMarkdown !== undefined) {
            result.fullMarkdown = contentResults.fullMarkdown;
        }

      progressTracker.updateProgress(70, 'Validating result structure');
      // Validate result structure
      const validatedResult = ArticleResultSchema.parse(result);

      progressTracker.updateProgress(100, 'Data validation complete');
      progressTracker.completeStage({ 
        resultSize: JSON.stringify(validatedResult).length,
        hasTitle: !!validatedResult.extracted.title,
        hasContent: !!validatedResult.extracted.content,
          generatedFormats: requestedFormats,
          contentSizes: {
              text: validatedResult.fullText?.length || 0,
              html: validatedResult.fullHtml?.length || 0,
              markdown: validatedResult.fullMarkdown?.length || 0
          }
      });

      // Complete streaming if enabled
      if (streamingTracker) {
        streamingTracker.completeExtraction({
          totalChunks: processedSelectors,
          contentTypes: Object.keys(extractedData)
            .filter(key => extractedData[key])
            .map(key => {
              switch (key) {
                case 'title': return ContentChunkType.TITLE;
                case 'author': return ContentChunkType.AUTHOR;
                case 'date': return ContentChunkType.PUBLICATION_DATE;
                case 'summary': return ContentChunkType.SUMMARY;
                case 'content': return ContentChunkType.CONTENT_PARAGRAPH;
                default: return ContentChunkType.METADATA;
              }
            }),
          successfulExtractions: Object.keys(extractedData).filter(key => extractedData[key]).length,
          failedExtractions: Object.keys(extractedData).filter(key => !extractedData[key]).length
        });
        
        streamingTracker.completeStream(validatedResult);
        console.log(`Streaming completed for operation ${operationId}`);
      }

      // Complete operation successfully
      progressTracker.completeOperation({
        operationId,
        url: validatedArgs.url,
        success: true,
        extractedFields: Object.keys(extractedData).filter(key => extractedData[key]),
        consentHandled: consentResult.success,
        totalTime: Date.now() - progressTracker.getInfo().elapsedTime
      }, 'Article scraping completed successfully');
      
      await sendProgress(100, 'Article scraping completed successfully');
      await broadcastProgress('Article scraping completed successfully', 100);

      return this.createResult(validatedResult);

    } catch (error) {
      console.error('Article scraping failed:', error);
      
      // Fail streaming if enabled
      if (streamingTracker) {
        streamingTracker.failStream({
          code: 'SCRAPING_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          stage: progressTracker.getInfo().currentStage
        });
        console.log(`Streaming failed for operation ${operationId}`);
      }
      
      // Fail the operation with error details
      progressTracker.failOperation({
        code: 'SCRAPING_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        details: { 
          url: validatedArgs.url,
          stage: progressTracker.getInfo().currentStage,
          errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
        }
      }, `Article scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      throw error;
    } finally {
      // Cleanup resources in proper order
      if (page) {
        await page.close().catch(console.error);
      }
      if (browserContext) {
        await browserContext.close().catch(console.error);
      }
      if (browser) {
        context.browserPool.releaseBrowser(browser);
      }
    }
  }

  /**
   * Get default selectors for external reference
   */
  getDefaultSelectors(): Record<string, string> {
    return {
      title: 'h1, .headline, .title, [class*="title"], [class*="headline"]',
      content: 'article, .content, .article-body, [class*="content"], [class*="article"]',
      author: '.author, .byline, [class*="author"], [class*="byline"]',
      date: '.date, .timestamp, time, [class*="date"], [class*="time"]',
      summary: '.summary, .excerpt, .lead, [class*="summary"], [class*="excerpt"]'
    };
  }
}