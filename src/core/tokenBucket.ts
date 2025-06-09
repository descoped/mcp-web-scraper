/**
 * Token bucket implementation for rate limiting.
 * 
 * Provides smooth rate limiting with burst capability using the token bucket algorithm.
 * Tokens are added at a fixed rate and consumed per request.
 */

import { 
  TokenBucketConfig, 
  TokenBucketConfigSchema,
  ITokenBucket 
} from '../types/rateLimiting.js';

/**
 * Token bucket implementation with configurable refill rate and capacity
 */
export class TokenBucket implements ITokenBucket {
  private readonly config: TokenBucketConfig;
  private currentTokens: number;
  private lastRefill: number;
  private refillTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<TokenBucketConfig> = {}) {
    this.config = TokenBucketConfigSchema.parse(config);
    this.currentTokens = this.config.initialTokens ?? this.config.capacity;
    this.lastRefill = Date.now();
    
    // Start refill timer
    this.startRefillTimer();
  }

  /**
   * Check if tokens are available and consume them
   */
  async consume(tokens: number = this.config.tokensPerRequest): Promise<boolean> {
    // Refill tokens based on elapsed time
    this.refillTokens();
    
    // Check if enough tokens are available
    if (this.currentTokens >= tokens) {
      this.currentTokens -= tokens;
      return true;
    }
    
    return false;
  }

  /**
   * Check available tokens without consuming
   */
  getAvailableTokens(): number {
    this.refillTokens();
    return this.currentTokens;
  }

  /**
   * Get time until next refill in milliseconds
   */
  getRefillTime(): number {
    const timeSinceLastRefill = Date.now() - this.lastRefill;
    const timeUntilNextRefill = this.config.refillInterval - (timeSinceLastRefill % this.config.refillInterval);
    return Math.max(0, timeUntilNextRefill);
  }

  /**
   * Reset bucket to initial state
   */
  reset(): void {
    this.currentTokens = this.config.initialTokens ?? this.config.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Get current bucket state
   */
  getState(): {
    currentTokens: number;
    capacity: number;
    refillRate: number;
    lastRefill: number;
  } {
    this.refillTokens();
    return {
      currentTokens: this.currentTokens,
      capacity: this.config.capacity,
      refillRate: this.config.refillRate,
      lastRefill: this.lastRefill
    };
  }

  /**
   * Cleanup resources (stop timers)
   */
  cleanup(): void {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const timeSinceRefill = now - this.lastRefill;
    
    if (timeSinceRefill >= this.config.refillInterval) {
      // Calculate how many refill intervals have passed
      const intervals = Math.floor(timeSinceRefill / this.config.refillInterval);
      
      // Add tokens for each interval
      const tokensToAdd = intervals * this.config.refillRate;
      this.currentTokens = Math.min(this.config.capacity, this.currentTokens + tokensToAdd);
      
      // Update last refill time
      this.lastRefill = now - (timeSinceRefill % this.config.refillInterval);
    }
  }

  /**
   * Start periodic refill timer for real-time updates
   */
  private startRefillTimer(): void {
    // Only start timer if refill interval is reasonable for periodic updates
    if (this.config.refillInterval <= 10000) { // 10 seconds or less
      this.refillTimer = setInterval(() => {
        this.refillTokens();
      }, Math.min(this.config.refillInterval, 1000)); // At most every second
    }
  }
}

/**
 * Token bucket factory for creating pre-configured buckets
 */
export class TokenBucketFactory {
  /**
   * Create a bucket for global rate limiting
   */
  static createGlobalBucket(): TokenBucket {
    return new TokenBucket({
      capacity: 1000,
      refillRate: 100,
      refillInterval: 1000,
      tokensPerRequest: 1,
      allowBurst: true
    });
  }

  /**
   * Create a bucket for per-connection rate limiting
   */
  static createConnectionBucket(): TokenBucket {
    return new TokenBucket({
      capacity: 50,
      refillRate: 10,
      refillInterval: 1000,
      tokensPerRequest: 1,
      allowBurst: true
    });
  }

  /**
   * Create a bucket for tool-specific rate limiting
   */
  static createToolBucket(toolName: string): TokenBucket {
    // Different limits based on tool resource requirements
    switch (toolName) {
      case 'scrape_article_content':
        return new TokenBucket({
          capacity: 20,
          refillRate: 2,
          refillInterval: 1000,
          tokensPerRequest: 2,
          allowBurst: false
        });
      
      case 'get_page_screenshot':
        return new TokenBucket({
          capacity: 10,
          refillRate: 1,
          refillInterval: 1000,
          tokensPerRequest: 3,
          allowBurst: false
        });
      
      case 'handle_cookie_consent':
        return new TokenBucket({
          capacity: 30,
          refillRate: 5,
          refillInterval: 1000,
          tokensPerRequest: 1,
          allowBurst: true
        });
      
      default:
        return new TokenBucket({
          capacity: 25,
          refillRate: 5,
          refillInterval: 1000,
          tokensPerRequest: 1,
          allowBurst: true
        });
    }
  }

  /**
   * Create a bucket for IP-based rate limiting
   */
  static createIpBucket(): TokenBucket {
    return new TokenBucket({
      capacity: 100,
      refillRate: 20,
      refillInterval: 1000,
      tokensPerRequest: 1,
      allowBurst: true
    });
  }

  /**
   * Create a bucket with custom configuration
   */
  static createCustomBucket(config: Partial<TokenBucketConfig>): TokenBucket {
    return new TokenBucket(config);
  }
}

/**
 * Token bucket manager for handling multiple buckets
 */
export class TokenBucketManager {
  private buckets: Map<string, TokenBucket> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private lastAccess: Map<string, number> = new Map();
  private readonly maxBuckets: number;
  private readonly cleanupInterval: number;
  private readonly bucketTtl: number;

  constructor(
    maxBuckets: number = 10000,
    cleanupInterval: number = 300000, // 5 minutes
    bucketTtl: number = 3600000 // 1 hour
  ) {
    this.maxBuckets = maxBuckets;
    this.cleanupInterval = cleanupInterval;
    this.bucketTtl = bucketTtl;
    
    this.startCleanupTimer();
  }

  /**
   * Get or create a token bucket for an identifier
   */
  getBucket(identifier: string, factory: () => TokenBucket): TokenBucket {
    let bucket = this.buckets.get(identifier);
    
    if (!bucket) {
      // Check if we've hit the maximum number of buckets
      if (this.buckets.size >= this.maxBuckets) {
        this.cleanupOldestBuckets();
      }
      
      bucket = factory();
      this.buckets.set(identifier, bucket);
    }
    
    // Update last access time
    this.lastAccess.set(identifier, Date.now());
    
    return bucket;
  }

  /**
   * Remove a bucket
   */
  removeBucket(identifier: string): void {
    const bucket = this.buckets.get(identifier);
    if (bucket) {
      bucket.cleanup();
      this.buckets.delete(identifier);
      this.lastAccess.delete(identifier);
    }
  }

  /**
   * Get statistics about bucket usage
   */
  getStats(): {
    totalBuckets: number;
    averageTokens: number;
    bucketsNearCapacity: number;
    bucketsEmpty: number;
  } {
    const totalBuckets = this.buckets.size;
    let totalTokens = 0;
    let bucketsNearCapacity = 0;
    let bucketsEmpty = 0;

    for (const bucket of this.buckets.values()) {
      const state = bucket.getState();
      totalTokens += state.currentTokens;
      
      const utilizationRatio = state.currentTokens / state.capacity;
      if (utilizationRatio > 0.8) {
        bucketsNearCapacity++;
      } else if (utilizationRatio === 0) {
        bucketsEmpty++;
      }
    }

    return {
      totalBuckets,
      averageTokens: totalBuckets > 0 ? totalTokens / totalBuckets : 0,
      bucketsNearCapacity,
      bucketsEmpty
    };
  }

  /**
   * Cleanup expired buckets
   */
  cleanup(): void {
    const now = Date.now();
    const expiredIdentifiers: string[] = [];

    for (const [identifier, lastAccessTime] of this.lastAccess.entries()) {
      if (now - lastAccessTime > this.bucketTtl) {
        expiredIdentifiers.push(identifier);
      }
    }

    for (const identifier of expiredIdentifiers) {
      this.removeBucket(identifier);
    }
  }

  /**
   * Cleanup all buckets and stop timers
   */
  destroy(): void {
    // Cleanup all buckets
    for (const bucket of this.buckets.values()) {
      bucket.cleanup();
    }
    
    this.buckets.clear();
    this.lastAccess.clear();
    
    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Remove oldest buckets when limit is reached
   */
  private cleanupOldestBuckets(): void {
    const bucketCount = this.buckets.size;
    const bucketsToRemove = Math.ceil(bucketCount * 0.1); // Remove 10% of oldest buckets
    
    // Sort by last access time
    const sortedEntries = Array.from(this.lastAccess.entries())
      .sort((a, b) => a[1] - b[1]);
    
    // Remove oldest buckets
    for (let i = 0; i < bucketsToRemove && i < sortedEntries.length; i++) {
      const entry = sortedEntries[i];
      if (entry) {
        const [identifier] = entry;
        this.removeBucket(identifier);
      }
    }
  }

  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }
}