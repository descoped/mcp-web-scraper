/**
 * Browser annotate page tool (Simplified version)
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {BrowserAnnotatePageArgs, NavigationToolContext, ToolResult} from '@/types/index.js';
import {BrowserAnnotatePageArgsSchema} from '@/types/index.js';
import * as fs from 'fs';
import * as path from 'path';

interface ProcessedAnnotation {
    type: 'highlight' | 'arrow' | 'text' | 'box' | 'circle';
    selector?: string;
    position?: { x: number; y: number };
    text?: string;
    color: string;
    fontSize: number;
    width?: number;
    height?: number;
    elementFound: boolean;
    coordinates: {
        x: number;
        y: number;
        width?: number;
        height?: number;
    };
}

export class BrowserAnnotatePageTool extends BaseTool {
    public readonly name = 'browser_annotate_page';
    public readonly description = 'Add visual annotations to page screenshots for documentation and collaboration';
    public readonly inputSchema = zodToJsonSchema(BrowserAnnotatePageArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserAnnotatePageArgs>(args, BrowserAnnotatePageArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Take original screenshot if requested
            let originalScreenshot = null;
            if (validatedArgs.includeOriginal) {
                originalScreenshot = await session.page.screenshot({
                    fullPage: true,
                    type: 'png'
                });
            }

            // Process annotations - find elements for selectors
            const processedAnnotations: ProcessedAnnotation[] = [];
            for (const annotation of validatedArgs.annotations) {
                const processed: ProcessedAnnotation = {
                    ...annotation,
                    elementFound: false,
                    coordinates: {x: 0, y: 0}
                };

                if (annotation.selector) {
                    try {
                        const elementInfo = await session.page.evaluate((selector: string) => {
                            const element = document.querySelector(selector) as HTMLElement;
                            if (!element) return null;

                            const rect = element.getBoundingClientRect();
                            return {
                                x: rect.x + window.scrollX,
                                y: rect.y + window.scrollY,
                                width: rect.width,
                                height: rect.height
                            };
                        }, annotation.selector);

                        if (elementInfo) {
                            processed.elementFound = true;
                            processed.coordinates = elementInfo;
                        }
                    } catch {
                        // Element not found
                    }
                } else if (annotation.position) {
                    processed.elementFound = true;
                    processed.coordinates = {
                        x: annotation.position.x,
                        y: annotation.position.y,
                        width: annotation.width,
                        height: annotation.height
                    };
                }

                processedAnnotations.push(processed);
            }

            // Add simple annotations to page (just colored boxes for now)
            await session.page.evaluate((annotations: ProcessedAnnotation[]) => {
                const container = document.createElement('div');
                container.id = 'annotation-container';
                container.style.position = 'absolute';
                container.style.top = '0';
                container.style.left = '0';
                container.style.width = '100%';
                container.style.height = '100%';
                container.style.pointerEvents = 'none';
                container.style.zIndex = '999999';
                document.body.appendChild(container);

                annotations.forEach((annotation, _index) => {
                    if (!annotation.elementFound) return;

                    const element = document.createElement('div');
                    element.style.position = 'absolute';
                    element.style.left = `${annotation.coordinates.x}px`;
                    element.style.top = `${annotation.coordinates.y}px`;
                    element.style.border = `3px solid ${annotation.color}`;
                    element.style.backgroundColor = annotation.color + '20';
                    element.style.width = `${annotation.coordinates.width || 100}px`;
                    element.style.height = `${annotation.coordinates.height || 50}px`;
                    element.style.pointerEvents = 'none';

                    if (annotation.text) {
                        element.textContent = annotation.text as string;
                        element.style.color = annotation.color as string;
                        element.style.fontSize = `${annotation.fontSize}px`;
                        element.style.fontWeight = 'bold';
                        element.style.padding = '4px';
                    }

                    container.appendChild(element);
                });
            }, processedAnnotations);

            // Take annotated screenshot
            const annotatedScreenshot = await session.page.screenshot({
                fullPage: true,
                type: 'png'
            });

            // Clean up annotations
            await session.page.evaluate(() => {
                const container = document.getElementById('annotation-container');
                if (container) container.remove();
            });

            // Save screenshots if output path provided
            let savedFiles: { original?: string; annotated: string } = {annotated: ''};
            if (validatedArgs.outputPath) {
                const dir = path.dirname(validatedArgs.outputPath);
                const ext = path.extname(validatedArgs.outputPath) || '.png';
                const baseName = path.basename(validatedArgs.outputPath, ext);

                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, {recursive: true});
                }

                const annotatedPath = path.join(dir, `${baseName}_annotated${ext}`);
                fs.writeFileSync(annotatedPath, annotatedScreenshot);
                savedFiles.annotated = annotatedPath;

                if (validatedArgs.includeOriginal && originalScreenshot) {
                    const originalPath = path.join(dir, `${baseName}_original${ext}`);
                    fs.writeFileSync(originalPath, originalScreenshot);
                    savedFiles.original = originalPath;
                }
            }

            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                pageAnnotation: {
                    success: true,
                    totalAnnotations: processedAnnotations.length,
                    successfulAnnotations: processedAnnotations.filter(a => a.elementFound).length,
                    failedAnnotations: processedAnnotations.filter(a => !a.elementFound).length,
                    annotations: processedAnnotations,
                    files: savedFiles,
                    summary: {
                        totalAnnotations: processedAnnotations.length,
                        successfulAnnotations: processedAnnotations.filter(a => a.elementFound).length,
                        annotationTypes: validatedArgs.annotations.reduce((acc, ann) => {
                            acc[ann.type] = (acc[ann.type] || 0) + 1;
                            return acc;
                        }, {} as Record<string, number>)
                    }
                }
            });

        } catch (error) {
            throw new Error(`Page annotation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}