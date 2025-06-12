/**
 * Browser execute javascript tool for custom JS execution
 * Provides safe JavaScript execution with comprehensive result handling
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {BrowserExecuteJavascriptArgs, NavigationToolContext, ToolResult} from '@/types/index.js';
import {BrowserExecuteJavascriptArgsSchema} from '@/types/index.js';

interface ScriptValidation {
    safe: boolean;
    warnings: string[];
    reasons: string[];
}


interface ExecutionImpact {
    performance: {
        executionTime: number;
        performanceRating: string;
        resourceUsage: string;
    };
    sideEffects: {
        domModifications: boolean;
        networkActivity: boolean;
        consoleOutput: boolean;
        storageAccess: boolean;
    };
    pageState: Record<string, unknown>;
    risks: string[];
}

interface ExecutionResult {
    success: boolean;
    result: unknown;
    type: string;
    serializable: boolean;
    executionTime: number;
    error?: { name: string; message: string; stack?: string };
    warnings: string[];
    sideEffects: {
        consoleOutput: string[];
        networkRequests: number;
        storageChanges: boolean;
        domModified: boolean;
    };
}

interface ExecutionContext {
    type: 'page' | 'frame' | 'worker';
    url: string;
    title: string;
    readyState: string;
}

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
            // Validate script for safety
            const scriptValidation = this.validateScript(validatedArgs.script);
            if (!scriptValidation.safe) {
                throw new Error(`Unsafe script detected: ${scriptValidation.reasons.join(', ')}`);
            }

            // Get execution context info
            const executionContext = await this.getExecutionContext(session.page);

            // Execute JavaScript with monitoring
            const executionResult = await this.executeJavaScript(
                session.page,
                validatedArgs.script,
                validatedArgs.args,
                validatedArgs.includeResult,
                validatedArgs.timeout,
                validatedArgs.context
            );

            // Analyze execution impact
            const impact = await this.analyzeExecutionImpact(session.page, executionResult);

            // Generate execution report
            const report = this.generateExecutionReport(executionResult, scriptValidation, impact);

            // Update session
            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                javascriptExecution: {
                    success: executionResult.success,
                    script: validatedArgs.script,
                    arguments: validatedArgs.args,
                    executionContext,
                    result: executionResult,
                    impact,
                    report,
                    validation: scriptValidation,
                    executionSettings: {
                        includeResult: validatedArgs.includeResult,
                        timeout: validatedArgs.timeout,
                        context: validatedArgs.context
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

        // Check for potentially dangerous operations
        const dangerousPatterns = [
            {pattern: /eval\s*\(/, reason: 'Contains eval() which can execute arbitrary code'},
            {pattern: /Function\s*\(/, reason: 'Contains Function constructor which can execute arbitrary code'},
            {pattern: /setTimeout\s*\(\s*["'`][^"'`]*["'`]/, reason: 'Contains setTimeout with string code execution'},
            {
                pattern: /setInterval\s*\(\s*["'`][^"'`]*["'`]/,
                reason: 'Contains setInterval with string code execution'
            },
            {
                pattern: /document\.write\s*\(/,
                reason: 'Contains document.write which can modify page structure unsafely'
            },
            {pattern: /innerHTML\s*=\s*.*<script/i, reason: 'Contains innerHTML with script tag injection'},
            {pattern: /outerHTML\s*=\s*.*<script/i, reason: 'Contains outerHTML with script tag injection'},
            {
                pattern: /location\s*=|location\.href\s*=|location\.replace\s*\(/,
                reason: 'Contains navigation that could redirect page'
            },
            {pattern: /window\.open\s*\(/, reason: 'Contains window.open which opens new windows/tabs'},
            {
                pattern: /XMLHttpRequest|fetch\s*\(/,
                reason: 'Contains network requests - consider using designated tools instead'
            }
        ];

        // Check for warning patterns (not blocking but cautionary)
        const warningPatterns = [
            {pattern: /alert\s*\(/, warning: 'Contains alert() which may interrupt automation'},
            {pattern: /confirm\s*\(/, warning: 'Contains confirm() which may interrupt automation'},
            {pattern: /prompt\s*\(/, warning: 'Contains prompt() which may interrupt automation'},
            {pattern: /console\.(log|warn|error)/, warning: 'Contains console output - results may appear in console'},
            {pattern: /localStorage|sessionStorage/, warning: 'Modifies browser storage'},
            {pattern: /document\.cookie/, warning: 'Accesses or modifies cookies'},
            {pattern: /addEventListener|removeEventListener/, warning: 'Modifies event listeners'},
            {pattern: /setInterval|setTimeout/, warning: 'Creates timers that may persist after execution'}
        ];

        // Check dangerous patterns
        dangerousPatterns.forEach(({pattern, reason}) => {
            if (pattern.test(script)) {
                reasons.push(reason);
            }
        });

        // Check warning patterns
        warningPatterns.forEach(({pattern, warning}) => {
            if (pattern.test(script)) {
                warnings.push(warning);
            }
        });

        // Additional safety checks
        if (script.length > 10000) {
            warnings.push('Script is very large (>10KB) - consider breaking into smaller parts');
        }

        if (script.includes('while') || script.includes('for')) {
            warnings.push('Contains loops - ensure they have proper termination conditions');
        }

        return {
            safe: reasons.length === 0,
            reasons,
            warnings
        };
    }

    private async getExecutionContext(page: import('playwright').Page): Promise<ExecutionContext> {
        try {
            return await page.evaluate(() => ({
                type: 'page' as const,
                url: window.location.href,
                title: document.title,
                readyState: document.readyState
            }));
        } catch {
            return {
                type: 'page',
                url: 'unknown',
                title: 'unknown',
                readyState: 'unknown'
            };
        }
    }

    private async executeJavaScript(
        page: import('playwright').Page,
        script: string,
        args: unknown[],
        includeResult: boolean,
        timeout: number,
        context: string
    ): Promise<ExecutionResult> {
        const startTime = Date.now();
        const warnings: string[] = [];
        const sideEffects = {
            domModified: false,
            consoleOutput: [] as string[],
            networkRequests: 0,
            storageChanges: false
        };

        try {
            // Set up monitoring
            let networkRequestCount = 0;
            const originalDOMState = context === 'page' ? await this.getDOMChecksum(page) : null;

            // Monitor network requests
            const requestHandler = () => networkRequestCount++;
            page.on('request', requestHandler);

            // Monitor console output
            const consoleHandler = (msg: import('playwright').ConsoleMessage) => {
                sideEffects.consoleOutput.push(`${msg.type()}: ${msg.text()}`);
            };
            page.on('console', consoleHandler);

            let result: unknown;
            let executionError: { name: string; message: string; stack?: string } | undefined;

            try {
                // Create the execution function
                const wrappedScript = `
                    (function(...args) {
                        try {
                            ${script}
                        } catch (error) {
                            return { __error: true, name: error.name, message: error.message, stack: error.stack };
                        }
                    })(...arguments)
                `;

                // Execute with timeout
                const executePromise = page.evaluate(wrappedScript, ...args);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Script execution timeout')), timeout)
                );

                result = await Promise.race([executePromise, timeoutPromise]);

                // Check if result indicates an error
                if (result && typeof result === 'object' && '__error' in result && result.__error) {
                    const errorResult = result as { name?: string; message?: string; stack?: string };
                    executionError = {
                        name: errorResult.name || 'Error',
                        message: errorResult.message || 'Unknown error',
                        stack: errorResult.stack
                    };
                    result = undefined;
                }

            } catch (error) {
                executionError = {
                    name: error instanceof Error ? error.constructor.name : 'Error',
                    message: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                };
            }

            // Clean up event listeners
            page.off('request', requestHandler);
            page.off('console', consoleHandler);

            // Check for side effects
            sideEffects.networkRequests = networkRequestCount;

            if (context === 'page' && originalDOMState) {
                const newDOMState = await this.getDOMChecksum(page);
                sideEffects.domModified = originalDOMState !== newDOMState;
            }

            // Check for storage changes (simplified check)
            try {
                await page.evaluate(() => {
                    // This is a simplified check - just accessing storage to see if it throws
                    void localStorage.length;
                    void sessionStorage.length;
                });
                // If we get here, storage access worked
            } catch {
                sideEffects.storageChanges = true;
            }

            const executionTime = Date.now() - startTime;

            // Determine result type and serializability
            let resultType = 'undefined';
            let serializable = true;

            if (includeResult && result !== undefined && !executionError) {
                resultType = typeof result;
                if (result === null) {
                    resultType = 'null';
                } else if (Array.isArray(result)) {
                    resultType = 'array';
                } else if (result instanceof Date) {
                    resultType = 'date';
                }

                // Check if result is serializable
                try {
                    JSON.stringify(result);
                } catch {
                    serializable = false;
                    warnings.push('Result is not JSON serializable');
                    result = includeResult ? '[Non-serializable object]' : undefined;
                }
            }

            return {
                success: !executionError,
                result: includeResult ? result : '[Result hidden - set includeResult=true to see]',
                type: resultType,
                serializable,
                executionTime,
                error: executionError,
                warnings,
                sideEffects
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            return {
                success: false,
                result: undefined,
                type: 'undefined',
                serializable: false,
                executionTime,
                error: {
                    name: error instanceof Error ? error.constructor.name : 'Error',
                    message: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                },
                warnings,
                sideEffects
            };
        }
    }

    private async getDOMChecksum(page: import('playwright').Page): Promise<string> {
        try {
            return await page.evaluate(() => {
                // Simple DOM checksum based on element count and basic structure
                const elements = document.querySelectorAll('*');
                const tagCounts: Record<string, number> = {};

                elements.forEach(el => {
                    const tag = el.tagName.toLowerCase();
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });

                return JSON.stringify({
                    elementCount: elements.length,
                    tagCounts: tagCounts,
                    bodyContent: document.body?.textContent?.length || 0
                });
            });
        } catch {
            return 'error';
        }
    }

    private async analyzeExecutionImpact(page: import('playwright').Page, executionResult: ExecutionResult): Promise<ExecutionImpact> {
        try {
            const impact = {
                performance: {
                    executionTime: executionResult.executionTime,
                    performanceRating: this.getPerformanceRating(executionResult.executionTime),
                    resourceUsage: 'unknown'
                },
                sideEffects: {
                    domModifications: executionResult.sideEffects.domModified,
                    networkActivity: executionResult.sideEffects.networkRequests > 0,
                    consoleOutput: executionResult.sideEffects.consoleOutput.length > 0,
                    storageAccess: executionResult.sideEffects.storageChanges
                },
                pageState: await page.evaluate(() => ({
                    readyState: document.readyState,
                    activeElement: document.activeElement?.tagName?.toLowerCase() || 'none',
                    scrollPosition: {
                        x: window.scrollX,
                        y: window.scrollY
                    },
                    viewportSize: {
                        width: window.innerWidth,
                        height: window.innerHeight
                    }
                })),
                risks: this.assessExecutionRisks(executionResult)
            };

            return impact;
        } catch (error) {
            return {
                performance: {
                    executionTime: executionResult.executionTime,
                    performanceRating: this.getPerformanceRating(executionResult.executionTime),
                    resourceUsage: 'unknown'
                },
                sideEffects: {
                    domModifications: executionResult.sideEffects.domModified,
                    networkActivity: executionResult.sideEffects.networkRequests > 0,
                    consoleOutput: executionResult.sideEffects.consoleOutput.length > 0,
                    storageAccess: executionResult.sideEffects.storageChanges
                },
                pageState: {},
                risks: [error instanceof Error ? error.message : String(error)]
            };
        }
    }

    private getPerformanceRating(executionTime: number): string {
        if (executionTime < 100) return 'excellent';
        if (executionTime < 500) return 'good';
        if (executionTime < 1000) return 'fair';
        if (executionTime < 5000) return 'poor';
        return 'very-poor';
    }

    private assessExecutionRisks(executionResult: ExecutionResult): string[] {
        const risks: string[] = [];

        if (executionResult.sideEffects.domModified) {
            risks.push('DOM was modified - page structure may have changed');
        }

        if (executionResult.sideEffects.networkRequests > 0) {
            risks.push(`${executionResult.sideEffects.networkRequests} network request(s) were made`);
        }

        if (executionResult.sideEffects.storageChanges) {
            risks.push('Browser storage may have been modified');
        }

        if (executionResult.executionTime > 5000) {
            risks.push('Long execution time may indicate infinite loops or heavy computation');
        }

        if (executionResult.warnings.length > 0) {
            risks.push(`Script had ${executionResult.warnings.length} warning(s)`);
        }

        return risks;
    }

    private generateExecutionReport(
        executionResult: ExecutionResult,
        scriptValidation: ScriptValidation,
        impact: ExecutionImpact
    ): Record<string, unknown> {
        const report = {
            summary: {
                status: executionResult.success ? 'successful' : 'failed',
                executionTime: `${executionResult.executionTime}ms`,
                performanceRating: impact.performance?.performanceRating || 'unknown',
                sideEffectsDetected: Object.values(executionResult.sideEffects).some(Boolean)
            },
            safety: {
                validationPassed: scriptValidation.safe,
                warningsCount: scriptValidation.warnings.length,
                risksIdentified: impact.risks.length
            },
            technical: {
                resultType: executionResult.type,
                resultSerializable: executionResult.serializable,
                errorOccurred: !!executionResult.error,
                consoleOutputLines: executionResult.sideEffects.consoleOutput.length
            },
            recommendations: this.generateExecutionRecommendations(executionResult, scriptValidation, impact)
        };

        return report;
    }

    private generateExecutionRecommendations(
        executionResult: ExecutionResult,
        scriptValidation: ScriptValidation,
        impact: ExecutionImpact
    ): string[] {
        const recommendations: string[] = [];

        if (!executionResult.success) {
            recommendations.push('Script execution failed - check error details and fix syntax/logic issues');
        }

        if (scriptValidation.warnings.length > 0) {
            recommendations.push('Address script warnings to improve safety and reliability');
        }

        if (executionResult.executionTime > 1000) {
            recommendations.push('Consider optimizing script for better performance');
        }

        if (executionResult.sideEffects.domModified) {
            recommendations.push('Script modified DOM - ensure changes are intentional');
        }

        if (executionResult.sideEffects.networkRequests > 0) {
            recommendations.push('Script made network requests - consider using dedicated tools for API calls');
        }

        if (!executionResult.serializable && executionResult.result) {
            recommendations.push('Result is not serializable - consider returning simpler data types');
        }

        if (impact.risks.length > 0) {
            recommendations.push('Review identified risks and consider safer alternatives');
        }

        if (recommendations.length === 0) {
            recommendations.push('Script executed successfully with no issues detected');
        }

        return recommendations;
    }
}