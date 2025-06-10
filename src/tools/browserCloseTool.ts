/**
 * Browser close tool for page lifecycle management
 * Provides page closing capabilities with cleanup
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '../core/toolRegistry.js';
import type {BrowserCloseArgs, NavigationToolContext, ToolResult} from '../types/index.js';
import {BrowserCloseArgsSchema} from '../types/index.js';

export class BrowserCloseTool extends BaseTool {
    public readonly name = 'browser_close';
    public readonly description = 'Close browser pages and clean up sessions';
    public readonly inputSchema = zodToJsonSchema(BrowserCloseArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserCloseArgs>(args, BrowserCloseArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Collect session information before closing
            const beforeCloseInfo = await this.getSessionInfo(session);

            // Handle beforeunload events if requested
            if (validatedArgs.runBeforeUnload) {
                try {
                    // This will trigger any beforeunload handlers
                    await session.page.evaluate(() => {
                        window.dispatchEvent(new Event('beforeunload'));
                    });

                    // Give time for any beforeunload dialogs or operations
                    await session.page.waitForTimeout(1000);
                } catch (error) {
                    // Continue with close even if beforeunload fails
                    console.warn('beforeunload execution failed:', error);
                }
            }

            // Check for any unsaved changes or forms
            const unsavedChanges = await this.checkForUnsavedChanges(session.page);

            // Close the page
            await session.page.close();

            // Clean up the session from page manager (using closeSession method)
            await context.pageManager.closeSession(validatedArgs.sessionId);

            return this.createResult({
                sessionId: validatedArgs.sessionId,
                timestamp: new Date().toISOString(),
                pageClose: {
                    success: true,
                    sessionId: validatedArgs.sessionId,
                    runBeforeUnload: validatedArgs.runBeforeUnload,
                    beforeCloseInfo,
                    unsavedChanges,
                    finalUrl: beforeCloseInfo.url,
                    sessionDuration: Date.now() - new Date(beforeCloseInfo.sessionCreated).getTime(),
                    totalNavigations: beforeCloseInfo.navigationHistory.length,
                    consentHandled: beforeCloseInfo.hasConsentHandled
                }
            });

        } catch (error) {
            throw new Error(`Page close operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getSessionInfo(session: any) {
        try {
            const url = session.page.url();
            const title = await session.page.title().catch(() => 'Unknown');

            // Get page statistics
            const pageStats = await session.page.evaluate(() => {
                return {
                    documentReadyState: document.readyState,
                    elementCount: document.querySelectorAll('*').length,
                    formCount: document.forms.length,
                    linkCount: document.links.length,
                    imageCount: document.images.length,
                    scriptCount: document.scripts.length,
                    hasLocalStorage: !!window.localStorage && window.localStorage.length > 0,
                    hasSessionStorage: !!window.sessionStorage && window.sessionStorage.length > 0,
                    cookieCount: document.cookie.split(';').filter(c => c.trim()).length
                };
            });

            return {
                url,
                title,
                sessionCreated: session.created || new Date().toISOString(),
                lastActivity: session.lastActivity || new Date(),
                navigationHistory: session.navigationHistory || [],
                hasConsentHandled: session.hasConsentHandled || false,
                pageStats
            };
        } catch (error) {
            return {
                url: 'unknown',
                title: 'unknown',
                sessionCreated: new Date().toISOString(),
                lastActivity: new Date(),
                navigationHistory: [],
                hasConsentHandled: false,
                pageStats: {},
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private async checkForUnsavedChanges(page: any): Promise<{
        hasUnsavedForms: boolean;
        formCount: number;
        modifiedInputs: number;
        unsavedTextAreas: number;
        hasLocalStorageChanges: boolean;
    }> {
        try {
            return await page.evaluate(() => {
                let modifiedInputs = 0;
                let unsavedTextAreas = 0;
                let hasUnsavedForms = false;

                // Check all input elements for modifications
                const inputs = document.querySelectorAll('input, textarea, select');
                inputs.forEach(input => {
                    const element = input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

                    // Check if input appears to have been modified
                    if (element.tagName === 'INPUT') {
                        const inputEl = element as HTMLInputElement;
                        if (inputEl.type !== 'submit' && inputEl.type !== 'button' && inputEl.type !== 'reset') {
                            if (inputEl.value && inputEl.value !== inputEl.defaultValue) {
                                modifiedInputs++;
                                hasUnsavedForms = true;
                            }
                        }
                    } else if (element.tagName === 'TEXTAREA') {
                        const textareaEl = element as HTMLTextAreaElement;
                        if (textareaEl.value && textareaEl.value !== textareaEl.defaultValue) {
                            unsavedTextAreas++;
                            hasUnsavedForms = true;
                        }
                    } else if (element.tagName === 'SELECT') {
                        const selectEl = element as HTMLSelectElement;
                        // Check if selected option differs from default
                        Array.from(selectEl.options).forEach((option, index) => {
                            if (option.selected !== option.defaultSelected) {
                                hasUnsavedForms = true;
                            }
                        });
                    }
                });

                // Check for localStorage changes (basic heuristic)
                const hasLocalStorageChanges = window.localStorage && window.localStorage.length > 0;

                return {
                    hasUnsavedForms,
                    formCount: document.forms.length,
                    modifiedInputs,
                    unsavedTextAreas,
                    hasLocalStorageChanges
                };
            });
        } catch {
            return {
                hasUnsavedForms: false,
                formCount: 0,
                modifiedInputs: 0,
                unsavedTextAreas: 0,
                hasLocalStorageChanges: false
            };
        }
    }
}