/**
 * Rate limiting middleware for MCP server integration.
 *
 * Provides transparent rate limiting for tool calls, SSE connections,
 * and HTTP requests with proper error handling and monitoring.
 */

import express from 'express';
import {IRateLimiter, RateLimitContext, RateLimitResult, RateLimitRule} from '@/types/rateLimiting.js';
import type {IMetricsCollector, IStructuredLogger} from '@/types/monitoring.js';

/**
 * Express middleware for HTTP request rate limiting
 */
export function createHttpRateLimitMiddleware(
    rateLimiter: IRateLimiter,
    logger?: IStructuredLogger,
    metrics?: IMetricsCollector
): express.RequestHandler {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const requestId = `http_${Date.now()}_${Math.random()}`;

        const reqUnknown = req as unknown as Record<string, unknown>;
        const context: RateLimitContext = {
            identifier: req.ip || 'unknown',
            requestId,
            timestamp: Date.now()
        };

        // Add optional fields
        if (req.ip) {
            context.clientIp = req.ip;
        }
        if (req.get('User-Agent')) {
            context.userAgent = req.get('User-Agent');
        }
        if (reqUnknown.connectionId) {
            context.connectionId = reqUnknown.connectionId as string;
        }

        try {
            // Start request tracking
            await rateLimiter.startRequest(context);

            // Check rate limits
            const result = await rateLimiter.checkLimit(context);

            if (!result.allowed) {
                // Set rate limit headers
                if (result.headers) {
                    Object.entries(result.headers).forEach(([key, value]) => {
                        if (value) res.setHeader(key, value);
                    });
                }

                // Handle different rate limit actions
                if (result.error) {
                    const statusCode = result.error.code === 'RATE_LIMIT_EXCEEDED' ? 429 : 503;

                    logger?.warn('HTTP request rate limited', undefined, {
                        requestId,
                        path: req.path,
                        method: req.method,
                        ip: req.ip,
                        result
                    });

                    metrics?.incrementCounter('http_requests_rate_limited_total', {
                        method: req.method,
                        path: req.path,
                        rule: result.appliedRule || 'unknown'
                    });

                    res.status(statusCode).json({
                        error: {
                            code: result.error.code,
                            message: result.error.message,
                            retryAfter: result.error.retryAfter
                        },
                        timestamp: result.timestamp
                    });

                    // Complete request tracking
                    await rateLimiter.completeRequest(context);
                    return;
                }
            }

            // Add cleanup handler
            res.on('finish', async () => {
                await rateLimiter.completeRequest(context);
            });

            res.on('close', async () => {
                await rateLimiter.completeRequest(context);
            });

            next();

        } catch (error) {
            logger?.error('Rate limiting middleware error', error instanceof Error ? error : new Error(String(error)), {
                requestId,
                labels: {identifier: context.identifier}
            });

            // Complete request tracking on error
            await rateLimiter.completeRequest(context);
            next(error);
        }
    };
}

/**
 * MCP tool call rate limiting wrapper
 */
export class MCPRateLimitingWrapper {
    constructor(
        private readonly rateLimiter: IRateLimiter,
        private readonly logger?: IStructuredLogger,
        private readonly metrics?: IMetricsCollector
    ) {
    }

    /**
     * Wrap a tool execution with rate limiting
     */
    async wrapToolExecution<T>(
        toolName: string,
        connectionId: string,
        originalExecutor: () => Promise<T>,
        additionalContext?: Partial<RateLimitContext>
    ): Promise<T> {
        const requestId = `tool_${Date.now()}_${Math.random()}`;

        const context: RateLimitContext = {
            identifier: connectionId,
            requestId,
            toolName,
            connectionId,
            timestamp: Date.now(),
            ...additionalContext
        };

        try {
            // Start request tracking
            await this.rateLimiter.startRequest(context);

            // Check rate limits
            const result = await this.rateLimiter.checkLimit(context);

            if (!result.allowed) {
                this.handleRateLimitViolation(result, context);
            }

            // Execute tool
            const startTime = Date.now();
            const toolResult = await originalExecutor();
            const duration = Date.now() - startTime;

            // Record successful execution metrics
            this.metrics?.recordTiming('tool_execution_duration_ms', duration, {
                tool_name: toolName,
                connection_id: connectionId,
                rate_limited: 'false'
            });

            this.logger?.debug('Tool execution completed with rate limiting', undefined, {
                requestId,
                toolName,
                connectionId,
                duration,
                rateLimitResult: result
            });

            return toolResult;

        } catch (error) {
            this.logger?.error('Tool execution failed with rate limiting', error instanceof Error ? error : new Error(String(error)), {
                requestId,
                toolName,
                connectionId,
                labels: {identifier: context.identifier}
            });

            throw error;

        } finally {
            // Always complete request tracking
            await this.rateLimiter.completeRequest(context);
        }
    }

    /**
     * Check if tool execution is allowed without executing
     */
    async checkToolExecution(
        toolName: string,
        connectionId: string,
        additionalContext?: Partial<RateLimitContext>
    ): Promise<RateLimitResult> {
        const context: RateLimitContext = {
            identifier: connectionId,
            requestId: `check_${Date.now()}_${Math.random()}`,
            toolName,
            connectionId,
            timestamp: Date.now(),
            ...additionalContext
        };

        return await this.rateLimiter.checkLimit(context);
    }

    /**
     * Handle rate limit violation with appropriate error
     */
    private handleRateLimitViolation(result: RateLimitResult, context: RateLimitContext): never {
        this.logger?.warn('Tool execution rate limited', undefined, {
            toolName: context.toolName,
            connectionId: context.connectionId,
            result
        });

        this.metrics?.incrementCounter('tool_executions_rate_limited_total', {
            tool_name: context.toolName || 'unknown',
            connection_id: context.connectionId || 'unknown',
            rule: result.appliedRule || 'unknown'
        });

        // Create MCP-compatible error
        const error = new Error(result.error?.message || 'Rate limit exceeded');
        (error as Error & { code?: string }).code = result.error?.code || 'RATE_LIMIT_EXCEEDED';
        (error as Error & { retryAfter?: number }).retryAfter = result.error?.retryAfter;
        (error as Error & { rateLimitResult?: unknown }).rateLimitResult = result;

        throw error;
    }
}

/**
 * SSE connection rate limiting
 */
export class SSERateLimitingWrapper {
    constructor(
        private readonly rateLimiter: IRateLimiter,
        private readonly logger?: IStructuredLogger,
        private readonly metrics?: IMetricsCollector
    ) {
    }

    /**
     * Check if SSE connection is allowed
     */
    async checkConnection(
        connectionId: string,
        clientIp?: string,
        userAgent?: string
    ): Promise<RateLimitResult> {
        const context: RateLimitContext = {
            identifier: connectionId,
            requestId: `sse_${Date.now()}_${Math.random()}`,
            connectionId,
            ...(clientIp && {clientIp}),
            ...(userAgent && {userAgent}),
            timestamp: Date.now()
        };

        const result = await this.rateLimiter.checkLimit(context);

        if (!result.allowed) {
            this.logger?.warn('SSE connection rate limited', undefined, {
                connectionId,
                clientIp,
                result
            });

            this.metrics?.incrementCounter('sse_connections_rate_limited_total', {
                connection_id: connectionId,
                rule: result.appliedRule || 'unknown'
            });
        }

        return result;
    }

    /**
     * Start tracking SSE connection
     */
    async startConnection(connectionId: string, clientIp?: string, userAgent?: string): Promise<void> {
        const context: RateLimitContext = {
            identifier: connectionId,
            requestId: `sse_conn_${Date.now()}`,
            connectionId,
            ...(clientIp && {clientIp}),
            ...(userAgent && {userAgent}),
            timestamp: Date.now()
        };

        await this.rateLimiter.startRequest(context);
    }

    /**
     * Complete SSE connection tracking
     */
    async completeConnection(connectionId: string): Promise<void> {
        const context: RateLimitContext = {
            identifier: connectionId,
            connectionId,
            timestamp: Date.now()
        };

        await this.rateLimiter.completeRequest(context);
    }
}

/**
 * Rate limiting configuration manager
 */
export class RateLimitingManager {
    constructor(
        private readonly rateLimiter: IRateLimiter,
        private readonly logger?: IStructuredLogger
    ) {
    }

    /**
     * Create HTTP middleware
     */
    createHttpMiddleware(): express.RequestHandler {
        return createHttpRateLimitMiddleware(this.rateLimiter, this.logger);
    }

    /**
     * Create MCP tool wrapper
     */
    createMCPWrapper(): MCPRateLimitingWrapper {
        return new MCPRateLimitingWrapper(this.rateLimiter, this.logger);
    }

    /**
     * Create SSE wrapper
     */
    createSSEWrapper(): SSERateLimitingWrapper {
        return new SSERateLimitingWrapper(this.rateLimiter, this.logger);
    }

    /**
     * Get rate limiting statistics
     */
    getStats() {
        return this.rateLimiter.getStats();
    }

    /**
     * Get rate limiting rules
     */
    getRules() {
        return this.rateLimiter.getRules();
    }

    /**
     * Add new rate limiting rule
     */
    addRule(rule: RateLimitRule) {
        this.rateLimiter.addRule(rule);
        this.logger?.info('Rate limiting rule added', undefined, {
            ruleName: rule.name,
            scope: rule.scope
        });
    }

    /**
     * Remove rate limiting rule
     */
    removeRule(ruleName: string) {
        this.rateLimiter.removeRule(ruleName);
        this.logger?.info('Rate limiting rule removed', undefined, {ruleName});
    }

    /**
     * Cleanup rate limiter
     */
    async cleanup() {
        await this.rateLimiter.cleanup();
    }

    /**
     * Destroy rate limiter
     */
    destroy() {
        if ('destroy' in this.rateLimiter) {
            const destroyableLimiter = this.rateLimiter as unknown as { destroy: () => void };
            destroyableLimiter.destroy();
        }
    }
}