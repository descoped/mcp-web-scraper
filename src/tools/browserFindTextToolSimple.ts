/**
 * Browser find text tool for advanced text search (Simplified version)
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '../core/toolRegistry.js';
import type {BrowserFindTextArgs, NavigationToolContext, ToolResult} from '../types/index.js';
import {BrowserFindTextArgsSchema} from '../types/index.js';

export class BrowserFindTextTool extends BaseTool {
    public readonly name = 'browser_find_text';
    public readonly description = 'Find text on page using multiple search strategies';
    public readonly inputSchema = zodToJsonSchema(BrowserFindTextArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserFindTextArgs>(args, BrowserFindTextArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Simple text search implementation
            const matches = await session.page.evaluate(({searchText, strategy}: {
                searchText: string,
                strategy: string
            }) => {
                const allText = document.body.textContent || '';
                const found = strategy === 'exact' ?
                    allText.includes(searchText) :
                    allText.toLowerCase().includes(searchText.toLowerCase());

                return found ? [{
                    text: searchText,
                    selector: 'body',
                    elementType: 'body',
                    isVisible: true,
                    boundingBox: {x: 0, y: 0, width: 0, height: 0},
                    context: {parentText: '', siblingText: '', innerText: ''}
                }] : [];
            }, {searchText: validatedArgs.text, strategy: validatedArgs.strategy});

            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                textSearch: {
                    success: true,
                    searchText: validatedArgs.text,
                    strategy: validatedArgs.strategy,
                    totalMatches: matches.length,
                    matches: matches.slice(0, validatedArgs.maxResults)
                }
            });

        } catch (error) {
            throw new Error(`Text search failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}