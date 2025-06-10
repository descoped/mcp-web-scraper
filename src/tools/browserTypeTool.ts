/**
 * Browser type tool for text input
 * Provides text input capabilities with clear and delay options
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '../core/toolRegistry.js';
import type {BrowserTypeArgs, NavigationToolContext, ToolResult} from '../types/index.js';
import {BrowserTypeArgsSchema} from '../types/index.js';

export class BrowserTypeTool extends BaseTool {
    public readonly name = 'browser_type';
    public readonly description = 'Type text into input fields or editable elements';
    public readonly inputSchema = zodToJsonSchema(BrowserTypeArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserTypeArgs>(args, BrowserTypeArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Validate element exists and is editable
            const element = session.page.locator(validatedArgs.selector).first();

            // Wait for element to be visible and editable
            await element.waitFor({
                state: 'visible',
                timeout: validatedArgs.timeout || context.config.requestTimeout
            });

            // Get element information before typing
            const beforeInfo = await this.getInputElementInfo(session.page, validatedArgs.selector);

            if (!beforeInfo.exists) {
                throw new Error(`Element with selector '${validatedArgs.selector}' not found`);
            }

            if (!beforeInfo.editable) {
                throw new Error(`Element with selector '${validatedArgs.selector}' is not editable`);
            }

            // Focus the element first
            await element.focus();

            // Clear existing content if requested
            if (validatedArgs.clear) {
                // Select all text and delete it
                await element.selectText();
                await element.press('Delete');

                // Alternative approach for some input types
                await element.fill('');
            }

            // Type the text with optional delay
            await element.type(validatedArgs.text, {
                delay: validatedArgs.delay
            });

            // Get element information after typing
            const afterInfo = await this.getInputElementInfo(session.page, validatedArgs.selector);

            // Update session
            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                typing: {
                    success: true,
                    selector: validatedArgs.selector,
                    text: validatedArgs.text,
                    delay: validatedArgs.delay,
                    cleared: validatedArgs.clear,
                    elementInfo: {
                        before: beforeInfo,
                        after: afterInfo
                    },
                    changes: {
                        valueChanged: beforeInfo.value !== afterInfo.value,
                        lengthBefore: beforeInfo.value.length,
                        lengthAfter: afterInfo.value.length,
                        textAdded: afterInfo.value.length - beforeInfo.value.length
                    }
                }
            });

        } catch (error) {
            throw new Error(`Type operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getInputElementInfo(page: any, selector: string) {
        try {
            return await page.evaluate((sel: string) => {
                const element = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;
                if (!element) {
                    return {
                        exists: false,
                        editable: false,
                        focused: false,
                        value: '',
                        placeholder: '',
                        type: '',
                        tagName: '',
                        disabled: true,
                        readonly: true
                    };
                }

                const isInput = element.tagName === 'INPUT';
                const isTextarea = element.tagName === 'TEXTAREA';
                const isContentEditable = element.contentEditable === 'true';
                const isEditable = (isInput || isTextarea || isContentEditable) &&
                    !element.disabled &&
                    !(element as any).readOnly;

                return {
                    exists: true,
                    editable: isEditable,
                    focused: document.activeElement === element,
                    value: isContentEditable ? element.textContent || '' : (element as any).value || '',
                    placeholder: (element as any).placeholder || '',
                    type: (element as any).type || element.tagName.toLowerCase(),
                    tagName: element.tagName,
                    disabled: element.disabled,
                    readonly: (element as any).readOnly || false,
                    contentEditable: element.contentEditable,
                    maxLength: (element as any).maxLength || -1,
                    minLength: (element as any).minLength || -1,
                    required: (element as any).required || false,
                    autocomplete: (element as any).autocomplete || '',
                    selectionStart: (element as any).selectionStart || 0,
                    selectionEnd: (element as any).selectionEnd || 0
                };
            }, selector);
        } catch {
            return {
                exists: false,
                editable: false,
                focused: false,
                value: '',
                placeholder: '',
                type: '',
                tagName: '',
                disabled: true,
                readonly: true
            };
        }
    }
}