/**
 * Browser handle dialog tool for alert/confirm/prompt management
 * Provides comprehensive dialog handling capabilities
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '../core/toolRegistry.js';
import type {BrowserHandleDialogArgs, NavigationToolContext, ToolResult} from '../types/index.js';
import {BrowserHandleDialogArgsSchema} from '../types/index.js';

interface DialogInfo {
    type: string;
    message: string;
    defaultValue?: string;
    timestamp: number;
}

export class BrowserHandleDialogTool extends BaseTool {
    public readonly name = 'browser_handle_dialog';
    public readonly description = 'Handle JavaScript dialogs (alert, confirm, prompt)';
    public readonly inputSchema = zodToJsonSchema(BrowserHandleDialogArgsSchema);

    private dialogQueue: Map<string, DialogInfo[]> = new Map();

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserHandleDialogArgs>(args, BrowserHandleDialogArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            if (validatedArgs.action === 'message') {
                // Just return any pending dialog messages
                const pendingDialogs = this.dialogQueue.get(validatedArgs.sessionId) || [];

                return this.createResult({
                    sessionId: session.id,
                    url: session.url,
                    navigationHistory: session.navigationHistory,
                    hasConsentHandled: session.hasConsentHandled,
                    timestamp: new Date().toISOString(),
                    dialogHandling: {
                        action: 'message',
                        success: true,
                        pendingDialogs,
                        dialogCount: pendingDialogs.length
                    }
                });
            }

            // Set up dialog handler for the session
            const dialogPromise = this.setupDialogHandler(session.page, validatedArgs.sessionId, validatedArgs.action, validatedArgs.promptText);

            // Wait for dialog to appear or timeout
            const timeoutMs = validatedArgs.timeout || context.config.requestTimeout;

            let dialogResult;
            try {
                dialogResult = await Promise.race([
                    dialogPromise,
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Dialog timeout')), timeoutMs)
                    )
                ]);
            } catch (error) {
                // Check if we have any dialogs in queue
                const pendingDialogs = this.dialogQueue.get(validatedArgs.sessionId) || [];
                if (pendingDialogs.length === 0) {
                    throw new Error(`No dialog appeared within timeout: ${error instanceof Error ? error.message : String(error)}`);
                }

                // Handle the most recent dialog
                const latestDialog = pendingDialogs[pendingDialogs.length - 1];
                dialogResult = {
                    handled: true,
                    action: validatedArgs.action,
                    dialogType: latestDialog.type,
                    message: latestDialog.message,
                    defaultValue: latestDialog.defaultValue,
                    response: validatedArgs.promptText
                };
            }

            // Update session
            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                dialogHandling: {
                    action: validatedArgs.action,
                    success: true,
                    dialog: dialogResult,
                    promptText: validatedArgs.promptText
                }
            });

        } catch (error) {
            throw new Error(`Dialog handling failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async setupDialogHandler(page: any, sessionId: string, action: string, promptText?: string): Promise<any> {
        return new Promise((resolve, reject) => {
            let dialogHandler: ((dialog: any) => Promise<void>) | null = null;

            const cleanup = () => {
                if (dialogHandler) {
                    page.removeListener('dialog', dialogHandler);
                }
            };

            dialogHandler = async (dialog: any) => {
                try {
                    const dialogInfo: DialogInfo = {
                        type: dialog.type(),
                        message: dialog.message(),
                        defaultValue: dialog.defaultValue(),
                        timestamp: Date.now()
                    };

                    // Store dialog info
                    if (!this.dialogQueue.has(sessionId)) {
                        this.dialogQueue.set(sessionId, []);
                    }
                    this.dialogQueue.get(sessionId)!.push(dialogInfo);

                    // Handle the dialog based on action
                    switch (action) {
                        case 'accept':
                            if (dialog.type() === 'prompt' && promptText !== undefined) {
                                await dialog.accept(promptText);
                            } else {
                                await dialog.accept();
                            }
                            break;

                        case 'dismiss':
                            await dialog.dismiss();
                            break;

                        default:
                            await dialog.dismiss();
                            break;
                    }

                    cleanup();
                    resolve({
                        handled: true,
                        action,
                        dialogType: dialogInfo.type,
                        message: dialogInfo.message,
                        defaultValue: dialogInfo.defaultValue,
                        response: action === 'accept' && dialog.type() === 'prompt' ? promptText : undefined
                    });

                } catch (error) {
                    cleanup();
                    reject(error);
                }
            };

            // Add dialog listener
            page.on('dialog', dialogHandler);

            // Set a timeout to clean up if no dialog appears
            setTimeout(() => {
                cleanup();
                reject(new Error('No dialog appeared within expected timeframe'));
            }, 10000); // 10 second internal timeout
        });
    }

    // Helper method to check for existing dialogs
    private async checkForExistingDialogs(page: any): Promise<boolean> {
        try {
            // Try to detect if there are any visible modal dialogs
            return await page.evaluate(() => {
                // Check for common dialog selectors
                const dialogSelectors = [
                    '[role="dialog"]',
                    '[role="alertdialog"]',
                    '.modal',
                    '.dialog',
                    '.alert',
                    '.popup'
                ];

                for (const selector of dialogSelectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        const style = getComputedStyle(element);
                        if (style.display !== 'none' && style.visibility !== 'hidden') {
                            return true;
                        }
                    }
                }

                return false;
            });
        } catch {
            return false;
        }
    }

    // Clean up old dialog entries for memory management
    private cleanupDialogQueue(sessionId: string, maxAge: number = 300000) { // 5 minutes
        const dialogs = this.dialogQueue.get(sessionId);
        if (!dialogs) return;

        const now = Date.now();
        const recentDialogs = dialogs.filter(dialog => (now - dialog.timestamp) < maxAge);

        if (recentDialogs.length !== dialogs.length) {
            this.dialogQueue.set(sessionId, recentDialogs);
        }
    }
}