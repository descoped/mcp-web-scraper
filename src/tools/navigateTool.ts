/**
 * Navigate tool - Navigate to URL with optional cookie consent handling
 */

import { z } from 'zod';
import { BaseNavigationTool } from './baseNavigationTool.js';

export class NavigateTool extends BaseNavigationTool {
  name = 'navigate';
  description = 'Navigate to a URL in a browser session with automatic cookie consent handling';
  
  inputSchema = z.object({
    url: z.string().url().describe('The URL to navigate to'),
    sessionId: z.string().optional().describe('Session ID to reuse existing browser session'),
    handleConsent: z.boolean().optional().default(true).describe('Automatically handle cookie consent if detected'),
    waitForSelector: z.string().optional().describe('CSS selector to wait for after navigation'),
    timeout: z.number().optional().default(30000).describe('Navigation timeout in milliseconds')
  });

  async execute(args: z.infer<typeof this.inputSchema>, context: any): Promise<any> {
    const session = await this.getOrCreateSession(args, context);
    
    try {
      // Navigate to URL
      await session.page.goto(args.url, { 
        waitUntil: 'domcontentloaded',
        timeout: args.timeout 
      });
      
      session.url = args.url;
      session.navigationHistory.push(args.url);

      // Handle cookie consent if requested
      if (args.handleConsent && !session.hasConsentHandled) {
        try {
          const consentHandler = context.consentHandler;
          const consentResult = await consentHandler.handleCookieConsent(session.page);
          
          if (consentResult.success) {
            session.hasConsentHandled = true;
          }
        } catch (error) {
          // Log but don't fail navigation if consent handling fails
          context.logger?.warn('Cookie consent handling failed during navigation', { 
            url: args.url, 
            error 
          });
        }
      }

      // Wait for specific selector if provided
      if (args.waitForSelector) {
        await session.page.waitForSelector(args.waitForSelector, {
          timeout: args.timeout,
          state: 'visible'
        });
      }

      // Get page state after navigation
      const title = await session.page.title();
      const finalUrl = session.page.url();
      
      // Take a snapshot for visual confirmation
      const screenshot = await session.page.screenshot({ fullPage: false });

      return this.createResult({
        success: true,
        sessionId: session.id,
        url: finalUrl,
        title,
        navigationHistory: session.navigationHistory,
        hasConsentHandled: session.hasConsentHandled,
        screenshot: screenshot.toString('base64')
      });
    } catch (error: any) {
      return this.createError(`Navigation failed: ${error.message}`, {
        sessionId: session.id,
        targetUrl: args.url,
        currentUrl: session.url
      });
    }
  }
}