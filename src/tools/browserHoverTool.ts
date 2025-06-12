/**
 * Browser hover tool for mouse hover interactions
 * Provides hover capabilities for revealing hidden elements or tooltips
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {BrowserHoverArgs, NavigationToolContext, ToolResult} from '@/types/index.js';
import {BrowserHoverArgsSchema} from '@/types/index.js';

export class BrowserHoverTool extends BaseTool {
    public readonly name = 'browser_hover';
    public readonly description = 'Hover over web elements to trigger hover effects and reveal hidden content';
    public readonly inputSchema = zodToJsonSchema(BrowserHoverArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserHoverArgs>(args, BrowserHoverArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Validate element exists
            const element = session.page.locator(validatedArgs.selector).first();

            // Wait for element to be visible
            await element.waitFor({
                state: 'visible',
                timeout: validatedArgs.timeout || context.config.requestTimeout
            });

            // Get element information before hover
            const beforeInfo = await this.getHoverElementInfo(session.page, validatedArgs.selector);

            if (!beforeInfo.exists) {
                throw new Error(`Element with selector '${validatedArgs.selector}' not found`);
            }

            // Take screenshot before hover (for debugging - not used)
            // const beforeScreenshot = await session.page.screenshot({fullPage: false});

            // Perform hover action
            const hoverOptions: Record<string, unknown> = {
                force: validatedArgs.force,
                timeout: validatedArgs.timeout || context.config.requestTimeout
            };

            if (validatedArgs.position) {
                hoverOptions.position = validatedArgs.position;
            }

            await element.hover(hoverOptions);

            // Wait a moment for hover effects to take place
            await session.page.waitForTimeout(500);

            // Get element information after hover
            const afterInfo = await this.getHoverElementInfo(session.page, validatedArgs.selector);

            // Take screenshot after hover to capture any changes (for debugging - not used)
            // const afterScreenshot = await session.page.screenshot({fullPage: false});

            // Check for newly visible elements (common hover effect)
            const newlyVisibleElements = await this.detectNewlyVisibleElements(session.page);

            // Check for tooltip or popup elements
            const tooltipElements = await this.detectTooltipElements(session.page);

            // Update session
            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                hover: {
                    success: true,
                    selector: validatedArgs.selector,
                    position: validatedArgs.position,
                    force: validatedArgs.force,
                    elementInfo: {
                        before: beforeInfo,
                        after: afterInfo
                    },
                    effects: {
                        styleChanged: beforeInfo.computedStyles !== afterInfo.computedStyles,
                        newlyVisible: newlyVisibleElements,
                        tooltips: tooltipElements,
                        hasChanges: beforeInfo.timestamp !== afterInfo.timestamp
                    }
                }
            });

        } catch (error) {
            throw new Error(`Hover operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getHoverElementInfo(page: import('playwright').Page, selector: string) {
        try {
            return await page.evaluate((sel: string) => {
                const element = document.querySelector(sel);
                if (!element) {
                    return {
                        exists: false,
                        visible: false,
                        hoverable: false,
                        text: '',
                        tagName: '',
                        classes: [],
                        attributes: {},
                        computedStyles: {},
                        position: {x: 0, y: 0, width: 0, height: 0},
                        timestamp: Date.now()
                    };
                }

                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);

                // Get relevant computed styles that might change on hover
                const relevantStyles = [
                    'color', 'backgroundColor', 'borderColor', 'opacity',
                    'transform', 'fontSize', 'textDecoration', 'cursor'
                ];

                const computedStyles: Record<string, string> = {};
                relevantStyles.forEach(prop => {
                    computedStyles[prop] = style.getPropertyValue(prop);
                });

                // Get all attributes
                const attributes: Record<string, string> = {};
                for (let i = 0; i < element.attributes.length; i++) {
                    const attr = element.attributes[i];
                    attributes[attr.name] = attr.value;
                }

                return {
                    exists: true,
                    visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
                    hoverable: style.pointerEvents !== 'none',
                    text: element.textContent?.trim() || '',
                    tagName: element.tagName,
                    classes: Array.from(element.classList),
                    attributes,
                    computedStyles,
                    position: {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height
                    },
                    hasHoverStyles: false, // TODO: Implement hover style detection
                    timestamp: Date.now()
                };
            }, selector);
        } catch {
            return {
                exists: false,
                visible: false,
                hoverable: false,
                text: '',
                tagName: '',
                classes: [],
                attributes: {},
                computedStyles: {},
                position: {x: 0, y: 0, width: 0, height: 0},
                timestamp: Date.now()
            };
        }
    }

    private async detectNewlyVisibleElements(page: import('playwright').Page): Promise<string[]> {
        try {
            return await page.evaluate(() => {
                const allElements = document.querySelectorAll('*');
                const newlyVisible: string[] = [];

                allElements.forEach((element, index) => {
                    const style = getComputedStyle(element);
                    const rect = element.getBoundingClientRect();

                    // Check if element became visible recently (basic heuristic)
                    if (style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        style.opacity !== '0' &&
                        rect.width > 0 && rect.height > 0) {

                        // Look for common tooltip/popup indicators
                        const classList = Array.from(element.classList);
                        const hasTooltipClass = classList.some(cls =>
                            cls.includes('tooltip') ||
                            cls.includes('popup') ||
                            cls.includes('dropdown') ||
                            cls.includes('menu')
                        );

                        if (hasTooltipClass || element.tagName === 'TOOLTIP') {
                            newlyVisible.push(`${element.tagName.toLowerCase()}${classList.length > 0 ? '.' + classList.join('.') : ''}[${index}]`);
                        }
                    }
                });

                return newlyVisible.slice(0, 10); // Limit to first 10 elements
            });
        } catch {
            return [];
        }
    }

    private async detectTooltipElements(page: import('playwright').Page): Promise<Array<{
        selector: string,
        text: string,
        position: Record<string, unknown>
    }>> {
        try {
            return await page.evaluate(() => {
                const tooltipSelectors = [
                    '[role="tooltip"]',
                    '.tooltip',
                    '.tooltip-content',
                    '[data-tooltip]',
                    '.popup',
                    '.dropdown-menu:visible'
                ];

                const tooltips: Array<{ selector: string, text: string, position: Record<string, unknown> }> = [];

                tooltipSelectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach((element, index) => {
                        const style = getComputedStyle(element);
                        const rect = element.getBoundingClientRect();

                        if (style.display !== 'none' &&
                            style.visibility !== 'hidden' &&
                            rect.width > 0 && rect.height > 0) {

                            tooltips.push({
                                selector: `${selector}[${index}]`,
                                text: element.textContent?.trim() || '',
                                position: {
                                    x: rect.x,
                                    y: rect.y,
                                    width: rect.width,
                                    height: rect.height
                                }
                            });
                        }
                    });
                });

                return tooltips.slice(0, 5); // Limit to first 5 tooltips
            });
        } catch {
            return [];
        }
    }
}