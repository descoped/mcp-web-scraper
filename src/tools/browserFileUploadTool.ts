/**
 * Browser file upload tool for file input handling
 * Provides file upload capabilities with validation
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {BrowserFileUploadArgs, NavigationToolContext, ToolResult} from '@/types/index.js';
import {BrowserFileUploadArgsSchema} from '@/types/index.js';
import * as fs from 'fs';
import * as path from 'path';

export class BrowserFileUploadTool extends BaseTool {
    public readonly name = 'browser_file_upload';
    public readonly description = 'Upload files to file input elements';
    public readonly inputSchema = zodToJsonSchema(BrowserFileUploadArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserFileUploadArgs>(args, BrowserFileUploadArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Validate element exists and is a file input
            const element = session.page.locator(validatedArgs.selector).first();

            // Wait for element to be visible
            await element.waitFor({
                state: 'attached', // File inputs might not be visible but still functional
                timeout: validatedArgs.timeout || context.config.requestTimeout
            });

            // Get element information before upload
            const beforeInfo = await this.getFileInputInfo(session.page, validatedArgs.selector);

            if (!beforeInfo.exists) {
                throw new Error(`Element with selector '${validatedArgs.selector}' not found`);
            }

            if (!beforeInfo.isFileInput) {
                throw new Error(`Element with selector '${validatedArgs.selector}' is not a file input element`);
            }

            if (beforeInfo.disabled) {
                throw new Error(`File input with selector '${validatedArgs.selector}' is disabled`);
            }

            // Validate file paths
            const fileValidation = await this.validateFiles(validatedArgs.files);

            if (fileValidation.invalidFiles.length > 0) {
                throw new Error(`Invalid files: ${fileValidation.invalidFiles.join(', ')}`);
            }

            // Check multiple file upload capability
            if (validatedArgs.files.length > 1 && !beforeInfo.multiple) {
                throw new Error('Multiple files provided but input does not accept multiple files');
            }

            // Perform file upload
            await element.setInputFiles(validatedArgs.files);

            // Wait a moment for any upload effects
            await session.page.waitForTimeout(500);

            // Get element information after upload
            const afterInfo = await this.getFileInputInfo(session.page, validatedArgs.selector);

            // Check for upload progress or feedback elements
            const uploadFeedback = await this.detectUploadFeedback(session.page);

            // Update session
            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                fileUpload: {
                    success: true,
                    selector: validatedArgs.selector,
                    files: validatedArgs.files,
                    fileValidation,
                    elementInfo: {
                        before: beforeInfo,
                        after: afterInfo
                    },
                    uploadFeedback,
                    changes: {
                        filesSelected: afterInfo.selectedFiles > beforeInfo.selectedFiles,
                        fileCountBefore: beforeInfo.selectedFiles,
                        fileCountAfter: afterInfo.selectedFiles
                    }
                }
            });

        } catch (error) {
            throw new Error(`File upload operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async validateFiles(filePaths: string[]): Promise<{
        validFiles: Array<{ path: string, size: number, type: string }>;
        invalidFiles: string[];
    }> {
        const validFiles: Array<{ path: string, size: number, type: string }> = [];
        const invalidFiles: string[] = [];

        for (const filePath of filePaths) {
            try {
                // Check if file exists and is readable
                const stats = fs.statSync(filePath);

                if (!stats.isFile()) {
                    invalidFiles.push(`${filePath} (not a file)`);
                    continue;
                }

                // Get file type based on extension
                const ext = path.extname(filePath).toLowerCase();
                const mimeTypes: Record<string, string> = {
                    '.txt': 'text/plain',
                    '.pdf': 'application/pdf',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.png': 'image/png',
                    '.gif': 'image/gif',
                    '.doc': 'application/msword',
                    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    '.xls': 'application/vnd.ms-excel',
                    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    '.csv': 'text/csv',
                    '.zip': 'application/zip'
                };

                validFiles.push({
                    path: filePath,
                    size: stats.size,
                    type: mimeTypes[ext] || 'application/octet-stream'
                });

            } catch (error) {
                invalidFiles.push(`${filePath} (${error instanceof Error ? error.message : 'unknown error'})`);
            }
        }

        return {validFiles, invalidFiles};
    }

    private async getFileInputInfo(page: import('playwright').Page, selector: string) {
        try {
            return await page.evaluate((sel: string) => {
                const element = document.querySelector(sel) as HTMLInputElement | null;
                if (!element) {
                    return {
                        exists: false,
                        isFileInput: false,
                        disabled: true,
                        multiple: false,
                        accept: '',
                        selectedFiles: 0,
                        required: false
                    };
                }

                const isFileInput = element.tagName === 'INPUT' && element.type === 'file';

                return {
                    exists: true,
                    isFileInput,
                    disabled: element.disabled,
                    multiple: element.multiple,
                    accept: element.accept,
                    selectedFiles: element.files ? element.files.length : 0,
                    required: element.required,
                    name: element.name,
                    id: element.id,
                    webkitdirectory: (element as HTMLInputElement & {
                        webkitdirectory?: boolean
                    }).webkitdirectory || false,
                    capture: element.capture || ''
                };
            }, selector);
        } catch {
            return {
                exists: false,
                isFileInput: false,
                disabled: true,
                multiple: false,
                accept: '',
                selectedFiles: 0,
                required: false
            };
        }
    }

    private async detectUploadFeedback(page: import('playwright').Page): Promise<{
        progressBars: string[];
        uploadMessages: string[];
        errorMessages: string[];
    }> {
        try {
            return await page.evaluate(() => {
                const progressBars: string[] = [];
                const uploadMessages: string[] = [];
                const errorMessages: string[] = [];

                // Look for progress bars
                const progressSelectors = [
                    'progress',
                    '[role="progressbar"]',
                    '.progress',
                    '.upload-progress',
                    '.progress-bar'
                ];

                progressSelectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach((element, index) => {
                        const style = getComputedStyle(element);
                        if (style.display !== 'none' && style.visibility !== 'hidden') {
                            progressBars.push(`${selector}[${index}]: ${element.textContent?.trim() || 'progress element'}`);
                        }
                    });
                });

                // Look for upload success/status messages
                const messageSelectors = [
                    '.upload-status',
                    '.upload-message',
                    '.file-status',
                    '[data-upload-status]'
                ];

                messageSelectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach((element, index) => {
                        const style = getComputedStyle(element);
                        const text = element.textContent?.trim() || '';

                        if (style.display !== 'none' && style.visibility !== 'hidden' && text) {
                            if (text.toLowerCase().includes('error') || text.toLowerCase().includes('failed')) {
                                errorMessages.push(`${selector}[${index}]: ${text}`);
                            } else {
                                uploadMessages.push(`${selector}[${index}]: ${text}`);
                            }
                        }
                    });
                });

                return {
                    progressBars: progressBars.slice(0, 5), // Limit results
                    uploadMessages: uploadMessages.slice(0, 5),
                    errorMessages: errorMessages.slice(0, 5)
                };
            });
        } catch {
            return {
                progressBars: [],
                uploadMessages: [],
                errorMessages: []
            };
        }
    }
}