/**
 * Browser console messages tool for console log access
 * Provides comprehensive console monitoring and analysis
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '../core/toolRegistry.js';
import type {BrowserConsoleMessagesArgs, NavigationToolContext, ToolResult} from '../types/index.js';
import {BrowserConsoleMessagesArgsSchema} from '../types/index.js';

interface ConsoleMessage {
    type: string;
    text: string;
    location?: {
        url: string;
        lineNumber: number;
        columnNumber: number;
    };
    timestamp: string;
    args?: any[];
    level: string;
}

// Store for console messages per session
const consoleStorage = new Map<string, ConsoleMessage[]>();

export class BrowserConsoleMessagesTool extends BaseTool {
    public readonly name = 'browser_console_messages';
    public readonly description = 'Monitor and access browser console messages for debugging and error tracking';
    public readonly inputSchema = zodToJsonSchema(BrowserConsoleMessagesArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserConsoleMessagesArgs>(args, BrowserConsoleMessagesArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            switch (validatedArgs.action) {
                case 'start':
                    return await this.startConsoleMonitoring(session, validatedArgs, context);

                case 'stop':
                    return await this.stopConsoleMonitoring(session, validatedArgs, context);

                case 'get':
                    return await this.getConsoleMessages(session, validatedArgs, context);

                case 'clear':
                    return await this.clearConsoleMessages(session, validatedArgs, context);

                default:
                    throw new Error(`Unknown action: ${validatedArgs.action}`);
            }
        } catch (error) {
            throw new Error(`Console messages operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async startConsoleMonitoring(session: any, args: BrowserConsoleMessagesArgs, context: NavigationToolContext): Promise<ToolResult> {
        const messages: ConsoleMessage[] = [];
        consoleStorage.set(args.sessionId, messages);

        // Listen to console events
        session.page.on('console', (message: any) => {
            const messageLevel = message.type();

            // Filter by level if specified
            if (args.level && messageLevel !== args.level) {
                return;
            }

            const consoleMessage: ConsoleMessage = {
                type: messageLevel,
                text: message.text(),
                timestamp: new Date().toISOString(),
                level: messageLevel,
                location: message.location() ? {
                    url: message.location().url,
                    lineNumber: message.location().lineNumber,
                    columnNumber: message.location().columnNumber
                } : undefined
            };

            // Try to get arguments if available
            try {
                const messageArgs = message.args();
                if (messageArgs && messageArgs.length > 0) {
                    consoleMessage.args = messageArgs.map((arg: any) => {
                        try {
                            return arg.jsonValue ? arg.jsonValue() : String(arg);
                        } catch {
                            return String(arg);
                        }
                    });
                }
            } catch {
                // Ignore args extraction errors
            }

            messages.push(consoleMessage);

            // Limit stored messages to prevent memory issues
            if (messages.length > 1000) {
                messages.splice(0, messages.length - 1000);
            }
        });

        // Listen to page errors
        session.page.on('pageerror', (error: Error) => {
            const errorMessage: ConsoleMessage = {
                type: 'error',
                text: error.message,
                timestamp: new Date().toISOString(),
                level: 'error',
                location: {
                    url: session.page.url(),
                    lineNumber: 0,
                    columnNumber: 0
                }
            };

            messages.push(errorMessage);
        });

        // Update session
        session.lastActivity = new Date();

        return this.createResult({
            sessionId: session.id,
            url: session.url,
            navigationHistory: session.navigationHistory,
            hasConsentHandled: session.hasConsentHandled,
            timestamp: new Date().toISOString(),
            consoleMonitoring: {
                action: 'start',
                success: true,
                monitoring: true,
                level: args.level,
                message: 'Console monitoring started'
            }
        });
    }

    private async stopConsoleMonitoring(session: any, args: BrowserConsoleMessagesArgs, context: NavigationToolContext): Promise<ToolResult> {
        // Remove all console listeners
        session.page.removeAllListeners('console');
        session.page.removeAllListeners('pageerror');

        const messages = consoleStorage.get(args.sessionId) || [];

        // Update session
        session.lastActivity = new Date();

        return this.createResult({
            sessionId: session.id,
            url: session.url,
            navigationHistory: session.navigationHistory,
            hasConsentHandled: session.hasConsentHandled,
            timestamp: new Date().toISOString(),
            consoleMonitoring: {
                action: 'stop',
                success: true,
                monitoring: false,
                totalMessages: messages.length,
                message: 'Console monitoring stopped'
            }
        });
    }

    private async getConsoleMessages(session: any, args: BrowserConsoleMessagesArgs, context: NavigationToolContext): Promise<ToolResult> {
        const allMessages = consoleStorage.get(args.sessionId) || [];

        // Filter by level if specified
        let filteredMessages = allMessages;
        if (args.level) {
            filteredMessages = allMessages.filter(msg => msg.level === args.level);
        }

        // Apply limit
        const limitedMessages = filteredMessages.slice(-args.limit);

        // Analyze the messages
        const analysis = this.analyzeConsoleMessages(allMessages);

        // Update session
        session.lastActivity = new Date();

        return this.createResult({
            sessionId: session.id,
            url: session.url,
            navigationHistory: session.navigationHistory,
            hasConsentHandled: session.hasConsentHandled,
            timestamp: new Date().toISOString(),
            consoleMonitoring: {
                action: 'get',
                success: true,
                messages: limitedMessages,
                analysis,
                level: args.level,
                limit: args.limit,
                totalMessages: allMessages.length,
                filteredMessages: filteredMessages.length
            }
        });
    }

    private async clearConsoleMessages(session: any, args: BrowserConsoleMessagesArgs, context: NavigationToolContext): Promise<ToolResult> {
        const messagesBefore = consoleStorage.get(args.sessionId) || [];
        const messageCount = messagesBefore.length;

        // Clear stored messages
        consoleStorage.set(args.sessionId, []);

        // Update session
        session.lastActivity = new Date();

        return this.createResult({
            sessionId: session.id,
            url: session.url,
            navigationHistory: session.navigationHistory,
            hasConsentHandled: session.hasConsentHandled,
            timestamp: new Date().toISOString(),
            consoleMonitoring: {
                action: 'clear',
                success: true,
                clearedMessages: messageCount,
                message: `Cleared ${messageCount} console messages`
            }
        });
    }

    private analyzeConsoleMessages(messages: ConsoleMessage[]) {
        const analysis = {
            totalMessages: messages.length,
            byLevel: {} as Record<string, number>,
            byType: {} as Record<string, number>,
            errorCount: 0,
            warningCount: 0,
            recentErrors: [] as ConsoleMessage[],
            mostFrequentErrors: [] as Array<{ message: string, count: number }>,
            timeRange: {
                first: messages.length > 0 ? messages[0].timestamp : null,
                last: messages.length > 0 ? messages[messages.length - 1].timestamp : null
            }
        };

        // Count by level and type
        messages.forEach(msg => {
            analysis.byLevel[msg.level] = (analysis.byLevel[msg.level] || 0) + 1;
            analysis.byType[msg.type] = (analysis.byType[msg.type] || 0) + 1;

            if (msg.level === 'error') {
                analysis.errorCount++;
            }
            if (msg.level === 'warn') {
                analysis.warningCount++;
            }
        });

        // Get recent errors (last 10)
        analysis.recentErrors = messages
            .filter(msg => msg.level === 'error')
            .slice(-10);

        // Find most frequent error messages
        const errorGroups: Record<string, number> = {};
        messages
            .filter(msg => msg.level === 'error')
            .forEach(msg => {
                const errorKey = msg.text.substring(0, 100); // Group by first 100 chars
                errorGroups[errorKey] = (errorGroups[errorKey] || 0) + 1;
            });

        analysis.mostFrequentErrors = Object.entries(errorGroups)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([message, count]) => ({message, count}));

        return analysis;
    }

    // Clean up old console messages for memory management
    private cleanupConsoleMessages(sessionId: string, maxAge: number = 3600000) { // 1 hour
        const messages = consoleStorage.get(sessionId);
        if (!messages) return;

        const now = Date.now();
        const recentMessages = messages.filter(msg =>
            (now - new Date(msg.timestamp).getTime()) < maxAge
        );

        if (recentMessages.length !== messages.length) {
            consoleStorage.set(sessionId, recentMessages);
        }
    }
}