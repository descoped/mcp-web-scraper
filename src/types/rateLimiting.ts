/**
 * Rate limiting types and configuration for protecting against abuse.
 * 
 * Implements token bucket algorithm with per-connection and global limits
 * to ensure fair resource allocation and system stability.
 */

import {z} from 'zod';

/**
 * Rate limiting strategy types
 */
export enum RateLimitStrategy {
  TOKEN_BUCKET = 'token_bucket',      // Token bucket algorithm (recommended)
  SLIDING_WINDOW = 'sliding_window',  // Sliding window counter
  FIXED_WINDOW = 'fixed_window'       // Fixed window counter
}

/**
 * Rate limit scope for different types of limits
 */
export enum RateLimitScope {
  GLOBAL = 'global',           // Server-wide limits
  PER_CONNECTION = 'per_connection',  // Per MCP connection
  PER_IP = 'per_ip',          // Per client IP address
  PER_TOOL = 'per_tool',      // Per tool type
  PER_USER = 'per_user'       // Per authenticated user (future)
}

/**
 * Rate limit violation actions
 */
export enum RateLimitAction {
  REJECT = 'reject',           // Reject request immediately
  DELAY = 'delay',            // Add delay before processing
  QUEUE = 'queue',            // Queue request for later processing
  THROTTLE = 'throttle'       // Reduce processing priority
}

/**
 * Token bucket configuration schema
 */
export const TokenBucketConfigSchema = z.object({
    // Bucket capacity (maximum tokens)
    capacity: z.number().int().min(1).max(10000).default(100),

    // Token refill rate (tokens per time unit)
    refillRate: z.number().positive().default(10),

    // Refill interval in milliseconds
    refillInterval: z.number().int().min(100).max(60000).default(1000),

    // Initial token count
    initialTokens: z.number().int().min(0).optional(),

    // Minimum tokens required per request
    tokensPerRequest: z.number().int().min(1).default(1),

    // Allow burst requests (up to capacity)
    allowBurst: z.boolean().default(true)
});

export type TokenBucketConfig = z.infer<typeof TokenBucketConfigSchema>;

/**
 * Rate limit rule configuration
 */
export const RateLimitRuleSchema = z.object({
    // Rule identifier
    name: z.string().min(1),

    // Rule description
    description: z.string().optional(),

    // Rate limiting strategy
    strategy: z.nativeEnum(RateLimitStrategy).default(RateLimitStrategy.TOKEN_BUCKET),

    // Scope of the limit
    scope: z.nativeEnum(RateLimitScope),

    // Token bucket configuration
    tokenBucket: TokenBucketConfigSchema.optional(),

    // Rate limit thresholds
    limits: z.object({
    // Requests per time window
        requestsPerWindow: z.number().int().min(1).default(100),

        // Time window in milliseconds
        windowMs: z.number().int().min(1000).default(60000),

        // Maximum concurrent requests
        maxConcurrent: z.number().int().min(1).default(10),

        // Request timeout in milliseconds
        requestTimeout: z.number().int().min(1000).default(30000)
    }),

    // Action when limit is exceeded
    action: z.nativeEnum(RateLimitAction).default(RateLimitAction.REJECT),

    // Delay configuration for DELAY action
    delayConfig: z.object({
        baseDelayMs: z.number().int().min(0).default(1000),
        maxDelayMs: z.number().int().min(1000).default(10000),
        backoffMultiplier: z.number().min(1).default(2)
    }).optional(),

    // Queue configuration for QUEUE action
    queueConfig: z.object({
        maxQueueSize: z.number().int().min(1).default(100),
        queueTimeoutMs: z.number().int().min(1000).default(30000),
        priority: z.number().int().min(1).max(10).default(5)
    }).optional(),

    // Rule priority (higher number = higher priority)
    priority: z.number().int().min(1).max(100).default(50),

    // Enable/disable rule
    enabled: z.boolean().default(true),

    // Exemptions (connections/IPs that bypass this rule)
    exemptions: z.object({
        connectionIds: z.array(z.string()).default([]),
        ipAddresses: z.array(z.string()).default([]),
        userAgents: z.array(z.string()).default([])
    }).optional()
});

export type RateLimitRule = z.infer<typeof RateLimitRuleSchema>;

/**
 * Rate limiting configuration schema
 */
export const RateLimitingConfigSchema = z.object({
    // Enable/disable rate limiting
    enabled: z.boolean().default(true),

    // Global rate limiting enabled
    enableGlobalLimits: z.boolean().default(true),

    // Per-connection rate limiting enabled
    enablePerConnectionLimits: z.boolean().default(true),

    // Per-IP rate limiting enabled
    enablePerIpLimits: z.boolean().default(false),

    // Rate limiting rules
    rules: z.array(RateLimitRuleSchema).default([]),

    // Default limits when no specific rule applies
    defaultLimits: z.object({
        requestsPerMinute: z.number().int().min(1).default(60),
        maxConcurrentRequests: z.number().int().min(1).default(5),
        requestTimeoutMs: z.number().int().min(1000).default(30000)
    }),

    // Cleanup configuration
    cleanup: z.object({
    // How often to clean up expired entries (ms)
        intervalMs: z.number().int().min(60000).default(300000), // 5 minutes

        // How long to keep inactive entries (ms)
        retentionMs: z.number().int().min(300000).default(3600000), // 1 hour

        // Maximum entries to keep in memory
        maxEntries: z.number().int().min(100).default(10000)
    }),

    // Monitoring and logging
    monitoring: z.object({
    // Log rate limit violations
        logViolations: z.boolean().default(true),

        // Log successful rate limit checks
        logSuccess: z.boolean().default(false),

        // Emit metrics for rate limiting
        emitMetrics: z.boolean().default(true),

        // Include detailed context in logs
        includeContext: z.boolean().default(true)
    })
});

export type RateLimitingConfig = z.infer<typeof RateLimitingConfigSchema>;

/**
 * Rate limit check result
 */
export const RateLimitResultSchema = z.object({
    // Whether request is allowed
    allowed: z.boolean(),

    // Rule that was applied
    appliedRule: z.string().optional(),

    // Current state information
    state: z.object({
    // Current token count (for token bucket)
        currentTokens: z.number().optional(),

        // Requests in current window
        requestsInWindow: z.number().optional(),

        // Current concurrent requests
        currentConcurrent: z.number().optional(),

        // Time until next token refill (ms)
        refillTimeMs: z.number().optional(),

        // Time until window reset (ms)
        windowResetMs: z.number().optional()
    }),

    // Rate limit headers for HTTP responses
    headers: z.object({
        'X-RateLimit-Limit': z.string().optional(),
        'X-RateLimit-Remaining': z.string().optional(),
        'X-RateLimit-Reset': z.string().optional(),
        'X-RateLimit-RetryAfter': z.string().optional()
    }),

    // Delay information for DELAY action
    delayMs: z.number().int().min(0).optional(),

    // Queue information for QUEUE action
    queuePosition: z.number().int().min(0).optional(),

    // Error information if limit exceeded
    error: z.object({
        code: z.string(),
        message: z.string(),
        retryAfter: z.number().int().optional()
    }).optional(),

    // Timestamp of the check
    timestamp: z.string().datetime(),

    // Debugging information
    debug: z.object({
        scope: z.nativeEnum(RateLimitScope),
        strategy: z.nativeEnum(RateLimitStrategy),
        identifier: z.string(),
        rulesPriority: z.array(z.string()).optional()
    }).optional()
});

export type RateLimitResult = z.infer<typeof RateLimitResultSchema>;

/**
 * Rate limit context for tracking requests
 */
export interface RateLimitContext {
  // Client identifier (connection ID, IP, etc.)
  identifier: string;
  
  // Request context
  requestId?: string;
  toolName?: string;
  connectionId?: string;
  clientIp?: string;
  userAgent?: string;
  
  // Request metadata
  requestSize?: number;
  estimatedDuration?: number;
  priority?: number;
  
  // Timestamp when request started
  timestamp?: number;
}

/**
 * Token bucket interface for rate limiting
 */
export interface ITokenBucket {
  // Check if tokens are available and consume them
  consume(tokens?: number): Promise<boolean>;
  
  // Check available tokens without consuming
  getAvailableTokens(): number;
  
  // Get time until next refill
  getRefillTime(): number;
  
  // Reset bucket to initial state
  reset(): void;
  
  // Get current bucket state
  getState(): {
    currentTokens: number;
    capacity: number;
    refillRate: number;
    lastRefill: number;
  };
}

/**
 * Rate limiter interface
 */
export interface IRateLimiter {
  // Check if request is allowed
  checkLimit(context: RateLimitContext): Promise<RateLimitResult>;
  
  // Start tracking a request
  startRequest(context: RateLimitContext): Promise<void>;
  
  // Complete a request (decreases concurrent count)
  completeRequest(context: RateLimitContext): Promise<void>;
  
  // Get current statistics
  getStats(): {
    totalRequests: number;
    allowedRequests: number;
    rejectedRequests: number;
    activeConnections: number;
    averageTokens: number;
  };
  
  // Cleanup expired entries
  cleanup(): Promise<void>;
  
  // Add or update a rule
  addRule(rule: RateLimitRule): void;
  
  // Remove a rule
  removeRule(ruleName: string): void;
  
  // Get all rules
  getRules(): RateLimitRule[];
}

/**
 * Rate limiting middleware context
 */
export interface RateLimitMiddlewareContext {
  request: {
    id: string;
    method: string;
    path: string;
    ip?: string;
    userAgent?: string;
    connectionId?: string;
  };
  
  // Function to proceed with request
    next: () => Promise<unknown>;
  
  // Function to reject request
  reject: (result: RateLimitResult) => Promise<void>;
  
  // Function to delay request
  delay: (delayMs: number) => Promise<void>;
}

/**
 * Default rate limiting rules for MCP server
 */
export const DEFAULT_RATE_LIMIT_RULES: RateLimitRule[] = [
    // Global server protection
    {
        name: 'global_requests',
        description: 'Global request rate limit to protect server resources',
        strategy: RateLimitStrategy.TOKEN_BUCKET,
        scope: RateLimitScope.GLOBAL,
        tokenBucket: {
            capacity: 1000,
            refillRate: 100,
            refillInterval: 1000,
            tokensPerRequest: 1,
            allowBurst: true
        },
        limits: {
            requestsPerWindow: 1000,
            windowMs: 60000,
            maxConcurrent: 50,
            requestTimeout: 30000
        },
        action: RateLimitAction.REJECT,
        priority: 100,
        enabled: true
    },

    // Per-connection limits
    {
        name: 'connection_requests',
        description: 'Per-connection rate limit for fair resource allocation',
        strategy: RateLimitStrategy.TOKEN_BUCKET,
        scope: RateLimitScope.PER_CONNECTION,
        tokenBucket: {
            capacity: 50,
            refillRate: 10,
            refillInterval: 1000,
            tokensPerRequest: 1,
            allowBurst: true
        },
        limits: {
            requestsPerWindow: 60,
            windowMs: 60000,
            maxConcurrent: 5,
            requestTimeout: 30000
        },
        action: RateLimitAction.DELAY,
        delayConfig: {
            baseDelayMs: 1000,
            maxDelayMs: 10000,
            backoffMultiplier: 2
        },
        priority: 80,
        enabled: true
    },

    // Tool-specific limits
    {
        name: 'scraping_tools',
        description: 'Rate limit for resource-intensive scraping tools',
        strategy: RateLimitStrategy.TOKEN_BUCKET,
        scope: RateLimitScope.PER_TOOL,
        tokenBucket: {
            capacity: 20,
            refillRate: 2,
            refillInterval: 1000,
            tokensPerRequest: 2,
            allowBurst: false
        },
        limits: {
            requestsPerWindow: 30,
            windowMs: 60000,
            maxConcurrent: 3,
            requestTimeout: 60000
        },
        action: RateLimitAction.QUEUE,
        queueConfig: {
            maxQueueSize: 10,
            queueTimeoutMs: 30000,
            priority: 5
        },
        priority: 60,
        enabled: true
    }
];