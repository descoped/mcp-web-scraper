/**
 * Screenshot tool with cookie consent handling
 * Maintains PNG compatibility for existing test infrastructure
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import type {Browser, BrowserContext, Page} from 'playwright';
import {BaseTool} from '../core/toolRegistry.js';
import {ConsentHandler} from '../core/consentHandler.js';
import type {ScreenshotArgs, ScreenshotResult, ToolContext, ToolResult} from '../types/index.js';
import {
  DEFAULT_BROWSER_CONTEXT as DefaultContext,
  ScreenshotArgsSchema,
  ScreenshotResultSchema
} from '../types/index.js';

export class ScreenshotTool extends BaseTool {
  public readonly name = 'get_page_screenshot';
  public readonly description = 'Take a screenshot of a webpage after handling cookie consent';
  public readonly inputSchema = zodToJsonSchema(ScreenshotArgsSchema);

  private readonly consentHandler = new ConsentHandler();

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const validatedArgs = this.validateArgs<ScreenshotArgs>(args, ScreenshotArgsSchema);
    
    let browser: Browser | null = null;
    let browserContext: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      // Get browser from pool
      browser = await context.browserPool.getBrowser();
      if (!browser) {
        throw new Error('No browser available from pool');
      }

      // Create fresh context for isolation
      browserContext = await browser.newContext({
        userAgent: DefaultContext.userAgent,
        viewport: DefaultContext.viewport
      });

      page = await browserContext.newPage();

      // Navigate to the URL
      await page.goto(validatedArgs.url, { 
        waitUntil: 'domcontentloaded',
        timeout: context.config.requestTimeout 
      });
      
      // Wait for initial page load and potential cookie dialogs
      await page.waitForTimeout(1000);
      
      // Handle cookie consent to get clean screenshot
      const consentResult = await this.consentHandler.handleCookieConsent(
        page, 
        context.config.consentTimeout
      );

      // Take screenshot with specified options
      const screenshot = await page.screenshot({
        fullPage: validatedArgs.fullPage,
        type: 'png'  // Maintain PNG format for compatibility
      });

      // Create result object with metadata
      const result: ScreenshotResult = {
        success: true,
        url: validatedArgs.url,
        screenshotSize: screenshot.length,
        cookieConsent: consentResult,
        timestamp: new Date().toISOString()
      };

      // Validate result structure
      const validatedResult = ScreenshotResultSchema.parse(result);

      // Return MCP-compliant content with both metadata and image data
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(validatedResult, null, 2)
          },
          {
            type: 'image',
            data: screenshot.toString('base64'),
            mimeType: 'image/png'
          }
        ]
      };

    } catch (error) {
      console.error('Screenshot capture failed:', error);
      
      // Return error result instead of throwing
      const errorResult: ScreenshotResult = {
        success: false,
        url: validatedArgs.url,
        screenshotSize: 0,
        cookieConsent: { success: false, reason: 'screenshot_failed', error: String(error) },
        timestamp: new Date().toISOString()
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorResult, null, 2)
          }
        ]
      };
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
   * Get supported screenshot formats
   */
  getSupportedFormats(): string[] {
    return ['png']; // Currently only PNG for compatibility
  }

  /**
   * Get default screenshot options
   */
  getDefaultOptions(): { fullPage: boolean; type: string } {
    return {
      fullPage: false,
      type: 'png'
    };
  }
}