/**
 * Browser find element tool (Simplified version)
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '../core/toolRegistry.js';
import type {BrowserFindElementArgs, NavigationToolContext, ToolResult} from '../types/index.js';
import {BrowserFindElementArgsSchema} from '../types/index.js';

export class BrowserFindElementTool extends BaseTool {
    public readonly name = 'browser_find_element';
    public readonly description = 'Find elements by natural language description using intelligent matching';
    public readonly inputSchema = zodToJsonSchema(BrowserFindElementArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserFindElementArgs>(args, BrowserFindElementArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Simple element finding implementation
            const matches = await session.page.evaluate(({description, strategy, maxResults}: {
                description: string,
                strategy: string,
                maxResults: number
            }) => {
                const results: any[] = [];
                const elements = document.querySelectorAll('button, input, a, h1, h2, h3, h4, h5, h6, [role="button"]');

                elements.forEach((element, index) => {
                    if (results.length >= maxResults) return;

                    const text = element.textContent?.toLowerCase() || '';
                    const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
                    const descLower = description.toLowerCase();

                    if (text.includes(descLower) || ariaLabel.includes(descLower)) {
                        const rect = element.getBoundingClientRect();
                        results.push({
                            selector: element.tagName.toLowerCase() + (element.id ? `#${element.id}` : `:nth-child(${index + 1})`),
                            element: {
                                tagName: element.tagName.toLowerCase(),
                                id: element.id || undefined,
                                className: element.className || undefined,
                                text: element.textContent?.trim().substring(0, 100) || '',
                                ariaLabel: element.getAttribute('aria-label') || undefined
                            },
                            score: text.includes(descLower) ? 80 : 60,
                            reasons: [text.includes(descLower) ? 'Text content matches' : 'ARIA label matches'],
                            boundingBox: {
                                x: rect.x,
                                y: rect.y,
                                width: rect.width,
                                height: rect.height
                            },
                            isVisible: rect.width > 0 && rect.height > 0,
                            isInteractive: ['button', 'input', 'a'].includes(element.tagName.toLowerCase())
                        });
                    }
                });

                return results.sort((a, b) => b.score - a.score);
            }, {
                description: validatedArgs.description,
                strategy: validatedArgs.strategy,
                maxResults: validatedArgs.maxResults
            });

            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                elementSearch: {
                    success: true,
                    description: validatedArgs.description,
                    strategy: validatedArgs.strategy,
                    totalMatches: matches.length,
                    visibleMatches: matches.filter(m => m.isVisible).length,
                    interactiveMatches: matches.filter(m => m.isInteractive).length,
                    matches: matches.slice(0, validatedArgs.maxResults)
                }
            });

        } catch (error) {
            throw new Error(`Element search failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}