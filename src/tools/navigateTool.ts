/**
 * Navigate tool - Navigate to URL with optional cookie consent handling
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {NavigateArgs, NavigationToolContext, ToolResult} from '@/types/index.js';
import {NavigateArgsSchema} from '@/types/index.js';

export class NavigateTool extends BaseTool {
    public readonly name = 'navigate';
    public readonly description = 'Navigate to a URL in a browser session with automatic cookie consent handling';
    public readonly inputSchema = zodToJsonSchema(NavigateArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<NavigateArgs>(args, NavigateArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available');
        }

        let session = null;
        if (validatedArgs.sessionId) {
            session = await context.pageManager.getSession(validatedArgs.sessionId);
            if (!session) {
                throw new Error(`Session ${validatedArgs.sessionId} not found`);
            }
        } else {
            // Create new session
            const browser = await context.browserPool.getBrowser();
            if (!browser) {
                throw new Error('No browser available from pool');
            }
            const browserContext = await browser.newContext();
            const sessionId = await context.pageManager.createSession(browserContext);
            session = await context.pageManager.getSession(sessionId);
            if (!session) {
                throw new Error('Failed to create new session');
            }
        }

        try {
            // Navigate to URL
            await session.page.goto(validatedArgs.url, {
                waitUntil: validatedArgs.waitUntil || 'domcontentloaded',
                timeout: context.config.requestTimeout
            });

            session.url = validatedArgs.url;
            session.navigationHistory.push(validatedArgs.url);

            // Handle cookie consent if requested
            if (validatedArgs.handleConsent && !session.hasConsentHandled) {
                try {
                    // Use ConsentHandler from context - create one if not available
                    const consentHandler = new (await import('../core/consentHandler.js')).ConsentHandler();
                    const consentResult = await consentHandler.handleCookieConsent(session.page);

                    if (consentResult.success) {
                        session.hasConsentHandled = true;
                    }
                } catch (error) {
                    // Log but don't fail navigation if consent handling fails
                    console.warn('Cookie consent handling failed during navigation', {
                        url: validatedArgs.url,
                        error
                    });
                }
            }

            // Wait for specific selector if provided - not implemented yet in schema
            // if (validatedArgs.waitForSelector) {
            //   await session.page.waitForSelector(validatedArgs.waitForSelector, {
            //     timeout: context.config.requestTimeout,
            //     state: 'visible'
            //   });
            // }

            // Get page state after navigation
            const title = await session.page.title();
            const finalUrl = session.page.url();

            // Take a snapshot for visual confirmation
            const screenshot = await session.page.screenshot({fullPage: false});

            return this.createResult({
                success: true,
                sessionId: session.id,
                url: finalUrl,
                title,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                screenshot: screenshot.toString('base64')
            });
        } catch (error: unknown) {
            throw new Error(`Navigation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}