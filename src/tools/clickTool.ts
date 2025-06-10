/**
 * Click tool - Click elements on a page using various selectors
 */

import { z } from 'zod';
import { BaseNavigationTool } from './baseNavigationTool.js';

export class ClickTool extends BaseNavigationTool {
  name = 'click';
  description = 'Click an element on the page using CSS selector, text content, or accessibility attributes';
  
  inputSchema = z.object({
    sessionId: z.string().describe('Session ID of existing browser session'),
    selector: z.string().optional().describe('CSS selector of element to click'),
    text: z.string().optional().describe('Text content of element to click'),
    ariaLabel: z.string().optional().describe('Aria-label attribute of element to click'),
    index: z.number().optional().default(0).describe('Index if multiple matching elements (0-based)'),
    screenshot: z.boolean().optional().default(false).describe('Take screenshot before clicking'),
    waitAfterClick: z.number().optional().default(1000).describe('Milliseconds to wait after clicking')
  }).refine(
    (data) => data.selector || data.text || data.ariaLabel,
    { message: 'At least one of selector, text, or ariaLabel must be provided' }
  );

  async execute(args: z.infer<typeof this.inputSchema>, context: any): Promise<any> {
    const session = await this.getOrCreateSession(args, context);
    
    try {
      let elementLocator;
      
      // Build locator based on provided criteria
      if (args.selector) {
        elementLocator = session.page.locator(args.selector);
      } else if (args.text) {
        elementLocator = session.page.locator(`text="${args.text}"`);
      } else if (args.ariaLabel) {
        elementLocator = session.page.locator(`[aria-label="${args.ariaLabel}"]`);
      }

      // Get specific element by index if multiple matches
      if (elementLocator) {
        elementLocator = elementLocator.nth(args.index);
      }

      // Check if element exists and is visible
      const isVisible = await elementLocator!.isVisible();
      if (!isVisible) {
        throw new Error('Element not visible');
      }

      // Take screenshot before click if requested
      let screenshotBefore;
      if (args.screenshot) {
        const selector = args.selector || `text="${args.text || ''}"` || `[aria-label="${args.ariaLabel || ''}"]`;
        screenshotBefore = await this.captureScreenshotWithHighlight(session.page, selector);
      }

      // Get element details before clicking
      const elementHandle = await elementLocator!.elementHandle();
      const boundingBox = await elementHandle?.boundingBox();
      const tagName = await elementHandle?.evaluate(el => el.tagName.toLowerCase());
      const elementText = await elementHandle?.textContent();

      // Perform click
      await elementLocator!.click({ timeout: 5000 });

      // Wait after click
      await session.page.waitForTimeout(args.waitAfterClick);

      // Check if navigation occurred
      const newUrl = session.page.url();
      const navigationOccurred = newUrl !== session.url;
      
      if (navigationOccurred) {
        session.url = newUrl;
        session.navigationHistory.push(newUrl);
      }

      return this.createResult({
        success: true,
        sessionId: session.id,
        clicked: {
          selector: args.selector,
          text: elementText,
          tagName,
          boundingBox
        },
        navigationOccurred,
        currentUrl: newUrl,
        screenshot: screenshotBefore ? screenshotBefore.toString('base64') : undefined
      });
    } catch (error: any) {
      return this.createError(`Click failed: ${error.message}`, {
        sessionId: session.id,
        selector: args.selector,
        text: args.text,
        ariaLabel: args.ariaLabel
      });
    }
  }
}