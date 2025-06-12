/**
 * Advanced rate limiter with multiple strategies and scopes.
 *
 * Supports token bucket, sliding window, and fixed window algorithms
 * with per-connection, per-IP, per-tool, and global rate limiting.
 */

import {
    DEFAULT_RATE_LIMIT_RULES,
    IRateLimiter,
    RateLimitContext,
    RateLimitingConfig,
    RateLimitingConfigSchema,
    RateLimitResult,
    RateLimitRule,
    RateLimitScope,
    RateLimitStrategy
} from '@/types/rateLimiting.js';

import {TokenBucket, TokenBucketFactory, TokenBucketManager} from '@/core/tokenBucket.js';
import type {IMetricsCollector, IStructuredLogger} from '@/types/monitoring.js';

/**
 * Request tracking for concurrent limits and sliding windows
 */
interface RequestTracker {
    identifier: string;
    scope: RateLimitScope;
    activeRequests: Set<string>;
    requestHistory: Array<{ timestamp: number; requestId: string }>;
    lastCleanup: number;
}

/**
 * Rate limiter implementation with multiple strategies
 */
export class RateLimiter implements IRateLimiter {
    private readonly config: RateLimitingConfig;
    private readonly rules: Map<string, RateLimitRule> = new Map();
    private readonly tokenBucketManager: TokenBucketManager;
    private readonly requestTrackers: Map<string, RequestTracker> = new Map();
    private readonly logger: IStructuredLogger | undefined;
    private readonly metrics: IMetricsCollector | undefined;

    // Statistics
    private stats = {
        totalRequests: 0,
        allowedRequests: 0,
        rejectedRequests: 0,
        delayedRequests: 0,
        queuedRequests: 0
    };

    private cleanupTimer: NodeJS.Timeout | null = null;

    constructor(
        config: Partial<RateLimitingConfig> = {},
        logger?: IStructuredLogger,
        metrics?: IMetricsCollector
    ) {
        this.config = RateLimitingConfigSchema.parse(config);
        this.logger = logger;
        this.metrics = metrics;

        // Initialize token bucket manager
        this.tokenBucketManager = new TokenBucketManager(
            this.config.cleanup.maxEntries,
            this.config.cleanup.intervalMs,
            this.config.cleanup.retentionMs
        );

        // Load default rules if none provided
        if (this.config.rules.length === 0) {
            DEFAULT_RATE_LIMIT_RULES.forEach(rule => this.addRule(rule));
        } else {
            this.config.rules.forEach(rule => this.addRule(rule));
        }

        // Start cleanup timer
        this.startCleanupTimer();

        this.logger?.info('Rate limiter initialized', undefined, {
            rulesCount: this.rules.size,
            config: this.config
        });
    }

    /**
     * Check if request is allowed based on configured rules
     */
    async checkLimit(context: RateLimitContext): Promise<RateLimitResult> {
        if (!this.config.enabled) {
            return this.createAllowedResult(context, 'rate_limiting_disabled');
        }

        this.stats.totalRequests++;

        // Find applicable rules (sorted by priority)
        const applicableRules = this.getApplicableRules(context);

        if (applicableRules.length === 0) {
            return this.checkDefaultLimits(context);
        }

        // Check each rule in priority order
        for (const rule of applicableRules) {
            const result = await this.checkRule(rule, context);

            if (!result.allowed) {
                this.stats.rejectedRequests++;
                this.recordMetrics('rate_limit_violation', context, rule);

                if (this.config.monitoring.logViolations) {
                    this.logger?.warn('Rate limit violation', undefined, {
                        rule: rule.name,
                        context,
                        result
                    });
                }

                return result;
            }
        }

        this.stats.allowedRequests++;
        this.recordMetrics('rate_limit_allowed', context);

        if (this.config.monitoring.logSuccess) {
            this.logger?.debug('Rate limit check passed', undefined, {
                context,
                rulesChecked: applicableRules.map(r => r.name)
            });
        }

        return this.createAllowedResult(context, applicableRules[0]?.name);
    }

    /**
     * Start tracking a request (for concurrent limits)
     */
    async startRequest(context: RateLimitContext): Promise<void> {
        const requestId = context.requestId || `req_${Date.now()}_${Math.random()}`;

        // Track concurrent requests for all applicable scopes
        const scopes = this.getTrackingScopes(context);

        for (const scope of scopes) {
            const identifier = this.getIdentifier(context, scope);
            const tracker = this.getOrCreateTracker(identifier, scope);

            tracker.activeRequests.add(requestId);
            tracker.requestHistory.push({
                timestamp: Date.now(),
                requestId
            });

            // Cleanup old history
            this.cleanupRequestHistory(tracker);
        }
    }

    /**
     * Complete a request (decreases concurrent count)
     */
    async completeRequest(context: RateLimitContext): Promise<void> {
        const requestId = context.requestId || '';

        // Remove from concurrent tracking for all applicable scopes
        const scopes = this.getTrackingScopes(context);

        for (const scope of scopes) {
            const identifier = this.getIdentifier(context, scope);
            const tracker = this.requestTrackers.get(identifier);

            if (tracker) {
                tracker.activeRequests.delete(requestId);
            }
        }
    }

    /**
     * Get current statistics
     */
    getStats(): {
        totalRequests: number;
        allowedRequests: number;
        rejectedRequests: number;
        activeConnections: number;
        averageTokens: number;
    } {
        const bucketStats = this.tokenBucketManager.getStats();
        const activeConnections = Array.from(this.requestTrackers.values())
            .reduce((sum, tracker) => sum + tracker.activeRequests.size, 0);

        return {
            ...this.stats,
            activeConnections,
            averageTokens: bucketStats.averageTokens
        };
    }

    /**
     * Cleanup expired entries
     */
    async cleanup(): Promise<void> {
        const now = Date.now();
        const retentionMs = this.config.cleanup.retentionMs;

        // Cleanup request trackers
        const expiredTrackers: string[] = [];
        for (const [identifier, tracker] of this.requestTrackers.entries()) {
            if (now - tracker.lastCleanup > retentionMs && tracker.activeRequests.size === 0) {
                expiredTrackers.push(identifier);
            }
        }

        expiredTrackers.forEach(identifier => {
            this.requestTrackers.delete(identifier);
        });

        // Cleanup token buckets
        this.tokenBucketManager.cleanup();

        this.logger?.debug('Rate limiter cleanup completed', undefined, {
            expiredTrackers: expiredTrackers.length,
            activeTrackers: this.requestTrackers.size
        });
    }

    /**
     * Add or update a rule
     */
    addRule(rule: RateLimitRule): void {
        this.rules.set(rule.name, rule);
        this.logger?.info('Rate limit rule added', undefined, {
            ruleName: rule.name,
            scope: rule.scope,
            strategy: rule.strategy
        });
    }

    /**
     * Remove a rule
     */
    removeRule(ruleName: string): void {
        this.rules.delete(ruleName);
        this.logger?.info('Rate limit rule removed', undefined, {ruleName});
    }

    /**
     * Get all rules
     */
    getRules(): RateLimitRule[] {
        return Array.from(this.rules.values());
    }

    /**
     * Destroy rate limiter and cleanup resources
     */
    destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }

        this.tokenBucketManager.destroy();
        this.requestTrackers.clear();

        this.logger?.info('Rate limiter destroyed');
    }

    /**
     * Check a specific rule against context
     */
    private async checkRule(rule: RateLimitRule, context: RateLimitContext): Promise<RateLimitResult> {
        if (!rule.enabled) {
            return this.createAllowedResult(context, rule.name);
        }

        // Check exemptions
        if (this.isExempt(rule, context)) {
            return this.createAllowedResult(context, rule.name, true);
        }

        const identifier = this.getIdentifier(context, rule.scope);

        // Check based on strategy
        switch (rule.strategy) {
            case RateLimitStrategy.TOKEN_BUCKET:
                return await this.checkTokenBucket(rule, context, identifier);

            case RateLimitStrategy.SLIDING_WINDOW:
                return await this.checkSlidingWindow(rule, context, identifier);

            case RateLimitStrategy.FIXED_WINDOW:
                return await this.checkFixedWindow(rule, context, identifier);

            default:
                this.logger?.error('Unknown rate limit strategy', undefined, {
                    toolName: rule.name,
                    labels: {strategy: rule.strategy}
                });
                return this.createAllowedResult(context, rule.name);
        }
    }

    /**
     * Check token bucket strategy
     */
    private async checkTokenBucket(
        rule: RateLimitRule,
        context: RateLimitContext,
        identifier: string
    ): Promise<RateLimitResult> {
        const bucket = this.tokenBucketManager.getBucket(identifier, () => {
            if (rule.tokenBucket) {
                return new TokenBucket(rule.tokenBucket);
            } else if (rule.scope === RateLimitScope.GLOBAL) {
                return TokenBucketFactory.createGlobalBucket();
            } else if (rule.scope === RateLimitScope.PER_CONNECTION) {
                return TokenBucketFactory.createConnectionBucket();
            } else if (rule.scope === RateLimitScope.PER_TOOL && context.toolName) {
                return TokenBucketFactory.createToolBucket(context.toolName);
            } else {
                return TokenBucketFactory.createConnectionBucket();
            }
        });

        const tokensRequired = rule.tokenBucket?.tokensPerRequest || 1;
        const allowed = await bucket.consume(tokensRequired);

        if (allowed) {
            return this.createAllowedResult(context, rule.name);
        }

        // Create rate limit exceeded result
        const state = bucket.getState();
        const refillTime = bucket.getRefillTime();

        return {
            allowed: false,
            appliedRule: rule.name,
            state: {
                currentTokens: state.currentTokens,
                refillTimeMs: refillTime
            },
            headers: {
                'X-RateLimit-Limit': rule.tokenBucket?.capacity.toString() || '100',
                'X-RateLimit-Remaining': Math.floor(state.currentTokens).toString(),
                'X-RateLimit-Reset': new Date(Date.now() + refillTime).toISOString(),
                'X-RateLimit-RetryAfter': Math.ceil(refillTime / 1000).toString()
            },
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: `Rate limit exceeded. ${tokensRequired} tokens required, ${Math.floor(state.currentTokens)} available.`,
                retryAfter: Math.ceil(refillTime / 1000)
            },
            timestamp: new Date().toISOString(),
            debug: this.config.monitoring.includeContext ? {
                scope: rule.scope,
                strategy: rule.strategy,
                identifier
            } : undefined
        };
    }

    /**
     * Check sliding window strategy
     */
    private async checkSlidingWindow(
        rule: RateLimitRule,
        context: RateLimitContext,
        identifier: string
    ): Promise<RateLimitResult> {
        const tracker = this.getOrCreateTracker(identifier, rule.scope);
        const now = Date.now();
        const windowMs = rule.limits.windowMs;

        // Clean up old requests outside the window
        this.cleanupRequestHistory(tracker, windowMs);

        // Check if we're within the limit
        const requestsInWindow = tracker.requestHistory.length;
        const maxRequests = rule.limits.requestsPerWindow;

        if (requestsInWindow >= maxRequests) {
            const oldestRequest = tracker.requestHistory[0];
            if (!oldestRequest) {
                // Fallback if no oldest request found
                return this.createAllowedResult(context, rule.name);
            }
            const windowResetMs = windowMs - (now - oldestRequest.timestamp);

            return {
                allowed: false,
                appliedRule: rule.name,
                state: {
                    requestsInWindow,
                    windowResetMs: Math.max(0, windowResetMs)
                },
                headers: {
                    'X-RateLimit-Limit': maxRequests.toString(),
                    'X-RateLimit-Remaining': Math.max(0, maxRequests - requestsInWindow).toString(),
                    'X-RateLimit-Reset': new Date(now + windowResetMs).toISOString(),
                    'X-RateLimit-RetryAfter': Math.ceil(windowResetMs / 1000).toString()
                },
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: `Rate limit exceeded. ${requestsInWindow}/${maxRequests} requests in ${windowMs}ms window.`,
                    retryAfter: Math.ceil(windowResetMs / 1000)
                },
                timestamp: new Date().toISOString(),
                debug: this.config.monitoring.includeContext ? {
                    scope: rule.scope,
                    strategy: rule.strategy,
                    identifier
                } : undefined
            };
        }

        return this.createAllowedResult(context, rule.name);
    }

    /**
     * Check fixed window strategy
     */
    private async checkFixedWindow(
        rule: RateLimitRule,
        context: RateLimitContext,
        identifier: string
    ): Promise<RateLimitResult> {
        // Similar to sliding window but resets at fixed intervals
        // For simplicity, implementing as sliding window
        return await this.checkSlidingWindow(rule, context, identifier);
    }

    /**
     * Check default limits when no specific rule applies
     */
    private checkDefaultLimits(context: RateLimitContext): RateLimitResult {
        // Apply basic default limits
        return this.createAllowedResult(context, 'default_limits');
    }

    /**
     * Get applicable rules for context
     */
    private getApplicableRules(context: RateLimitContext): RateLimitRule[] {
        const applicable: RateLimitRule[] = [];

        for (const rule of this.rules.values()) {
            if (!rule.enabled) continue;

            // Check if rule applies to this context
            if (this.ruleApplies(rule, context)) {
                applicable.push(rule);
            }
        }

        // Sort by priority (higher number = higher priority)
        return applicable.sort((a, b) => b.priority - a.priority);
    }

    /**
     * Check if rule applies to context
     */
    private ruleApplies(rule: RateLimitRule, context: RateLimitContext): boolean {
        switch (rule.scope) {
            case RateLimitScope.GLOBAL:
                return true;

            case RateLimitScope.PER_CONNECTION:
                return !!context.connectionId;

            case RateLimitScope.PER_IP:
                return !!context.clientIp;

            case RateLimitScope.PER_TOOL:
                return !!context.toolName;

            case RateLimitScope.PER_USER:
                // Future implementation for authenticated users
                return false;

            default:
                return false;
        }
    }

    /**
     * Check if context is exempt from rule
     */
    private isExempt(rule: RateLimitRule, context: RateLimitContext): boolean {
        const exemptions = rule.exemptions;
        if (!exemptions) return false;

        return Boolean(
            (context.connectionId && exemptions.connectionIds.includes(context.connectionId)) ||
            (context.clientIp && exemptions.ipAddresses.includes(context.clientIp)) ||
            (context.userAgent && exemptions.userAgents.some(ua => context.userAgent?.includes(ua)))
        );
    }

    /**
     * Get identifier for scope
     */
    private getIdentifier(context: RateLimitContext, scope: RateLimitScope): string {
        switch (scope) {
            case RateLimitScope.GLOBAL:
                return 'global';

            case RateLimitScope.PER_CONNECTION:
                return `conn:${context.connectionId || context.identifier}`;

            case RateLimitScope.PER_IP:
                return `ip:${context.clientIp || context.identifier}`;

            case RateLimitScope.PER_TOOL:
                return `tool:${context.toolName || 'unknown'}`;

            case RateLimitScope.PER_USER:
                return `user:${context.identifier}`;

            default:
                return context.identifier;
        }
    }

    /**
     * Get tracking scopes for context
     */
    private getTrackingScopes(context: RateLimitContext): RateLimitScope[] {
        const scopes: RateLimitScope[] = [RateLimitScope.GLOBAL];

        if (context.connectionId) scopes.push(RateLimitScope.PER_CONNECTION);
        if (context.clientIp) scopes.push(RateLimitScope.PER_IP);
        if (context.toolName) scopes.push(RateLimitScope.PER_TOOL);

        return scopes;
    }

    /**
     * Get or create request tracker
     */
    private getOrCreateTracker(identifier: string, scope: RateLimitScope): RequestTracker {
        let tracker = this.requestTrackers.get(identifier);

        if (!tracker) {
            tracker = {
                identifier,
                scope,
                activeRequests: new Set(),
                requestHistory: [],
                lastCleanup: Date.now()
            };
            this.requestTrackers.set(identifier, tracker);
        }

        return tracker;
    }

    /**
     * Cleanup old request history
     */
    private cleanupRequestHistory(tracker: RequestTracker, windowMs?: number): void {
        const now = Date.now();
        const cutoff = now - (windowMs || 60000); // Default 1 minute window

        tracker.requestHistory = tracker.requestHistory.filter(
            req => req.timestamp > cutoff
        );

        tracker.lastCleanup = now;
    }

    /**
     * Create allowed result
     */
    private createAllowedResult(
        context: RateLimitContext,
        appliedRule?: string,
        exempt: boolean = false
    ): RateLimitResult {
        return {
            allowed: true,
            appliedRule,
            state: {},
            headers: {},
            timestamp: new Date().toISOString(),
            debug: this.config.monitoring.includeContext ? {
                scope: RateLimitScope.GLOBAL,
                strategy: RateLimitStrategy.TOKEN_BUCKET,
                identifier: context.identifier,
                ...(exempt && {exempt: true})
            } : undefined
        };
    }

    /**
     * Record metrics for rate limiting events
     */
    private recordMetrics(eventType: string, context: RateLimitContext, rule?: RateLimitRule): void {
        if (!this.config.monitoring.emitMetrics || !this.metrics) return;

        const labels = {
            event_type: eventType,
            scope: rule?.scope || 'unknown',
            rule_name: rule?.name || 'default',
            tool_name: context.toolName || 'unknown'
        };

        this.metrics.incrementCounter('rate_limit_events_total', labels);

        if (eventType === 'rate_limit_violation') {
            this.metrics.incrementCounter('rate_limit_violations_total', labels);
        }
    }

    /**
     * Start cleanup timer
     */
    private startCleanupTimer(): void {
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.config.cleanup.intervalMs);
    }
}