/**
 * Get Page State tool - Returns page snapshot with accessibility tree (Snapshot Mode)
 */

import {z} from 'zod';
import {BaseNavigationTool} from '@/tools/baseNavigationTool.js';

export class GetPageStateTool extends BaseNavigationTool {
    name = 'get_page_state';
    description = 'Get current page state including accessibility tree, visible elements, and interactive elements';

    inputSchema = z.object({
        sessionId: z.string().describe('Session ID of existing browser session'),
        includeScreenshot: z.boolean().optional().default(true).describe('Include screenshot of current view'),
        mode: z.enum(['snapshot', 'vision']).optional().default('snapshot').describe('Mode: snapshot (accessibility tree) or vision (visual elements)')
    });

    async execute(args: z.infer<typeof this.inputSchema>, context: import('@/types/index.js').NavigationToolContext): Promise<import('@/types/index.js').ToolResult> {
        const session = await this.getOrCreateSession(args, context);

        try {
            const page = session.page;

            // Get basic page info
            const title = await page.title();
            const url = page.url();

            let pageState: Record<string, unknown> & { screenshot?: string } = {
                sessionId: session.id,
                title,
                url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                mode: args.mode
            };

            if (args.mode === 'snapshot') {
                // Snapshot Mode: Get accessibility tree and interactive elements
                const accessibilityTree = await page.accessibility.snapshot();

                // Get all interactive elements
                const interactiveElements = await page.evaluate(() => {
                    const elements: Array<Record<string, unknown>> = [];
                    const selectors = ['a', 'button', 'input', 'select', 'textarea', '[role="button"]', '[onclick]'];

                    selectors.forEach(selector => {
                        const found = document.querySelectorAll(selector);
                        found.forEach((el, index) => {
                            const element = el as HTMLElement;
                            const rect = element.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                elements.push({
                                    type: element.tagName.toLowerCase(),
                                    text: element.textContent?.trim() || '',
                                    ariaLabel: element.getAttribute('aria-label') || '',
                                    placeholder: element.getAttribute('placeholder') || '',
                                    name: element.getAttribute('name') || '',
                                    id: element.id || '',
                                    className: element.className || '',
                                    href: (element as HTMLAnchorElement).href || '',
                                    role: element.getAttribute('role') || '',
                                    isVisible: rect.top >= 0 && rect.top <= window.innerHeight,
                                    boundingBox: {
                                        x: rect.x,
                                        y: rect.y,
                                        width: rect.width,
                                        height: rect.height
                                    },
                                    selector: element.id ? `#${element.id}` :
                                        element.className ? `.${element.className.split(' ').join('.')}` :
                                            `${element.tagName.toLowerCase()}:nth-of-type(${index + 1})`
                                });
                            }
                        });
                    });

                    return elements;
                });

                pageState.accessibility = accessibilityTree;
                pageState.interactiveElements = interactiveElements;
                pageState.elementCount = interactiveElements.length;

            } else {
                // Vision Mode: Focus on visual representation
                const viewportSize = page.viewportSize();

                // Get visible text elements with their positions
                const visibleElements = await page.evaluate(() => {
                    const elements: Array<Record<string, unknown>> = [];
                    const walker = document.createTreeWalker(
                        document.body,
                        NodeFilter.SHOW_TEXT,
                        null
                    );

                    let node;
                    while (node = walker.nextNode()) {
                        const parent = node.parentElement;
                        if (parent && node.textContent?.trim()) {
                            const rect = parent.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
                                elements.push({
                                    text: node.textContent.trim(),
                                    boundingBox: {
                                        x: rect.x,
                                        y: rect.y,
                                        width: rect.width,
                                        height: rect.height
                                    },
                                    fontSize: window.getComputedStyle(parent).fontSize,
                                    fontWeight: window.getComputedStyle(parent).fontWeight,
                                    color: window.getComputedStyle(parent).color,
                                    tagName: parent.tagName.toLowerCase()
                                });
                            }
                        }
                    }

                    return elements;
                });

                pageState.viewportSize = viewportSize;
                pageState.visibleElements = visibleElements;
            }

            // Include screenshot if requested
            if (args.includeScreenshot) {
                const screenshot = await page.screenshot({fullPage: false});
                pageState.screenshot = screenshot.toString('base64');
            }

            const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [
                {
                    type: 'text',
                    text: JSON.stringify(pageState, null, 2)
                }
            ];

            // Include screenshot as image content if available
            if (pageState.screenshot) {
                content.push({
                    type: 'image',
                    data: pageState.screenshot,
                    mimeType: 'image/png'
                });
            }

            return {
                content
            };
        } catch (error: unknown) {
            const errorMessage = `Failed to get page state: ${error instanceof Error ? error.message : String(error)}`;
            const errorData = {
                success: false,
                error: errorMessage,
                sessionId: session.id,
                mode: args.mode,
                timestamp: new Date().toISOString()
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(errorData, null, 2)
                    }
                ],
                isError: true
            };
        }
    }
}