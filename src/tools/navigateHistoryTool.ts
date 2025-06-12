/**
 * Browser history navigation tool for back/forward navigation
 * Provides comprehensive history navigation capabilities
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {HistoryNavigateArgs, NavigationToolContext, ToolResult} from '@/types/index.js';
import {HistoryNavigateArgsSchema} from '@/types/index.js';

export class NavigateHistoryTool extends BaseTool {
    public readonly name = 'navigate_history';
    public readonly description = 'Navigate browser history: go back or forward in browser history';
    public readonly inputSchema = zodToJsonSchema(HistoryNavigateArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<HistoryNavigateArgs>(args, HistoryNavigateArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            const beforeUrl = session.page.url();
            const beforeTitle = await session.page.title().catch(() => 'Unknown');

            // Get history information before navigation
            const historyInfo = await this.getHistoryInfo(session.page);

            // Validate navigation is possible
            if (validatedArgs.direction === 'back' && !historyInfo.canGoBack) {
                throw new Error('Cannot go back: no previous page in history');
            }

            if (validatedArgs.direction === 'forward' && !historyInfo.canGoForward) {
                throw new Error('Cannot go forward: no next page in history');
            }

            // Perform navigation
            // let navigationPromise: Promise<unknown>;

            if (validatedArgs.direction === 'back') {
                // Handle multiple steps back
                for (let i = 0; i < validatedArgs.steps; i++) {
                    const canGoBack = await this.canNavigateBack(session.page);
                    if (!canGoBack) {
                        if (i === 0) {
                            throw new Error('Cannot go back: no previous page in history');
                        }
                        break; // Stop if we can't go back further
                    }
                    await session.page.goBack({waitUntil: 'domcontentloaded'});
                }
            } else {
                // Handle multiple steps forward
                for (let i = 0; i < validatedArgs.steps; i++) {
                    const canGoForward = await this.canNavigateForward(session.page);
                    if (!canGoForward) {
                        if (i === 0) {
                            throw new Error('Cannot go forward: no next page in history');
                        }
                        break; // Stop if we can't go forward further
                    }
                    await session.page.goForward({waitUntil: 'domcontentloaded'});
                }
            }

            // Wait for navigation to complete
            await session.page.waitForLoadState('domcontentloaded');

            const afterUrl = session.page.url();
            const afterTitle = await session.page.title().catch(() => 'Unknown');

            // Update session navigation history
            if (!session.navigationHistory.includes(afterUrl)) {
                session.navigationHistory.push(afterUrl);
            }
            session.url = afterUrl;
            session.lastActivity = new Date();

            // Get updated history info
            const updatedHistoryInfo = await this.getHistoryInfo(session.page);

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                historyNavigation: {
                    direction: validatedArgs.direction,
                    steps: validatedArgs.steps,
                    success: true,
                    before: {
                        url: beforeUrl,
                        title: beforeTitle
                    },
                    after: {
                        url: afterUrl,
                        title: afterTitle
                    },
                    historyInfo: updatedHistoryInfo,
                    urlChanged: beforeUrl !== afterUrl
                }
            });

        } catch (error) {
            throw new Error(`History navigation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getHistoryInfo(page: import('playwright').Page): Promise<{
        canGoBack: boolean;
        canGoForward: boolean;
        currentIndex: number;
        historyLength: number;
    }> {
        try {
            const historyInfo = await page.evaluate(() => {
                return {
                    canGoBack: history.length > 1,
                    canGoForward: false, // Browser doesn't expose this directly
                    currentIndex: -1, // Browser doesn't expose this
                    historyLength: history.length
                };
            });

            // Test actual navigation capability
            const canGoBack = await this.canNavigateBack(page);
            const canGoForward = await this.canNavigateForward(page);

            return {
                ...historyInfo,
                canGoBack,
                canGoForward
            };
        } catch {
            return {
                canGoBack: false,
                canGoForward: false,
                currentIndex: 0,
                historyLength: 1
            };
        }
    }

    private async canNavigateBack(page: import('playwright').Page): Promise<boolean> {
        try {
            // Use a more reliable method to check if back navigation is possible
            const result = await page.evaluate(() => {
                const currentUrl = window.location.href;
                const referrer = document.referrer;

                // If there's a referrer and it's different from current URL, likely can go back
                if (referrer && referrer !== currentUrl) {
                    return true;
                }

                // Check if history length indicates we can go back
                return history.length > 1;
            });

            return result;
        } catch {
            return false;
        }
    }

    private async canNavigateForward(page: import('playwright').Page): Promise<boolean> {
        try {
            // This is tricky to detect reliably in browsers
            // We'll use a test approach with timeout
            const currentUrl = page.url();

            try {
                // Attempt to go forward with a very short timeout
                await Promise.race([
                    page.goForward({waitUntil: 'commit'}),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 100))
                ]);

                const newUrl = page.url();
                if (newUrl !== currentUrl) {
                    // Forward navigation worked, go back to original state
                    await page.goBack({waitUntil: 'commit'});
                    return true;
                }

                return false;
            } catch {
                return false;
            }
        } catch {
            return false;
        }
    }

    // Helper method to get navigation state for debugging
    private async getNavigationState(page: import('playwright').Page): Promise<{
        url: string;
        title: string;
        referrer: string;
        historyLength: number;
        canGoBack: boolean;
        canGoForward: boolean;
    }> {
        try {
            const state = await page.evaluate(() => ({
                url: window.location.href,
                title: document.title,
                referrer: document.referrer,
                historyLength: history.length
            }));

            const canGoBack = await this.canNavigateBack(page);
            const canGoForward = await this.canNavigateForward(page);

            return {
                ...state,
                canGoBack,
                canGoForward
            };
        } catch {
            return {
                url: page.url(),
                title: 'Unknown',
                referrer: '',
                historyLength: 1,
                canGoBack: false,
                canGoForward: false
            };
        }
    }
}