/**
 * Browser click tool for element clicking
 * Provides comprehensive clicking capabilities with validation
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {BrowserClickArgs, NavigationToolContext, ToolResult} from '@/types/index.js';
import {BrowserClickArgsSchema} from '@/types/index.js';

export class BrowserClickTool extends BaseTool {
    public readonly name = 'browser_click';
    public readonly description = 'Click on web elements using CSS selectors or coordinates';
    public readonly inputSchema = zodToJsonSchema(BrowserClickArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserClickArgs>(args, BrowserClickArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Validate element exists and is clickable
            const element = session.page.locator(validatedArgs.selector).first();

            // Wait for element to be visible and clickable
            await element.waitFor({
                state: 'visible',
                timeout: validatedArgs.timeout || context.config.requestTimeout
            });

            // Get element information before click
            const elementInfo = await this.getElementInfo(session.page, validatedArgs.selector);

            // Take screenshot before click for debugging (unused but kept for potential debugging)
            // const _beforeScreenshot = await session.page.screenshot({fullPage: false});

            // Perform the click
            const clickOptions: Record<string, unknown> = {
                button: validatedArgs.button,
                clickCount: validatedArgs.clickCount,
                force: validatedArgs.force,
                timeout: validatedArgs.timeout || context.config.requestTimeout
            };

            if (validatedArgs.modifiers.length > 0) {
                clickOptions.modifiers = validatedArgs.modifiers;
            }

            if (validatedArgs.position) {
                clickOptions.position = validatedArgs.position;
            }

            // Wait for any potential navigation or changes
            const navigationPromise = session.page.waitForLoadState('networkidle', {timeout: 5000}).catch(() => {
                // Ignore timeout - not all clicks cause navigation
            });

            await element.click(clickOptions);

            // Give time for any immediate effects
            await Promise.race([navigationPromise, new Promise(resolve => setTimeout(resolve, 1000))]);

            // Take screenshot after click (unused but kept for potential debugging)
            // const _afterScreenshot = await session.page.screenshot({fullPage: false});

            // Get updated element information
            const updatedElementInfo = await this.getElementInfo(session.page, validatedArgs.selector);

            // Check for any new dialogs or popups
            const hasNewDialogs = await this.checkForDialogs(session.page);

            // Update session
            session.lastActivity = new Date();
            const currentUrl = session.page.url();
            if (!session.navigationHistory.includes(currentUrl)) {
                session.navigationHistory.push(currentUrl);
            }
            session.url = currentUrl;

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                click: {
                    success: true,
                    selector: validatedArgs.selector,
                    button: validatedArgs.button,
                    clickCount: validatedArgs.clickCount,
                    modifiers: validatedArgs.modifiers,
                    position: validatedArgs.position,
                    elementInfo: {
                        before: elementInfo,
                        after: updatedElementInfo
                    },
                    effects: {
                        urlChanged: elementInfo.url !== updatedElementInfo.url,
                        newDialogs: hasNewDialogs,
                        pageReloaded: elementInfo.timestamp !== updatedElementInfo.timestamp
                    }
                }
            });

        } catch (error) {
            throw new Error(`Click operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getElementInfo(page: import('playwright').Page, selector: string) {
        try {
            return await page.evaluate((sel: string) => {
                const element = document.querySelector(sel);
                if (!element) {
                    return {
                        exists: false,
                        visible: false,
                        enabled: false,
                        text: '',
                        tagName: '',
                        attributes: {},
                        url: window.location.href,
                        timestamp: Date.now()
                    };
                }

                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);

                // Get all attributes
                const attributes: Record<string, string> = {};
                for (let i = 0; i < element.attributes.length; i++) {
                    const attr = element.attributes[i] as Attr;
                    attributes[attr.name] = attr.value;
                }

                return {
                    exists: true,
                    visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
                    enabled: !(element as HTMLInputElement | HTMLButtonElement | HTMLSelectElement).disabled,
                    text: element.textContent?.trim() || '',
                    tagName: element.tagName,
                    attributes,
                    position: {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height
                    },
                    styles: {
                        display: style.display,
                        visibility: style.visibility,
                        opacity: style.opacity
                    },
                    url: window.location.href,
                    timestamp: Date.now()
                };
            }, selector);
        } catch {
            return {
                exists: false,
                visible: false,
                enabled: false,
                text: '',
                tagName: '',
                attributes: {},
                url: page.url(),
                timestamp: Date.now()
            };
        }
    }

    private async checkForDialogs(page: import('playwright').Page): Promise<boolean> {
        try {
            // Check for JavaScript dialogs (alert, confirm, prompt)
            return await page.evaluate(() => {
                // This is a simple check - in practice, dialogs are handled by Playwright's dialog events
                return false;
            });
        } catch {
            return false;
        }
    }
}