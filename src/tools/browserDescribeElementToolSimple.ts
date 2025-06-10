/**
 * Browser describe element tool (Simplified version)
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '../core/toolRegistry.js';
import type {BrowserDescribeElementArgs, NavigationToolContext, ToolResult} from '../types/index.js';
import {BrowserDescribeElementArgsSchema} from '../types/index.js';

export class BrowserDescribeElementTool extends BaseTool {
    public readonly name = 'browser_describe_element';
    public readonly description = 'Generate comprehensive description of a page element';
    public readonly inputSchema = zodToJsonSchema(BrowserDescribeElementArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserDescribeElementArgs>(args, BrowserDescribeElementArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Check if element exists
            const elementExists = await session.page.locator(validatedArgs.selector).count() > 0;
            if (!elementExists) {
                throw new Error(`Element not found with selector: ${validatedArgs.selector}`);
            }

            // Get element description
            const description = await session.page.evaluate((selector: string) => {
                const element = document.querySelector(selector) as HTMLElement;
                if (!element) {
                    throw new Error(`Element not found: ${selector}`);
                }

                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);

                return {
                    basic: {
                        tagName: element.tagName.toLowerCase(),
                        id: element.id || undefined,
                        className: element.className || undefined,
                        text: element.textContent?.trim() || '',
                        type: (element as any).type || undefined,
                        role: element.getAttribute('role') || undefined
                    },
                    position: {
                        boundingBox: {
                            x: rect.x,
                            y: rect.y,
                            width: rect.width,
                            height: rect.height
                        },
                        viewport: {
                            inView: rect.top >= 0 && rect.left >= 0 &&
                                rect.bottom <= window.innerHeight && rect.right <= window.innerWidth
                        }
                    },
                    styles: {
                        display: style.display,
                        visibility: style.visibility,
                        opacity: style.opacity,
                        backgroundColor: style.backgroundColor,
                        color: style.color
                    },
                    accessibility: {
                        ariaLabel: element.getAttribute('aria-label') || undefined,
                        tabIndex: element.tabIndex,
                        focusable: element.tabIndex >= 0
                    },
                    behavior: {
                        isInteractive: ['button', 'input', 'select', 'textarea', 'a'].includes(element.tagName.toLowerCase()),
                        isFormElement: ['input', 'select', 'textarea'].includes(element.tagName.toLowerCase())
                    },
                    humanDescription: `This is a ${element.tagName.toLowerCase()} element${element.textContent ? ` containing "${element.textContent.trim().substring(0, 50)}"` : ''}${element.id ? ` with ID "${element.id}"` : ''}.`
                };
            }, validatedArgs.selector);

            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                elementDescription: {
                    success: true,
                    selector: validatedArgs.selector,
                    description,
                    summary: `${description.basic.tagName.toUpperCase()}${description.basic.role ? ` (${description.basic.role})` : ''}${description.behavior.isInteractive ? ' - Interactive' : ''}`,
                    recommendations: description.behavior.isInteractive && !description.accessibility.ariaLabel ?
                        ['Consider adding aria-label for better accessibility'] :
                        ['Element appears well-formed']
                }
            });

        } catch (error) {
            throw new Error(`Element description failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}