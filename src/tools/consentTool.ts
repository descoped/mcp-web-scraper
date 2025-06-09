/**
 * Dedicated cookie consent management tool
 * Provides detailed consent handling and verification
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Browser, BrowserContext, Page } from 'playwright';
import { BaseTool } from '../core/toolRegistry.js';
import { ConsentHandler } from '../core/consentHandler.js';
import type { 
  ToolResult, 
  ToolContext, 
  ConsentArgs, 
  ConsentResult 
} from '../types/index.js';
import { 
  ConsentArgsSchema, 
  ConsentResultSchema,
  DEFAULT_BROWSER_CONTEXT as DefaultContext 
} from '../types/index.js';

export class ConsentTool extends BaseTool {
  public readonly name = 'handle_cookie_consent';
  public readonly description = 'Handle cookie consent dialogs on a webpage with multi-language support (30+ languages)';
  public readonly inputSchema = zodToJsonSchema(ConsentArgsSchema);

  private readonly consentHandler = new ConsentHandler();

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const validatedArgs = this.validateArgs<ConsentArgs>(args, ConsentArgsSchema);
    
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
      
      // Handle cookie consent with specified timeout
      const consentResult = await this.consentHandler.handleCookieConsent(
        page, 
        validatedArgs.timeout
      );

      // Create comprehensive result object
      const result = {
        url: validatedArgs.url,
        consentResult,
        timestamp: new Date().toISOString(),
        supportedLanguages: this.getSupportedLanguages(),
        detectionStrategies: this.getDetectionStrategies()
      };

      return this.createResult(result);

    } catch (error) {
      console.error('Cookie consent handling failed:', error);
      
      // Return detailed error result
      const errorResult = {
        url: validatedArgs.url,
        consentResult: {
          success: false,
          reason: 'consent_tool_error',
          error: error instanceof Error ? error.message : String(error)
        } as ConsentResult,
        timestamp: new Date().toISOString(),
        supportedLanguages: this.getSupportedLanguages(),
        detectionStrategies: this.getDetectionStrategies()
      };

      return this.createResult(errorResult);
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
   * Get list of supported languages for consent detection
   */
  private getSupportedLanguages(): string[] {
    return [
      'English', 'Norwegian', 'Danish', 'Swedish', 'Finnish', 'Icelandic',
      'German', 'Dutch', 'French', 'Spanish', 'Portuguese', 'Italian', 'Romanian',
      'Russian', 'Polish', 'Czech', 'Slovak', 'Serbian', 'Croatian', 'Slovenian', 'Bulgarian',
      'Welsh', 'Irish', 'Lithuanian', 'Latvian', 'Estonian',
      'Hungarian', 'Greek', 'Turkish', 'Bosnian', 'Macedonian', 'Albanian', 'Belarusian', 'Ukrainian'
    ];
  }

  /**
   * Get detection strategies used
   */
  private getDetectionStrategies(): string[] {
    return [
      'attribute-based-selectors',
      'framework-specific-selectors',
      'text-pattern-matching',
      'iframe-detection',
      'container-identification',
      'verification-system'
    ];
  }

  /**
   * Get consent patterns for external access
   */
  getConsentPatterns(): Record<string, string[]> {
    const patterns = this.consentHandler.getPatterns();
    return {
      attributes: patterns.attributes,
      frameworks: patterns.frameworks,
      containers: patterns.containers,
      // Only return first 10 text patterns to avoid overwhelming output
      textPatternsSample: patterns.textPatterns.slice(0, 10)
    };
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    expectedCompletionTime: string;
    maxTimeout: number;
    detectionStrategies: number;
    supportedLanguages: number;
  } {
    return {
      expectedCompletionTime: '<1000ms',
      maxTimeout: 3000,
      detectionStrategies: 4,
      supportedLanguages: this.getSupportedLanguages().length
    };
  }
}