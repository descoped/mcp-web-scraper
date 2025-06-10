/**
 * Base class for navigation tools that work with persistent page sessions
 */

import { z } from 'zod';
import { Page } from 'playwright';
import { BaseTool } from './baseTool.js';
import { ToolContext } from '../types/index.js';
import { PageManager, PageSession } from '../core/pageManager.js';

export interface NavigationToolContext extends ToolContext {
  pageManager: PageManager;
}

export abstract class BaseNavigationTool extends BaseTool {
  protected pageManager!: PageManager;

  async initialize(context: NavigationToolContext): Promise<void> {
    await super.initialize(context);
    this.pageManager = context.pageManager;
  }

  protected async getOrCreateSession(args: any, context: NavigationToolContext): Promise<PageSession> {
    let session: PageSession | null = null;

    if (args.sessionId) {
      session = await this.pageManager.getSession(args.sessionId);
      if (!session) {
        throw new Error(`Session ${args.sessionId} not found. Session may have expired.`);
      }
    } else {
      // Create new session
      const browser = await context.browserPool.getBrowser();
      if (!browser) {
        throw new Error('No browser available from pool');
      }
      const browserContext = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });
      
      const sessionId = await this.pageManager.createSession(browserContext);
      session = await this.pageManager.getSession(sessionId);
      
      if (!session) {
        throw new Error('Failed to create new session');
      }
    }

    return session;
  }

  protected createSessionResult(session: PageSession, additionalData: any = {}): any {
    return {
      sessionId: session.id,
      url: session.url,
      navigationHistory: session.navigationHistory,
      hasConsentHandled: session.hasConsentHandled,
      ...additionalData,
      timestamp: new Date().toISOString()
    };
  }

  // Helper method to handle common element interactions with better error handling
  protected async safeElementInteraction<T>(
    page: Page,
    selector: string,
    action: (element: any) => Promise<T>,
    options: { timeout?: number; waitForSelector?: boolean } = {}
  ): Promise<T> {
    const { timeout = 5000, waitForSelector = true } = options;

    try {
      if (waitForSelector) {
        await page.waitForSelector(selector, { timeout, state: 'visible' });
      }

      const element = await page.locator(selector).first();
      return await action(element);
    } catch (error: any) {
      throw new Error(`Failed to interact with element '${selector}': ${error.message}`);
    }
  }

  // Helper to take screenshot with element highlighting
  protected async captureScreenshotWithHighlight(
    page: Page,
    selector?: string
  ): Promise<Buffer> {
    if (selector) {
      // Highlight element before screenshot
      await page.evaluate((sel) => {
        const element = document.querySelector(sel);
        if (element) {
          const rect = element.getBoundingClientRect();
          const highlight = document.createElement('div');
          highlight.style.position = 'fixed';
          highlight.style.left = `${rect.left}px`;
          highlight.style.top = `${rect.top}px`;
          highlight.style.width = `${rect.width}px`;
          highlight.style.height = `${rect.height}px`;
          highlight.style.border = '3px solid red';
          highlight.style.zIndex = '999999';
          highlight.style.pointerEvents = 'none';
          highlight.id = 'mcp-highlight';
          document.body.appendChild(highlight);
        }
      }, selector);

      // Take screenshot
      const screenshot = await page.screenshot({ fullPage: false });

      // Remove highlight
      await page.evaluate(() => {
        const highlight = document.getElementById('mcp-highlight');
        if (highlight) {
          highlight.remove();
        }
      });

      return screenshot;
    }

    return await page.screenshot({ fullPage: false });
  }
}