/**
 * Browser wait for page state tool (Simplified version)
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {BrowserWaitForPageStateArgs, NavigationToolContext, ToolResult} from '@/types/index.js';
import {BrowserWaitForPageStateArgsSchema} from '@/types/index.js';

export class BrowserWaitForPageStateTool extends BaseTool {
    public readonly name = 'browser_wait_for_page_state';
    public readonly description = 'Wait for specific page states with advanced condition monitoring';
    public readonly inputSchema = zodToJsonSchema(BrowserWaitForPageStateArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserWaitForPageStateArgs>(args, BrowserWaitForPageStateArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            const startTime = Date.now();
            let success = false;
            let conditionMet = false;

            // Wait for basic page state
            try {
                switch (validatedArgs.state) {
                    case 'load':
                        await session.page.waitForLoadState('load', {timeout: validatedArgs.timeout});
                        break;
                    case 'domcontentloaded':
                        await session.page.waitForLoadState('domcontentloaded', {timeout: validatedArgs.timeout});
                        break;
                    case 'networkidle':
                        await session.page.waitForLoadState('networkidle', {timeout: validatedArgs.timeout});
                        break;
                    default:
                        await session.page.waitForLoadState('load', {timeout: validatedArgs.timeout});
                }
                success = true;
            } catch {
                // Timeout occurred
            }

            // Check additional conditions if provided
            if (success && validatedArgs.condition) {
                try {
                    if (validatedArgs.condition.selector) {
                        await session.page.waitForSelector(validatedArgs.condition.selector, {
                            timeout: Math.max(0, validatedArgs.timeout - (Date.now() - startTime))
                        });
                        conditionMet = true;
                    }

                    if (validatedArgs.condition.text) {
                        await session.page.waitForFunction(
                            (text: string) => document.body.textContent?.includes(text) || false,
                            validatedArgs.condition.text,
                            {timeout: Math.max(0, validatedArgs.timeout - (Date.now() - startTime))}
                        );
                        conditionMet = true;
                    }

                    if (validatedArgs.condition.url) {
                        const currentUrl = session.page.url();
                        conditionMet = currentUrl.includes(validatedArgs.condition.url);
                    }
                } catch {
                    conditionMet = false;
                }
            } else if (success) {
                conditionMet = true;
            }

            const waitTime = Date.now() - startTime;
            const finalState = await session.page.evaluate(() => document.readyState);

            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                pageStateWait: {
                    success: success && conditionMet,
                    requestedState: validatedArgs.state,
                    condition: validatedArgs.condition,
                    result: {
                        success: success && conditionMet,
                        conditionMet,
                        finalState,
                        waitTime,
                        pageMetrics: {
                            loadTime: waitTime,
                            domContentLoadedTime: waitTime,
                            resourceCount: 0,
                            errorCount: 0
                        }
                    },
                    performance: {
                        totalWaitTime: waitTime,
                        successRate: (success && conditionMet) ? 100 : 0
                    },
                    recommendations: success && conditionMet ?
                        ['Wait operation completed successfully'] :
                        ['Wait condition was not met within timeout period']
                }
            });

        } catch (error) {
            throw new Error(`Page state wait failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}