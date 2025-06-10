/**
 * Browser get element text tool (Simplified version)
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '../core/toolRegistry.js';
import type {BrowserGetElementTextArgs, NavigationToolContext, ToolResult} from '../types/index.js';
import {BrowserGetElementTextArgsSchema} from '../types/index.js';

export class BrowserGetElementTextTool extends BaseTool {
    public readonly name = 'browser_get_element_text';
    public readonly description = 'Extract and analyze text content from specific page elements';
    public readonly inputSchema = zodToJsonSchema(BrowserGetElementTextArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserGetElementTextArgs>(args, BrowserGetElementTextArgsSchema);

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

            // Extract text with analysis
            const textResult = await session.page.evaluate(({selector, extraction, trim}: {
                selector: string,
                extraction: string,
                trim: boolean
            }) => {
                const element = document.querySelector(selector) as HTMLElement;
                if (!element) {
                    throw new Error(`Element not found: ${selector}`);
                }

                // Get different text extraction methods
                const alternatives = {
                    textContent: element.textContent || '',
                    innerText: element.innerText || '',
                    innerHTML: element.innerHTML || '',
                    outerHTML: element.outerHTML || '',
                    value: (element as any).value || undefined
                };

                // Get primary text based on extraction method
                let primary = '';
                switch (extraction) {
                    case 'textContent':
                        primary = alternatives.textContent;
                        break;
                    case 'innerText':
                        primary = alternatives.innerText;
                        break;
                    case 'innerHTML':
                        primary = alternatives.innerHTML;
                        break;
                    case 'outerHTML':
                        primary = alternatives.outerHTML;
                        break;
                    case 'value':
                        primary = alternatives.value || alternatives.textContent;
                        break;
                    default:
                        primary = alternatives.textContent;
                }

                if (trim) {
                    primary = primary.trim();
                    Object.keys(alternatives).forEach(key => {
                        if (typeof alternatives[key as keyof typeof alternatives] === 'string') {
                            alternatives[key as keyof typeof alternatives] =
                                (alternatives[key as keyof typeof alternatives] as string).trim();
                        }
                    });
                }

                // Basic analysis
                const words = primary.split(/\s+/).filter(word => word.length > 0);
                const sentences = primary.split(/[.!?]+/).filter(s => s.trim().length > 0);

                return {
                    primary,
                    alternatives,
                    metadata: {
                        elementType: element.tagName.toLowerCase(),
                        characterCount: primary.length,
                        wordCount: words.length,
                        lineCount: primary.split(/\n/).length,
                        isEmpty: primary.trim().length === 0,
                        isFormField: ['input', 'textarea', 'select'].includes(element.tagName.toLowerCase())
                    },
                    analysis: {
                        hasLinks: element.querySelectorAll('a').length > 0,
                        hasImages: element.querySelectorAll('img').length > 0,
                        hasFormatting: /<[^>]+>/.test(alternatives.innerHTML),
                        sentences: sentences.slice(0, 5) // First 5 sentences
                    }
                };
            }, {selector: validatedArgs.selector, extraction: validatedArgs.extraction, trim: validatedArgs.trim});

            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                textExtraction: {
                    success: true,
                    selector: validatedArgs.selector,
                    extractionType: validatedArgs.extraction,
                    result: textResult,
                    insights: {
                        contentType: textResult.metadata.isFormField ? 'form-field' :
                            textResult.metadata.wordCount > 100 ? 'long-content' : 'short-content',
                        quality: {
                            hasContent: !textResult.metadata.isEmpty,
                            isSubstantial: textResult.metadata.wordCount > 10
                        }
                    }
                }
            });

        } catch (error) {
            throw new Error(`Text extraction failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}