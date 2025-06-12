/**
 * Browser select option tool for dropdown selection
 * Provides comprehensive dropdown and select element interaction
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {BrowserSelectOptionArgs, NavigationToolContext, ToolResult} from '@/types/index.js';
import {BrowserSelectOptionArgsSchema} from '@/types/index.js';

export class BrowserSelectOptionTool extends BaseTool {
    public readonly name = 'browser_select_option';
    public readonly description = 'Select options from dropdown menus and select elements';
    public readonly inputSchema = zodToJsonSchema(BrowserSelectOptionArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserSelectOptionArgs>(args, BrowserSelectOptionArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Validate element exists and is a select element
            const element = session.page.locator(validatedArgs.selector).first();

            // Wait for element to be visible
            await element.waitFor({
                state: 'visible',
                timeout: validatedArgs.timeout || context.config.requestTimeout
            });

            // Get element information before selection
            const beforeInfo = await this.getSelectElementInfo(session.page, validatedArgs.selector);

            if (!beforeInfo.exists) {
                throw new Error(`Element with selector '${validatedArgs.selector}' not found`);
            }

            if (!beforeInfo.isSelectElement) {
                throw new Error(`Element with selector '${validatedArgs.selector}' is not a select element`);
            }

            // Prepare selection options
            const selectionResults: Array<Record<string, unknown>> = [];

            // Select by values if provided
            if (validatedArgs.values && validatedArgs.values.length > 0) {
                for (const value of validatedArgs.values) {
                    try {
                        await element.selectOption({value});
                        selectionResults.push({method: 'value', target: value, success: true});
                    } catch (error) {
                        selectionResults.push({
                            method: 'value',
                            target: value,
                            success: false,
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
            }

            // Select by labels if provided
            if (validatedArgs.labels && validatedArgs.labels.length > 0) {
                for (const label of validatedArgs.labels) {
                    try {
                        await element.selectOption({label});
                        selectionResults.push({method: 'label', target: label, success: true});
                    } catch (error) {
                        selectionResults.push({
                            method: 'label',
                            target: label,
                            success: false,
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
            }

            // Select by indices if provided
            if (validatedArgs.indices && validatedArgs.indices.length > 0) {
                for (const index of validatedArgs.indices) {
                    try {
                        await element.selectOption({index});
                        selectionResults.push({method: 'index', target: index, success: true});
                    } catch (error) {
                        selectionResults.push({
                            method: 'index',
                            target: index,
                            success: false,
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
            }

            // If no selection criteria provided, get available options
            if (!validatedArgs.values && !validatedArgs.labels && !validatedArgs.indices) {
                const availableOptions = await this.getAvailableOptions(session.page, validatedArgs.selector);
                return this.createResult({
                    sessionId: session.id,
                    url: session.url,
                    navigationHistory: session.navigationHistory,
                    hasConsentHandled: session.hasConsentHandled,
                    timestamp: new Date().toISOString(),
                    selectOption: {
                        success: true,
                        selector: validatedArgs.selector,
                        action: 'list_options',
                        availableOptions,
                        message: 'No selection criteria provided. Returning available options.'
                    }
                });
            }

            // Get element information after selection
            const afterInfo = await this.getSelectElementInfo(session.page, validatedArgs.selector);

            // Update session
            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                selectOption: {
                    success: selectionResults.some(r => r.success),
                    selector: validatedArgs.selector,
                    action: 'select',
                    selectionResults,
                    elementInfo: {
                        before: beforeInfo,
                        after: afterInfo
                    },
                    changes: {
                        selectedValueChanged: beforeInfo.selectedValue !== afterInfo.selectedValue,
                        selectedIndexChanged: beforeInfo.selectedIndex !== afterInfo.selectedIndex,
                        selectedTextChanged: beforeInfo.selectedText !== afterInfo.selectedText
                    }
                }
            });

        } catch (error) {
            throw new Error(`Select option operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getSelectElementInfo(page: import('playwright').Page, selector: string) {
        try {
            return await page.evaluate((sel: string) => {
                const element = document.querySelector(sel) as HTMLSelectElement | null;
                if (!element) {
                    return {
                        exists: false,
                        isSelectElement: false,
                        enabled: false,
                        selectedValue: '',
                        selectedIndex: -1,
                        selectedText: '',
                        multiple: false,
                        options: [],
                        optionCount: 0
                    };
                }

                const isSelect = element.tagName === 'SELECT';

                if (!isSelect) {
                    return {
                        exists: true,
                        isSelectElement: false,
                        enabled: false,
                        selectedValue: '',
                        selectedIndex: -1,
                        selectedText: '',
                        multiple: false,
                        options: [],
                        optionCount: 0,
                        actualTagName: element.tagName
                    };
                }

                // Get all options
                const options = Array.from(element.options).map((option, index) => ({
                    index,
                    value: option.value,
                    text: option.text,
                    selected: option.selected,
                    disabled: option.disabled
                }));

                return {
                    exists: true,
                    isSelectElement: true,
                    enabled: !element.disabled,
                    selectedValue: element.value,
                    selectedIndex: element.selectedIndex,
                    selectedText: element.selectedIndex >= 0 ? element.options[element.selectedIndex].text : '',
                    multiple: element.multiple,
                    options,
                    optionCount: element.options.length,
                    disabled: element.disabled,
                    required: element.required,
                    name: element.name,
                    id: element.id
                };
            }, selector);
        } catch {
            return {
                exists: false,
                isSelectElement: false,
                enabled: false,
                selectedValue: '',
                selectedIndex: -1,
                selectedText: '',
                multiple: false,
                options: [],
                optionCount: 0
            };
        }
    }

    private async getAvailableOptions(page: import('playwright').Page, selector: string) {
        try {
            return await page.evaluate((sel: string) => {
                const element = document.querySelector(sel) as HTMLSelectElement | null;
                if (!element || element.tagName !== 'SELECT') {
                    return [];
                }

                return Array.from(element.options).map((option, index) => ({
                    index,
                    value: option.value,
                    text: option.text,
                    selected: option.selected,
                    disabled: option.disabled,
                    label: option.label || option.text
                }));
            }, selector);
        } catch {
            return [];
        }
    }
}