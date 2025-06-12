/**
 * Browser press key tool for keyboard events
 * Provides keyboard input simulation including special keys and modifiers
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {BrowserPressKeyArgs, NavigationToolContext, ToolResult} from '@/types/index.js';
import {BrowserPressKeyArgsSchema} from '@/types/index.js';

export class BrowserPressKeyTool extends BaseTool {
    public readonly name = 'browser_press_key';
    public readonly description = 'Press keyboard keys including special keys and key combinations';
    public readonly inputSchema = zodToJsonSchema(BrowserPressKeyArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserPressKeyArgs>(args, BrowserPressKeyArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            let targetElement: import('playwright').Locator | import('playwright').Page;
            let beforeInfo;

            // If selector is provided, focus that element first
            if (validatedArgs.selector) {
                targetElement = session.page.locator(validatedArgs.selector).first();

                // Wait for element to be visible
                await targetElement.waitFor({
                    state: 'visible',
                    timeout: validatedArgs.timeout || context.config.requestTimeout
                });

                // Get element information before key press
                beforeInfo = await this.getElementInfo(session.page, validatedArgs.selector);

                if (!beforeInfo.exists) {
                    throw new Error(`Element with selector '${validatedArgs.selector}' not found`);
                }

                // Focus the element
                await targetElement.focus();
            } else {
                // No selector provided, use the page directly
                targetElement = session.page;
                beforeInfo = await this.getPageInfo(session.page);
            }

            // Validate and normalize the key
            const normalizedKey = this.normalizeKey(validatedArgs.key);

            // Build key combination string
            let keySequence = '';
            if (validatedArgs.modifiers.length > 0) {
                keySequence = validatedArgs.modifiers.join('+') + '+' + normalizedKey;
            } else {
                keySequence = normalizedKey;
            }

            // Record page state before key press
            const beforeUrl = session.page.url();
            const beforeTitle = await session.page.title().catch(() => 'Unknown');

            // Perform the key press
            if (validatedArgs.selector && targetElement && 'press' in targetElement) {
                const pressOptions: { delay?: number; noWaitAfter?: boolean; timeout?: number } = {};
                if (validatedArgs.delay > 0) {
                    pressOptions.delay = validatedArgs.delay;
                }
                await (targetElement as import('playwright').Locator).press(keySequence, pressOptions);
            } else {
                const pressOptions: { delay?: number } = {};
                if (validatedArgs.delay > 0) {
                    pressOptions.delay = validatedArgs.delay;
                }
                await session.page.keyboard.press(keySequence, pressOptions);
            }

            // Wait a moment for any effects to take place
            await session.page.waitForTimeout(100);

            // Get element/page information after key press
            let afterInfo;
            if (validatedArgs.selector) {
                afterInfo = await this.getElementInfo(session.page, validatedArgs.selector);
            } else {
                afterInfo = await this.getPageInfo(session.page);
            }

            // Check for page changes
            const afterUrl = session.page.url();
            const afterTitle = await session.page.title().catch(() => 'Unknown');

            // Update session
            session.lastActivity = new Date();
            if (!session.navigationHistory.includes(afterUrl)) {
                session.navigationHistory.push(afterUrl);
            }
            session.url = afterUrl;

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                keyPress: {
                    success: true,
                    key: validatedArgs.key,
                    normalizedKey,
                    keySequence,
                    modifiers: validatedArgs.modifiers,
                    delay: validatedArgs.delay,
                    selector: validatedArgs.selector,
                    elementInfo: validatedArgs.selector ? {
                        before: beforeInfo,
                        after: afterInfo
                    } : undefined,
                    pageInfo: !validatedArgs.selector ? {
                        before: beforeInfo,
                        after: afterInfo
                    } : undefined,
                    effects: {
                        urlChanged: beforeUrl !== afterUrl,
                        titleChanged: beforeTitle !== afterTitle,
                        hasChanges: JSON.stringify(beforeInfo) !== JSON.stringify(afterInfo)
                    }
                }
            });

        } catch (error) {
            throw new Error(`Key press operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private normalizeKey(key: string): string {
        // Map common key aliases to Playwright key names
        const keyMapping: Record<string, string> = {
            'enter': 'Enter',
            'return': 'Enter',
            'esc': 'Escape',
            'escape': 'Escape',
            'space': 'Space',
            'spacebar': 'Space',
            'tab': 'Tab',
            'shift': 'Shift',
            'ctrl': 'Control',
            'control': 'Control',
            'alt': 'Alt',
            'meta': 'Meta',
            'cmd': 'Meta',
            'command': 'Meta',
            'backspace': 'Backspace',
            'delete': 'Delete',
            'del': 'Delete',
            'insert': 'Insert',
            'ins': 'Insert',
            'home': 'Home',
            'end': 'End',
            'pageup': 'PageUp',
            'pagedown': 'PageDown',
            'arrowup': 'ArrowUp',
            'arrowdown': 'ArrowDown',
            'arrowleft': 'ArrowLeft',
            'arrowright': 'ArrowRight',
            'up': 'ArrowUp',
            'down': 'ArrowDown',
            'left': 'ArrowLeft',
            'right': 'ArrowRight'
        };

        const lowerKey = key.toLowerCase();
        return keyMapping[lowerKey] || key;
    }

    private async getElementInfo(page: import('playwright').Page, selector: string) {
        try {
            return await page.evaluate((sel: string) => {
                const element = document.querySelector(sel);
                if (!element) {
                    return {
                        exists: false,
                        focused: false,
                        value: '',
                        text: '',
                        tagName: '',
                        type: ''
                    };
                }

                const isInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';

                return {
                    exists: true,
                    focused: document.activeElement === element,
                    value: isInput ? (element as HTMLInputElement | HTMLTextAreaElement).value : '',
                    text: element.textContent || '',
                    tagName: element.tagName,
                    type: (element as HTMLInputElement).type || '',
                    selectionStart: isInput ? (element as HTMLInputElement | HTMLTextAreaElement).selectionStart : 0,
                    selectionEnd: isInput ? (element as HTMLInputElement | HTMLTextAreaElement).selectionEnd : 0,
                    contentEditable: (element as HTMLElement).contentEditable === 'true'
                };
            }, selector);
        } catch {
            return {
                exists: false,
                focused: false,
                value: '',
                text: '',
                tagName: '',
                type: ''
            };
        }
    }

    private async getPageInfo(page: import('playwright').Page) {
        try {
            return await page.evaluate(() => {
                return {
                    activeElement: document.activeElement ? {
                        tagName: document.activeElement.tagName,
                        id: document.activeElement.id,
                        className: document.activeElement.className
                    } : null,
                    url: window.location.href,
                    title: document.title,
                    scrollPosition: {
                        x: window.scrollX,
                        y: window.scrollY
                    }
                };
            });
        } catch {
            return {
                activeElement: null,
                url: page.url(),
                title: '',
                scrollPosition: {x: 0, y: 0}
            };
        }
    }
}