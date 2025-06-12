/**
 * Browser pool implementation for managing Playwright browser instances
 * Provides efficient resource management and isolation
 */

import {type Browser, chromium} from 'playwright';
import type {IBrowserPool} from '@/types/index.js';

export class BrowserPool implements IBrowserPool {
    private readonly _maxBrowsers: number;
    private readonly browsers: Browser[] = [];
    private _activeBrowsers: number = 0;
    private readonly queue: Array<(browser: Browser | null) => void> = [];
    private isShuttingDown: boolean = false;
    private readonly activeBrowserIds: Set<string> = new Set();
    private processCleanupTimeout?: NodeJS.Timeout;

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
                        '--disable-features=VizDisplayCompositor',
                        '--disable-background-timer-throttling',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-renderer-backgrounding'
                    ]
                });

                // Track browser instance
                const browserId = `browser-${Date.now()}-${Math.random().toString(36).substring(2)}`;
                this.activeBrowserIds.add(browserId);

                // Monitor browser process
                this.monitorBrowserProcess(browser, browserId);

                // Handle browser disconnection
                browser.on('disconnected', () => {
                    this._activeBrowsers = Math.max(0, this._activeBrowsers - 1);
                    this.activeBrowserIds.delete(browserId);
                    console.warn(`Browser ${browserId} disconnected unexpectedly`);
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
            this.closeBrowserSafely(browser);
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
        const closePromises = this.browsers.map(browser => this.closeBrowserSafely(browser));

        await Promise.all(closePromises);

        this.browsers.length = 0;
        this._activeBrowsers = 0;

        // Force cleanup any remaining processes after a delay
        this.scheduleProcessCleanup();

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

    private monitorBrowserProcess(browser: Browser, browserId: string): void {
        // Monitor browser health
        const healthCheck = setInterval(async () => {
            try {
                if (!browser.isConnected()) {
                    clearInterval(healthCheck);
                    this.activeBrowserIds.delete(browserId);
                    console.log(`Browser ${browserId} health check: disconnected`);
                }
            } catch (error) {
                clearInterval(healthCheck);
                this.activeBrowserIds.delete(browserId);
                console.warn(`Browser ${browserId} health check failed:`, error);
            }
        }, 30000); // Check every 30 seconds

        // Clean up health check when browser disconnects
        browser.on('disconnected', () => {
            clearInterval(healthCheck);
        });
    }

    private async closeBrowserSafely(browser: Browser): Promise<void> {
        try {
            if (browser.isConnected()) {
                // Close all contexts first
                const contexts = browser.contexts();
                await Promise.all(contexts.map(context =>
                    context.close().catch(err => console.warn('Error closing context:', err))
                ));

                // Then close the browser
                await browser.close();
            }
        } catch (error) {
            console.error('Error closing browser safely:', error);
            // Force process termination if needed
            try {
                await browser.close();
            } catch (e) {
                console.error('Force close failed:', e);
            }
        }
    }

    private scheduleProcessCleanup(): void {
        if (this.processCleanupTimeout) {
            clearTimeout(this.processCleanupTimeout);
        }

        this.processCleanupTimeout = setTimeout(() => {
            console.log('Running final process cleanup check...');
            // This is a safety net - normally all processes should be closed by now
            if (this.activeBrowserIds.size > 0) {
                console.warn(`Warning: ${this.activeBrowserIds.size} browser processes may still be active`);
                this.activeBrowserIds.clear();
            }
        }, 5000); // Wait 5 seconds after cleanup
    }
}