/**
 * Browser navigation tool for URL navigation
 * Provides direct navigation capabilities with session management
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {BrowserNavigateArgs, NavigationToolContext, ToolResult} from '@/types/index.js';
import {BrowserNavigateArgsSchema} from '@/types/index.js';

export class BrowserNavigateTool extends BaseTool {
    public readonly name = 'browser_navigate';
    public readonly description = 'Navigate to a specific URL in a browser session';
    public readonly inputSchema = zodToJsonSchema(BrowserNavigateArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserNavigateArgs>(args, BrowserNavigateArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        try {
            // Get session (session must be created first via another tool or endpoint)
            const session = await context.pageManager.getSession(validatedArgs.sessionId);
            if (!session) {
                throw new Error(`Session ${validatedArgs.sessionId} not found. Create a session first using manage_tabs or other navigation tools.`);
            }

            const beforeUrl = session.page.url();
            const beforeTitle = await session.page.title().catch(() => 'Unknown');

            // Navigate to the URL
            const response = await session.page.goto(validatedArgs.url, {
                waitUntil: validatedArgs.waitUntil,
                timeout: validatedArgs.timeout || context.config.requestTimeout
            });

            if (!response) {
                throw new Error('Navigation failed: No response received');
            }

            // Wait for the page to be fully loaded
            await session.page.waitForLoadState(validatedArgs.waitUntil);

            const afterUrl = session.page.url();
            const afterTitle = await session.page.title().catch(() => 'Unknown');

            // Handle cookie consent if needed and not already handled
            let consentResult;
            if (!session.hasConsentHandled) {
                // Note: consentHandler should be available in context or we need to use the PageManager's method
                consentResult = {
                    success: false,
                    reason: 'Cookie consent handling not implemented in navigation tool',
                    method: 'none'
                };
            } else {
                consentResult = {
                    success: true,
                    reason: 'Consent already handled in session',
                    method: 'session_cached'
                };
            }

            // Update session
            if (!session.navigationHistory.includes(afterUrl)) {
                session.navigationHistory.push(afterUrl);
            }
            session.url = afterUrl;
            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                navigation: {
                    success: true,
                    requestedUrl: validatedArgs.url,
                    finalUrl: afterUrl,
                    redirected: validatedArgs.url !== afterUrl,
                    statusCode: response.status(),
                    statusText: response.statusText(),
                    headers: response.headers(),
                    before: {
                        url: beforeUrl,
                        title: beforeTitle
                    },
                    after: {
                        url: afterUrl,
                        title: afterTitle
                    },
                    waitUntil: validatedArgs.waitUntil,
                    loadTime: Date.now() - new Date().getTime()
                },
                cookieConsent: consentResult
            });

        } catch (error) {
            throw new Error(`Navigation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}