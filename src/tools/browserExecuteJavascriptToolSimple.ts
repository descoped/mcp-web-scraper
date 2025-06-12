/**
 * Browser execute javascript tool (Simplified version)
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {BrowserExecuteJavascriptArgs, NavigationToolContext, ToolResult} from '@/types/index.js';
import {BrowserExecuteJavascriptArgsSchema} from '@/types/index.js';

export class BrowserExecuteJavascriptTool extends BaseTool {
    public readonly name = 'browser_execute_javascript';
    public readonly description = 'Execute custom JavaScript code in browser context with safety checks';
    public readonly inputSchema = zodToJsonSchema(BrowserExecuteJavascriptArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserExecuteJavascriptArgs>(args, BrowserExecuteJavascriptArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Basic safety validation
            const scriptValidation = this.validateScript(validatedArgs.script);
            if (!scriptValidation.safe) {
                throw new Error(`Unsafe script detected: ${scriptValidation.reasons.join(', ')}`);
            }

            const startTime = Date.now();
            let result: unknown;
            let executionError: unknown = null;

            try {
                // Execute JavaScript
                if (validatedArgs.args.length > 0) {
                    // Create function with arguments
                    const wrappedScript = `
                        (function(...args) {
                            ${validatedArgs.script}
                        })(...arguments)
                    `;
                    result = await session.page.evaluate(wrappedScript, ...validatedArgs.args);
                } else {
                    // Direct evaluation
                    result = await session.page.evaluate(validatedArgs.script);
                }
            } catch (error) {
                executionError = {
                    name: error instanceof Error ? error.constructor.name : 'Error',
                    message: error instanceof Error ? error.message : String(error)
                };
            }

            const executionTime = Date.now() - startTime;
            const success = !executionError;

            // Determine result type
            let resultType = 'undefined';
            let serializable = true;

            if (validatedArgs.includeResult && result !== undefined && !executionError) {
                resultType = typeof result;
                if (result === null) resultType = 'null';
                else if (Array.isArray(result)) resultType = 'array';

                try {
                    JSON.stringify(result);
                } catch {
                    serializable = false;
                    result = '[Non-serializable object]';
                }
            }

            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                javascriptExecution: {
                    success,
                    script: validatedArgs.script,
                    arguments: validatedArgs.args,
                    result: {
                        success,
                        result: validatedArgs.includeResult ? result : '[Result hidden - set includeResult=true to see]',
                        type: resultType,
                        serializable,
                        executionTime,
                        error: executionError,
                        warnings: scriptValidation.warnings
                    },
                    validation: scriptValidation,
                    report: {
                        summary: {
                            status: success ? 'successful' : 'failed',
                            executionTime: `${executionTime}ms`,
                            performanceRating: executionTime < 100 ? 'excellent' : executionTime < 1000 ? 'good' : 'poor'
                        },
                        recommendations: success ?
                            ['Script executed successfully with no issues detected'] :
                            ['Script execution failed - check error details and fix syntax/logic issues']
                    }
                }
            });

        } catch (error) {
            throw new Error(`JavaScript execution failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private validateScript(script: string): { safe: boolean; reasons: string[]; warnings: string[] } {
        const reasons: string[] = [];
        const warnings: string[] = [];

        // Check for dangerous operations
        const dangerousPatterns = [
            {pattern: /eval\s*\(/, reason: 'Contains eval() which can execute arbitrary code'},
            {pattern: /Function\s*\(/, reason: 'Contains Function constructor which can execute arbitrary code'},
            {
                pattern: /document\.write\s*\(/,
                reason: 'Contains document.write which can modify page structure unsafely'
            },
            {pattern: /location\s*=|location\.href\s*=/, reason: 'Contains navigation that could redirect page'},
            {pattern: /window\.open\s*\(/, reason: 'Contains window.open which opens new windows/tabs'}
        ];

        // Check for warnings
        const warningPatterns = [
            {pattern: /alert\s*\(/, warning: 'Contains alert() which may interrupt automation'},
            {pattern: /console\.(log|warn|error)/, warning: 'Contains console output'},
            {pattern: /localStorage|sessionStorage/, warning: 'Modifies browser storage'}
        ];

        dangerousPatterns.forEach(({pattern, reason}) => {
            if (pattern.test(script)) {
                reasons.push(reason);
            }
        });

        warningPatterns.forEach(({pattern, warning}) => {
            if (pattern.test(script)) {
                warnings.push(warning);
            }
        });

        return {
            safe: reasons.length === 0,
            reasons,
            warnings
        };
    }
}