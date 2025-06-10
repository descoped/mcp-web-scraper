/**
 * Browser PDF save tool for generating PDF documents
 * Provides comprehensive PDF generation capabilities
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '../core/toolRegistry.js';
import type {BrowserPdfSaveArgs, NavigationToolContext, ToolResult} from '../types/index.js';
import {BrowserPdfSaveArgsSchema} from '../types/index.js';
import * as fs from 'fs';
import * as path from 'path';

export class BrowserPdfSaveTool extends BaseTool {
    public readonly name = 'browser_pdf_save';
    public readonly description = 'Generate PDF documents from web pages with comprehensive formatting options';
    public readonly inputSchema = zodToJsonSchema(BrowserPdfSaveArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserPdfSaveArgs>(args, BrowserPdfSaveArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Get page information before PDF generation
            const pageInfo = await this.getPageInfo(session.page);

            // Prepare PDF options
            const pdfOptions: any = {
                format: validatedArgs.format,
                scale: validatedArgs.scale,
                displayHeaderFooter: validatedArgs.displayHeaderFooter,
                printBackground: validatedArgs.printBackground,
                landscape: validatedArgs.landscape,
                preferCSSPageSize: validatedArgs.preferCSSPageSize
            };

            // Add custom dimensions if provided
            if (validatedArgs.width && validatedArgs.height) {
                pdfOptions.width = validatedArgs.width;
                pdfOptions.height = validatedArgs.height;
                delete pdfOptions.format; // Custom dimensions override format
            }

            // Add header/footer templates if provided
            if (validatedArgs.displayHeaderFooter) {
                if (validatedArgs.headerTemplate) {
                    pdfOptions.headerTemplate = validatedArgs.headerTemplate;
                }
                if (validatedArgs.footerTemplate) {
                    pdfOptions.footerTemplate = validatedArgs.footerTemplate;
                }
            }

            // Add page ranges if provided
            if (validatedArgs.pageRanges) {
                pdfOptions.pageRanges = validatedArgs.pageRanges;
            }

            // Add margins if provided
            if (validatedArgs.margin) {
                pdfOptions.margin = validatedArgs.margin;
            }

            // Generate PDF
            let pdfBuffer: Buffer;
            let outputPath: string | undefined;

            if (validatedArgs.path) {
                // Save to file
                outputPath = validatedArgs.path;

                // Ensure directory exists
                const dir = path.dirname(outputPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, {recursive: true});
                }

                pdfOptions.path = outputPath;
                await session.page.pdf(pdfOptions);

                // Read the file to get buffer for size calculation
                pdfBuffer = fs.readFileSync(outputPath);
            } else {
                // Generate in memory
                pdfBuffer = await session.page.pdf(pdfOptions);

                // Generate default filename
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const safeTitle = pageInfo.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
                outputPath = `./pdf_${safeTitle}_${timestamp}.pdf`;

                // Save to default location
                fs.writeFileSync(outputPath, pdfBuffer);
            }

            // Get file statistics
            const stats = fs.statSync(outputPath);

            // Update session
            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                pdfGeneration: {
                    success: true,
                    path: outputPath,
                    size: stats.size,
                    format: validatedArgs.format,
                    scale: validatedArgs.scale,
                    landscape: validatedArgs.landscape,
                    pages: await this.estimatePageCount(pdfBuffer),
                    pageInfo,
                    options: pdfOptions,
                    generatedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getPageInfo(page: any) {
        try {
            return await page.evaluate(() => {
                return {
                    title: document.title,
                    url: window.location.href,
                    documentHeight: Math.max(
                        document.body.scrollHeight,
                        document.body.offsetHeight,
                        document.documentElement.clientHeight,
                        document.documentElement.scrollHeight,
                        document.documentElement.offsetHeight
                    ),
                    viewportHeight: window.innerHeight,
                    viewportWidth: window.innerWidth,
                    contentType: document.contentType,
                    characterSet: document.characterSet,
                    readyState: document.readyState,
                    lastModified: document.lastModified
                };
            });
        } catch (error) {
            return {
                title: 'Unknown',
                url: page.url(),
                documentHeight: 0,
                viewportHeight: 0,
                viewportWidth: 0,
                contentType: 'text/html',
                characterSet: 'UTF-8',
                readyState: 'complete',
                lastModified: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private async estimatePageCount(pdfBuffer: Buffer): Promise<number> {
        try {
            // Simple PDF page count estimation by looking for page object references
            const pdfContent = pdfBuffer.toString('binary');
            const pageMatches = pdfContent.match(/\/Type\s*\/Page[^s]/g);
            return pageMatches ? pageMatches.length : 1;
        } catch {
            return 1; // Default to 1 page if estimation fails
        }
    }

    // Helper method to validate output path
    private validateOutputPath(outputPath: string): string {
        // Ensure .pdf extension
        if (!outputPath.toLowerCase().endsWith('.pdf')) {
            outputPath += '.pdf';
        }

        // Convert to absolute path
        return path.resolve(outputPath);
    }

    // Helper method to get default PDF options
    private getDefaultPdfOptions() {
        return {
            format: 'A4',
            scale: 1,
            displayHeaderFooter: false,
            printBackground: false,
            landscape: false,
            preferCSSPageSize: false,
            margin: {
                top: '1cm',
                right: '1cm',
                bottom: '1cm',
                left: '1cm'
            }
        };
    }

    // Helper method to generate header/footer templates
    private generateDefaultTemplates() {
        return {
            headerTemplate: `
                <div style="font-size: 10px; padding: 5px; width: 100%; text-align: center;">
                    <span class="title"></span>
                </div>
            `,
            footerTemplate: `
                <div style="font-size: 10px; padding: 5px; width: 100%; text-align: center;">
                    <span class="date"></span> - Page <span class="pageNumber"></span> of <span class="totalPages"></span>
                </div>
            `
        };
    }
}