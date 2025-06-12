/**
 * Browser wait for page state tool for advanced page state waiting
 * Provides sophisticated page state detection and waiting capabilities
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {BrowserWaitForPageStateArgs, NavigationToolContext, ToolResult} from '@/types/index.js';
import {BrowserWaitForPageStateArgsSchema} from '@/types/index.js';

interface WaitCondition {
    selector?: string;
    text?: string;
    url?: string;
    function?: string;
}

interface WaitResult {
    success: boolean;
    conditionMet: boolean;
    finalState: string;
    waitTime: number;
    iterations: number;
    stateChanges: Array<{
        timestamp: number;
        state: string;
        details: Record<string, unknown>;
    }>;
    conditionDetails?: {
        selectorFound?: boolean;
        textFound?: boolean;
        urlMatched?: boolean;
        functionResult?: unknown;
    };
    pageMetrics: {
        loadTime: number;
        domContentLoadedTime: number;
        networkIdleTime?: number;
        resourceCount: number;
        errorCount: number;
    };
}

export class BrowserWaitForPageStateTool extends BaseTool {
    public readonly name = 'browser_wait_for_page_state';
    public readonly description = 'Wait for specific page states with advanced condition monitoring';
    public readonly inputSchema = zodToJsonSchema(BrowserWaitForPageStateArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserWaitForPageStateArgs>(args, BrowserWaitForPageStateArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            const startTime = Date.now();

            // Wait for the specified page state with conditions
            const waitResult = await this.waitForPageState(
                session.page,
                validatedArgs.state,
                validatedArgs.condition,
                validatedArgs.timeout,
                validatedArgs.pollInterval
            );

            // Get final page state information
            const finalPageState = await this.getPageStateInfo(session.page);

            // Analyze wait performance
            const performance = this.analyzeWaitPerformance(waitResult, startTime);

            // Generate recommendations based on wait result
            const recommendations = this.generateWaitRecommendations(waitResult, validatedArgs);

            // Update session
            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                pageStateWait: {
                    success: waitResult.success,
                    requestedState: validatedArgs.state,
                    condition: validatedArgs.condition,
                    result: waitResult,
                    finalPageState,
                    performance,
                    recommendations,
                    waitSettings: {
                        timeout: validatedArgs.timeout,
                        pollInterval: validatedArgs.pollInterval
                    }
                }
            });

        } catch (error) {
            throw new Error(`Page state wait failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async waitForPageState(
        page: import('playwright').Page,
        state: string,
        condition: WaitCondition | undefined,
        timeout: number,
        pollInterval: number
    ): Promise<WaitResult> {
        const startTime = Date.now();
        const stateChanges: Array<{ timestamp: number; state: string; details: Record<string, unknown> }> = [];
        let iterations = 0;
        let conditionMet = false;
        let finalState = 'unknown';

        try {
            // Set up page metrics tracking
            const pageMetrics = {
                loadTime: 0,
                domContentLoadedTime: 0,
                networkIdleTime: undefined as number | undefined,
                resourceCount: 0,
                errorCount: 0
            };

            // Track page events
            const trackEvent = (eventName: string, details: Record<string, unknown>) => {
                stateChanges.push({
                    timestamp: Date.now() - startTime,
                    state: eventName,
                    details
                });
            };

            // Listen for page events
            page.on('load', () => {
                pageMetrics.loadTime = Date.now() - startTime;
                trackEvent('load', {loadTime: pageMetrics.loadTime});
            });

            page.on('domcontentloaded', () => {
                pageMetrics.domContentLoadedTime = Date.now() - startTime;
                trackEvent('domcontentloaded', {domContentLoadedTime: pageMetrics.domContentLoadedTime});
            });

            page.on('response', (response: import('playwright').Response) => {
                pageMetrics.resourceCount++;
                trackEvent('response', {
                    url: response.url(),
                    status: response.status(),
                    resourceCount: pageMetrics.resourceCount
                });
            });

            page.on('pageerror', (error: Error) => {
                pageMetrics.errorCount++;
                trackEvent('pageerror', {
                    message: error.message,
                    errorCount: pageMetrics.errorCount
                });
            });

            // Main wait loop
            const endTime = startTime + timeout;

            while (Date.now() < endTime) {
                iterations++;

                try {
                    // Check basic page state
                    const currentState = await this.checkPageState(page, state);
                    finalState = currentState;

                    if (currentState === state) {
                        trackEvent('state_reached', {state: currentState, iteration: iterations});

                        // If no additional condition, we're done
                        if (!condition) {
                            conditionMet = true;
                            break;
                        }

                        // Check additional condition
                        const conditionResult = await this.checkCondition(page, condition);
                        if (conditionResult.met) {
                            conditionMet = true;
                            trackEvent('condition_met', {condition, result: conditionResult, iteration: iterations});
                            break;
                        } else {
                            trackEvent('condition_check', {condition, result: conditionResult, iteration: iterations});
                        }
                    } else {
                        trackEvent('state_check', {requested: state, current: currentState, iteration: iterations});
                    }

                } catch (error) {
                    trackEvent('check_error', {
                        error: error instanceof Error ? error.message : String(error),
                        iteration: iterations
                    });
                }

                // Wait before next check
                await page.waitForTimeout(pollInterval);
            }

            // Detect network idle if requested
            if (state === 'networkidle') {
                try {
                    await page.waitForLoadState('networkidle', {timeout: Math.max(0, endTime - Date.now())});
                    pageMetrics.networkIdleTime = Date.now() - startTime;
                    finalState = 'networkidle';
                    conditionMet = true;
                } catch {
                    // Network idle timeout
                }
            }

            const waitTime = Date.now() - startTime;
            const success = conditionMet || (finalState === state && !condition);

            // Get final condition details
            let conditionDetails;
            if (condition) {
                const finalConditionCheck = await this.checkCondition(page, condition);
                conditionDetails = {
                    selectorFound: condition.selector ? Boolean(finalConditionCheck.selectorFound) : undefined,
                    textFound: condition.text ? Boolean(finalConditionCheck.textFound) : undefined,
                    urlMatched: condition.url ? Boolean(finalConditionCheck.urlMatched) : undefined,
                    functionResult: condition.function ? finalConditionCheck.functionResult : undefined
                };
            }

            return {
                success,
                conditionMet,
                finalState,
                waitTime,
                iterations,
                stateChanges,
                conditionDetails,
                pageMetrics
            };

        } catch (error) {
            const waitTime = Date.now() - startTime;
            return {
                success: false,
                conditionMet: false,
                finalState,
                waitTime,
                iterations,
                stateChanges,
                pageMetrics: {
                    loadTime: 0,
                    domContentLoadedTime: 0,
                    resourceCount: 0,
                    errorCount: 0
                },
                conditionDetails: {
                    error: error instanceof Error ? error.message : String(error)
                } as Record<string, unknown>
            };
        }
    }

    private async checkPageState(page: import('playwright').Page, requestedState: string): Promise<string> {
        try {
            const readyState = await page.evaluate(() => document.readyState);

            switch (requestedState) {
                case 'load':
                    return readyState === 'complete' ? 'load' : readyState;
                case 'domcontentloaded':
                    return ['interactive', 'complete'].includes(readyState) ? 'domcontentloaded' : readyState;
                case 'networkidle':
                    // This will be handled separately in the main wait loop
                    return readyState;
                default:
                    return readyState;
            }
        } catch {
            return 'error';
        }
    }

    private async checkCondition(page: import('playwright').Page, condition: WaitCondition): Promise<{
        met: boolean;
        selectorFound: boolean;
        textFound: boolean;
        urlMatched: boolean;
        functionResult: unknown;
        error?: string;
    }> {
        const result = {
            met: false,
            selectorFound: false,
            textFound: false,
            urlMatched: false,
            functionResult: null as unknown
        };

        try {
            // Check selector condition
            if (condition.selector) {
                const elementCount = await page.locator(condition.selector).count();
                result.selectorFound = elementCount > 0;
            }

            // Check text condition
            if (condition.text) {
                const pageText = await page.evaluate(() => document.body.textContent || '');
                result.textFound = pageText.includes(condition.text);
            }

            // Check URL condition
            if (condition.url) {
                const currentUrl = page.url();
                result.urlMatched = currentUrl.includes(condition.url) ||
                    new RegExp(condition.url).test(currentUrl);
            }

            // Check function condition
            if (condition.function) {
                try {
                    result.functionResult = await page.evaluate(new Function('return ' + condition.function)());
                } catch (error) {
                    result.functionResult = {error: error instanceof Error ? error.message : String(error)};
                }
            }

            // Determine if condition is met
            result.met = (
                (!condition.selector || result.selectorFound) &&
                (!condition.text || result.textFound) &&
                (!condition.url || result.urlMatched) &&
                (!condition.function || (Boolean(result.functionResult) && result.functionResult !== false))
            );

            return result;
        } catch (error) {
            return {
                ...result,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private async getPageStateInfo(page: import('playwright').Page): Promise<Record<string, unknown>> {
        try {
            return await page.evaluate(() => {
                const performance = window.performance;
                const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

                return {
                    readyState: document.readyState,
                    url: window.location.href,
                    title: document.title,
                    timing: navigation ? {
                        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.fetchStart,
                        load: navigation.loadEventEnd - navigation.fetchStart,
                        firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime || 0,
                        firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0
                    } : null,
                    viewport: {
                        width: window.innerWidth,
                        height: window.innerHeight,
                        scrollX: window.scrollX,
                        scrollY: window.scrollY
                    },
                    elements: {
                        total: document.querySelectorAll('*').length,
                        visible: Array.from(document.querySelectorAll('*')).filter(el => {
                            const style = getComputedStyle(el as Element);
                            return style.display !== 'none' && style.visibility !== 'hidden';
                        }).length,
                        interactive: document.querySelectorAll('button, input, select, textarea, a[href], [onclick], [role="button"]').length
                    },
                    resources: {
                        scripts: document.querySelectorAll('script').length,
                        stylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
                        images: document.querySelectorAll('img').length
                    }
                };
            });
        } catch (error) {
            return {
                readyState: 'unknown',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private analyzeWaitPerformance(waitResult: WaitResult, _startTime: number): Record<string, unknown> {
        const {waitTime, iterations, stateChanges, pageMetrics} = waitResult;

        const performance = {
            efficiency: {
                totalWaitTime: waitTime,
                averageIterationTime: iterations > 0 ? waitTime / iterations : 0,
                iterationCount: iterations,
                successRate: waitResult.success ? 100 : 0
            },
            timing: {
                firstResponse: stateChanges.find(change => change.state === 'response')?.timestamp || 0,
                domContentLoaded: pageMetrics.domContentLoadedTime,
                pageLoad: pageMetrics.loadTime,
                networkIdle: pageMetrics.networkIdleTime
            },
            resources: {
                resourcesLoaded: pageMetrics.resourceCount,
                errorsEncountered: pageMetrics.errorCount,
                resourceLoadRate: pageMetrics.resourceCount > 0 ? pageMetrics.resourceCount / (waitTime / 1000) : 0
            },
            stateProgression: stateChanges.map(change => ({
                state: change.state,
                timeOffset: change.timestamp,
                details: change.details
            }))
        };

        return performance;
    }

    private generateWaitRecommendations(waitResult: WaitResult, args: BrowserWaitForPageStateArgs): string[] {
        const recommendations: string[] = [];
        const {success, waitTime, pageMetrics, conditionDetails} = waitResult;

        if (!success) {
            recommendations.push('Wait condition was not met within timeout period');

            if (waitTime >= args.timeout * 0.9) {
                recommendations.push('Consider increasing timeout value for this operation');
            }

            if (args.condition?.selector && conditionDetails && !conditionDetails.selectorFound) {
                recommendations.push(`Selector "${args.condition.selector}" was not found - verify element exists`);
            }

            if (args.condition?.text && conditionDetails && !conditionDetails.textFound) {
                recommendations.push(`Text "${args.condition.text}" was not found on page`);
            }

            if (args.condition?.url && conditionDetails && !conditionDetails.urlMatched) {
                recommendations.push(`URL pattern "${args.condition.url}" did not match current URL`);
            }
        }

        if (pageMetrics.errorCount > 0) {
            recommendations.push(`${pageMetrics.errorCount} page error(s) occurred during wait`);
        }

        if (pageMetrics.loadTime > 10000) {
            recommendations.push('Page load time is slow (>10s) - consider performance optimization');
        }

        if (args.pollInterval < 50) {
            recommendations.push('Very fast polling interval may impact performance - consider increasing');
        }

        if (args.pollInterval > 1000 && success) {
            recommendations.push('Slow polling interval may have delayed condition detection');
        }

        if (recommendations.length === 0) {
            recommendations.push('Wait operation completed successfully with good performance');
        }

        return recommendations;
    }
}