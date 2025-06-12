/**
 * Drag and drop tool for handling drag and drop interactions
 * Supports both selector-based and coordinate-based drag operations
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {DragDropArgs, NavigationToolContext, ToolResult} from '@/types/index.js';
import {DragDropArgsSchema} from '@/types/index.js';

export class DragDropTool extends BaseTool {
    public readonly name = 'drag_drop';
    public readonly description = 'Perform drag and drop operations between elements or coordinates';
    public readonly inputSchema = zodToJsonSchema(DragDropArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<DragDropArgs>(args, DragDropArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Take screenshot before drag operation for debugging (not used)
            // const beforeScreenshot = await session.page.screenshot({fullPage: false});

            let sourcePosition: { x: number; y: number };
            let targetPosition: { x: number; y: number };

            // Get source position
            if (validatedArgs.sourceCoordinate) {
                sourcePosition = validatedArgs.sourceCoordinate;
            } else {
                const sourceElement = await session.page.locator(validatedArgs.sourceSelector).first();
                const sourceBoundingBox = await sourceElement.boundingBox();

                if (!sourceBoundingBox) {
                    throw new Error(`Source element with selector '${validatedArgs.sourceSelector}' not found or not visible`);
                }

                sourcePosition = {
                    x: sourceBoundingBox.x + sourceBoundingBox.width / 2,
                    y: sourceBoundingBox.y + sourceBoundingBox.height / 2
                };
            }

            // Get target position
            if (validatedArgs.targetCoordinate) {
                targetPosition = validatedArgs.targetCoordinate;
            } else {
                const targetElement = await session.page.locator(validatedArgs.targetSelector).first();
                const targetBoundingBox = await targetElement.boundingBox();

                if (!targetBoundingBox) {
                    throw new Error(`Target element with selector '${validatedArgs.targetSelector}' not found or not visible`);
                }

                targetPosition = {
                    x: targetBoundingBox.x + targetBoundingBox.width / 2,
                    y: targetBoundingBox.y + targetBoundingBox.height / 2
                };
            }

            // Perform the drag and drop operation
            await session.page.mouse.move(sourcePosition.x, sourcePosition.y);
            await session.page.mouse.down();

            // Move in steps for smoother drag (some sites require this)
            const steps = 10;
            const deltaX = (targetPosition.x - sourcePosition.x) / steps;
            const deltaY = (targetPosition.y - sourcePosition.y) / steps;

            for (let i = 1; i <= steps; i++) {
                await session.page.mouse.move(
                    sourcePosition.x + deltaX * i,
                    sourcePosition.y + deltaY * i
                );
                await session.page.waitForTimeout(50); // Small delay between steps
            }

            await session.page.mouse.up();

            // Wait a moment for any drop effects to complete
            await session.page.waitForTimeout(500);

            // Take screenshot after drag operation (not used)
            // const afterScreenshot = await session.page.screenshot({fullPage: false});

            // Check if any elements moved or changed (basic validation)
            const validation = await session.page.evaluate(({source, target}: { source: string, target: string }) => {
                const sourceEl = document.querySelector(source);
                const targetEl = document.querySelector(target);

                return {
                    sourceExists: !!sourceEl,
                    targetExists: !!targetEl,
                    sourceVisible: sourceEl ? getComputedStyle(sourceEl).display !== 'none' : false,
                    targetVisible: targetEl ? getComputedStyle(targetEl).display !== 'none' : false
                };
            }, {source: validatedArgs.sourceSelector, target: validatedArgs.targetSelector});

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                timestamp: new Date().toISOString(),
                dragDrop: {
                    success: true,
                    sourcePosition,
                    targetPosition,
                    sourceSelector: validatedArgs.sourceSelector,
                    targetSelector: validatedArgs.targetSelector,
                    validation,
                    distance: Math.sqrt(
                        Math.pow(targetPosition.x - sourcePosition.x, 2) +
                        Math.pow(targetPosition.y - sourcePosition.y, 2)
                    )
                }
            });

        } catch (error) {
            // Ensure mouse is released if drag operation fails
            try {
                await session.page.mouse.up();
            } catch {
                // Ignore mouse release errors
            }

            throw new Error(`Drag and drop operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // Helper method to validate element positions before drag
    private async validateDragElements(page: import('playwright').Page, sourceSelector: string, targetSelector: string): Promise<{
        sourceValid: boolean;
        targetValid: boolean;
        sourceInfo?: Record<string, unknown> | null;
        targetInfo?: Record<string, unknown> | null;
    }> {
        try {
            const result = await page.evaluate(({source, target}: { source: string, target: string }) => {
                const sourceEl = document.querySelector(source);
                const targetEl = document.querySelector(target);

                const getElementInfo = (el: Element | null) => {
                    if (!el) return null;

                    const rect = el.getBoundingClientRect();
                    const style = getComputedStyle(el);

                    return {
                        tagName: el.tagName,
                        id: el.id,
                        className: el.className,
                        visible: style.display !== 'none' && style.visibility !== 'hidden',
                        inViewport: rect.top >= 0 && rect.left >= 0 &&
                            rect.bottom <= window.innerHeight && rect.right <= window.innerWidth,
                        position: {
                            x: rect.x,
                            y: rect.y,
                            width: rect.width,
                            height: rect.height
                        },
                        draggable: el.getAttribute('draggable') === 'true' ||
                            ['IMG', 'A'].includes(el.tagName) ||
                            style.cursor.includes('grab') || style.cursor.includes('move')
                    };
                };

                return {
                    sourceValid: !!sourceEl,
                    targetValid: !!targetEl,
                    sourceInfo: getElementInfo(sourceEl),
                    targetInfo: getElementInfo(targetEl)
                };
            }, {source: sourceSelector, target: targetSelector});

            return result;
        } catch {
            return {
                sourceValid: false,
                targetValid: false
            };
        }
    }
}