/**
 * Browser annotate page tool for visual annotations
 * Provides visual annotation capabilities with screenshots
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {BrowserAnnotatePageArgs, NavigationToolContext, ToolResult} from '@/types/index.js';
import {BrowserAnnotatePageArgsSchema} from '@/types/index.js';
import * as fs from 'fs';
import * as path from 'path';

interface Annotation {
    type: 'highlight' | 'arrow' | 'text' | 'box' | 'circle';
    selector?: string;
    position?: { x: number; y: number };
    text?: string;
    color: string;
    fontSize: number;
    width?: number;
    height?: number;
}

interface ProcessedAnnotation extends Annotation {
    id: string;
    coordinates: {
        x: number;
        y: number;
        width?: number;
        height?: number;
    };
    elementFound: boolean;
    elementInfo?: {
        tagName: string;
        text: string;
        boundingBox: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
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
            // Process and validate annotations
            const processedAnnotations = await this.processAnnotations(
                session.page,
                validatedArgs.annotations
            );

            // Take original screenshot if requested
            let originalScreenshot = null;
            if (validatedArgs.includeOriginal) {
                originalScreenshot = await session.page.screenshot({
                    fullPage: true,
                    type: 'png'
                });
            }

            // Add annotations to the page
            await this.addAnnotationsToPage(session.page, processedAnnotations);

            // Take annotated screenshot
            const annotatedScreenshot = await session.page.screenshot({
                fullPage: true,
                type: 'png'
            });

            // Save screenshots if output path provided
            let savedFiles: { original?: string; annotated: string } = {annotated: ''};
            if (validatedArgs.outputPath) {
                savedFiles = await this.saveScreenshots(
                    validatedArgs.outputPath,
                    originalScreenshot,
                    annotatedScreenshot,
                    validatedArgs.includeOriginal
                );
            }

            // Clean up annotations from page
            await this.cleanupAnnotations(session.page);

            // Generate annotation summary
            const summary = this.generateAnnotationSummary(processedAnnotations);

            // Update session
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
                    successfulAnnotations: processedAnnotations.filter(a => a.elementFound || a.position).length,
                    failedAnnotations: processedAnnotations.filter(a => !a.elementFound && !a.position).length,
                    annotations: processedAnnotations,
                    summary,
                    files: savedFiles,
                    includeOriginal: validatedArgs.includeOriginal,
                    outputPath: validatedArgs.outputPath
                }
            });

        } catch (error) {
            throw new Error(`Page annotation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async processAnnotations(page: import('playwright').Page, annotations: Annotation[]): Promise<ProcessedAnnotation[]> {
        const processedAnnotations: ProcessedAnnotation[] = [];

        for (const annotation of annotations) {
            const processed: ProcessedAnnotation = {
                ...annotation,
                id: `annotation-${Math.random().toString(36).substr(2, 9)}`,
                coordinates: {x: 0, y: 0},
                elementFound: false
            };

            try {
                if (annotation.selector) {
                    // Find element and get its position
                    const elementInfo = await page.evaluate((selector: string) => {
                        const element = document.querySelector(selector) as HTMLElement;
                        if (!element) return null;

                        const rect = element.getBoundingClientRect();
                        return {
                            tagName: element.tagName.toLowerCase(),
                            text: element.textContent?.trim().substring(0, 50) || '',
                            boundingBox: {
                                x: rect.x + window.scrollX,
                                y: rect.y + window.scrollY,
                                width: rect.width,
                                height: rect.height
                            }
                        };
                    }, annotation.selector);

                    if (elementInfo) {
                        processed.elementFound = true;
                        processed.elementInfo = elementInfo;
                        processed.coordinates = {
                            x: elementInfo.boundingBox.x,
                            y: elementInfo.boundingBox.y,
                            width: elementInfo.boundingBox.width,
                            height: elementInfo.boundingBox.height
                        };
                    }
                } else if (annotation.position) {
                    // Use provided coordinates
                    processed.coordinates = {
                        x: annotation.position.x,
                        y: annotation.position.y,
                        width: annotation.width,
                        height: annotation.height
                    };
                    processed.elementFound = true; // Position is explicitly provided
                }

                processedAnnotations.push(processed);
            } catch {
                // Add annotation with error info
                processed.coordinates = annotation.position || {x: 0, y: 0};
                processedAnnotations.push(processed);
            }
        }

        return processedAnnotations;
    }

    private async addAnnotationsToPage(page: import('playwright').Page, annotations: ProcessedAnnotation[]): Promise<void> {
        await page.evaluate((annotations: ProcessedAnnotation[]) => {
            // Create annotation container
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

            annotations.forEach(annotation => {
                if (!annotation.elementFound && !annotation.position) return;

                const {coordinates, type, color, fontSize, text} = annotation;
                const element = document.createElement('div');
                element.className = 'page-annotation';
                element.id = annotation.id;

                // Base styles
                element.style.position = 'absolute';
                element.style.left = `${coordinates.x}px`;
                element.style.top = `${coordinates.y}px`;
                element.style.pointerEvents = 'none';
                element.style.zIndex = '1000000';

                switch (type) {
                    case 'highlight':
                        element.style.backgroundColor = color + '40'; // Add transparency
                        element.style.border = `2px solid ${color}`;
                        element.style.width = `${coordinates.width || 100}px`;
                        element.style.height = `${coordinates.height || 20}px`;
                        break;

                    case 'box':
                        element.style.border = `3px solid ${color}`;
                        element.style.backgroundColor = 'transparent';
                        element.style.width = `${coordinates.width || 100}px`;
                        element.style.height = `${coordinates.height || 100}px`;
                        break;

                    case 'circle':
                        const radius = Math.min(coordinates.width || 50, coordinates.height || 50) / 2;
                        element.style.border = `3px solid ${color}`;
                        element.style.backgroundColor = color + '20';
                        element.style.width = `${radius * 2}px`;
                        element.style.height = `${radius * 2}px`;
                        element.style.borderRadius = '50%';
                        break;

                    case 'arrow':
                        element.innerHTML = '→';
                        element.style.color = color;
                        element.style.fontSize = `${fontSize * 2}px`;
                        element.style.fontWeight = 'bold';
                        element.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
                        break;

                    case 'text':
                        element.textContent = text || 'Annotation';
                        element.style.color = color;
                        element.style.fontSize = `${fontSize}px`;
                        element.style.fontWeight = 'bold';
                        element.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                        element.style.padding = '4px 8px';
                        element.style.borderRadius = '4px';
                        element.style.border = `1px solid ${color}`;
                        element.style.boxShadow = '2px 2px 4px rgba(0,0,0,0.3)';
                        element.style.whiteSpace = 'nowrap';
                        break;
                }

                container.appendChild(element);
            });
        }, annotations);

        // Wait for annotations to be rendered
        await page.waitForTimeout(100);
    }

    private async cleanupAnnotations(page: import('playwright').Page): Promise<void> {
        await page.evaluate(() => {
            const container = document.getElementById('annotation-container');
            if (container) {
                container.remove();
            }

            // Also remove any individual annotations that might exist
            const annotations = document.querySelectorAll('.page-annotation');
            annotations.forEach(annotation => annotation.remove());
        });
    }

    private async saveScreenshots(
        outputPath: string,
        originalScreenshot: Buffer | null,
        annotatedScreenshot: Buffer,
        includeOriginal: boolean
    ): Promise<{ original?: string; annotated: string }> {
        const dir = path.dirname(outputPath);
        const ext = path.extname(outputPath) || '.png';
        const baseName = path.basename(outputPath, ext);

        // Ensure directory exists
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, {recursive: true});
        }

        const annotatedPath = path.join(dir, `${baseName}_annotated${ext}`);
        fs.writeFileSync(annotatedPath, annotatedScreenshot);

        const result: { original?: string; annotated: string } = {annotated: annotatedPath};

        if (includeOriginal && originalScreenshot) {
            const originalPath = path.join(dir, `${baseName}_original${ext}`);
            fs.writeFileSync(originalPath, originalScreenshot);
            result.original = originalPath;
        }

        return result;
    }

    private generateAnnotationSummary(annotations: ProcessedAnnotation[]): Record<string, unknown> {
        const summary = {
            totalAnnotations: annotations.length,
            annotationTypes: {} as Record<string, number>,
            successfulAnnotations: 0,
            failedAnnotations: 0,
            elementsAnnotated: 0,
            positionBasedAnnotations: 0,
            annotationDetails: [] as Array<{
                id: string;
                type: string;
                status: 'success' | 'failed';
                reason?: string;
                element?: string;
            }>
        };

        annotations.forEach(annotation => {
            // Count by type
            summary.annotationTypes[annotation.type] = (summary.annotationTypes[annotation.type] || 0) + 1;

            // Count success/failure
            if (annotation.elementFound || annotation.position) {
                summary.successfulAnnotations++;
                if (annotation.selector) summary.elementsAnnotated++;
                if (annotation.position && !annotation.selector) summary.positionBasedAnnotations++;
            } else {
                summary.failedAnnotations++;
            }

            // Add details
            summary.annotationDetails.push({
                id: annotation.id,
                type: annotation.type,
                status: (annotation.elementFound || annotation.position) ? 'success' : 'failed',
                reason: annotation.elementFound ? undefined : 'Element not found',
                element: annotation.elementInfo ?
                    `${annotation.elementInfo.tagName}${annotation.elementInfo.text ? `: ${annotation.elementInfo.text}` : ''}` :
                    undefined
            });
        });

        return summary;
    }
}