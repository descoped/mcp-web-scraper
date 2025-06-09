/**
 * Browser pool implementation for managing Playwright browser instances
 * Provides efficient resource management and isolation
 */

import { chromium, type Browser } from 'playwright';
import type { IBrowserPool } from '../types/index.js';

export class BrowserPool implements IBrowserPool {
  private readonly _maxBrowsers: number;
  private readonly browsers: Browser[] = [];
  private _activeBrowsers: number = 0;
  private readonly queue: Array<(browser: Browser | null) => void> = [];
  private isShuttingDown: boolean = false;

  constructor(maxBrowsers: number = 5) {
    this._maxBrowsers = maxBrowsers;
  }

  get maxBrowsers(): number {
    return this._maxBrowsers;
  }

  get activeBrowsers(): number {
    return this._activeBrowsers;
  }

  get availableBrowsers(): number {
    return this.browsers.length;
  }

  /**
   * Get a browser instance from the pool or create a new one
   */
  async getBrowser(): Promise<Browser | null> {
    if (this.isShuttingDown) {
      return null;
    }

    // Return existing browser if available
    if (this.browsers.length > 0) {
      const browser = this.browsers.pop();
      if (browser && !browser.isConnected()) {
        // Browser disconnected, try to get another one
        this._activeBrowsers = Math.max(0, this._activeBrowsers - 1);
        return this.getBrowser();
      }
      return browser || null;
    }

    // Create new browser if under limit
    if (this._activeBrowsers < this._maxBrowsers) {
      try {
        this._activeBrowsers++;
        const browser = await chromium.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
          ]
        });

        // Handle browser disconnection
        browser.on('disconnected', () => {
          this._activeBrowsers = Math.max(0, this._activeBrowsers - 1);
          console.warn('Browser disconnected unexpectedly');
        });

        return browser;
      } catch (error) {
        this._activeBrowsers = Math.max(0, this._activeBrowsers - 1);
        console.error('Failed to create browser:', error);
        return null;
      }
    }

    // Wait for browser to become available
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        const index = this.queue.indexOf(resolve);
        if (index !== -1) {
          this.queue.splice(index, 1);
          resolve(null);
        }
      }, 30000); // 30 second timeout

      const wrappedResolve = (browser: Browser | null) => {
        clearTimeout(timeout);
        resolve(browser);
      };

      this.queue.push(wrappedResolve);
    });
  }

  /**
   * Release a browser back to the pool
   */
  releaseBrowser(browser: Browser): void {
    if (this.isShuttingDown) {
      browser.close().catch(console.error);
      return;
    }

    // Check if browser is still connected
    if (!browser.isConnected()) {
      this._activeBrowsers = Math.max(0, this._activeBrowsers - 1);
      return;
    }

    // If there's a queued request, fulfill it immediately
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      if (resolve) {
        resolve(browser);
        return;
      }
    }

    // Add back to pool if under limit
    if (this.browsers.length < this._maxBrowsers) {
      this.browsers.push(browser);
    } else {
      // Close excess browser
      browser.close().catch(console.error);
      this._activeBrowsers = Math.max(0, this._activeBrowsers - 1);
    }
  }

  /**
   * Clean up all browsers and reject queued requests
   */
  async cleanup(): Promise<void> {
    this.isShuttingDown = true;

    // Reject all queued requests
    while (this.queue.length > 0) {
      const resolve = this.queue.shift();
      if (resolve) {
        resolve(null);
      }
    }

    // Close all pooled browsers
    const closePromises = this.browsers.map(browser => 
      browser.close().catch(error => {
        console.error('Error closing browser:', error);
      })
    );

    await Promise.all(closePromises);
    
    this.browsers.length = 0;
    this._activeBrowsers = 0;

    console.log('Browser pool cleanup completed');
  }

  /**
   * Get pool statistics for monitoring
   */
  getStats(): {
    maxBrowsers: number;
    activeBrowsers: number;
    availableBrowsers: number;
    queuedRequests: number;
    isShuttingDown: boolean;
  } {
    return {
      maxBrowsers: this._maxBrowsers,
      activeBrowsers: this._activeBrowsers,
      availableBrowsers: this.browsers.length,
      queuedRequests: this.queue.length,
      isShuttingDown: this.isShuttingDown,
    };
  }
}