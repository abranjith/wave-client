/**
 * Rate Limiter
 * 
 * Token bucket rate limiter for API requests.
 */

// ============================================================================
// Types
// ============================================================================

export interface RateLimiterConfig {
  /** Maximum tokens (requests) in the bucket */
  maxTokens: number;
  /** Token refill rate per second */
  refillRate: number;
  /** Initial tokens (defaults to maxTokens) */
  initialTokens?: number;
}

export interface RateLimiterState {
  tokens: number;
  lastRefill: number;
  waiting: number;
}

// ============================================================================
// Rate Limiter Implementation
// ============================================================================

/**
 * Create a rate limiter instance
 * 
 * Uses token bucket algorithm for smooth rate limiting.
 */
export function createRateLimiter(config: RateLimiterConfig) {
  const { maxTokens, refillRate, initialTokens = maxTokens } = config;

  let tokens = initialTokens;
  let lastRefill = Date.now();
  let waitingCount = 0;

  /**
   * Refill tokens based on elapsed time
   */
  const refillTokens = (): void => {
    const now = Date.now();
    const elapsed = (now - lastRefill) / 1000; // seconds
    const newTokens = elapsed * refillRate;
    
    tokens = Math.min(maxTokens, tokens + newTokens);
    lastRefill = now;
  };

  /**
   * Calculate wait time until a token is available
   */
  const calculateWaitTime = (): number => {
    if (tokens >= 1) {
      return 0;
    }
    
    const tokensNeeded = 1 - tokens;
    return Math.ceil((tokensNeeded / refillRate) * 1000); // milliseconds
  };

  return {
    /**
     * Acquire a token (wait if necessary)
     * Returns true when token is acquired
     */
    async acquire(): Promise<boolean> {
      refillTokens();
      
      const waitTime = calculateWaitTime();
      
      if (waitTime > 0) {
        waitingCount++;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        waitingCount--;
        refillTokens();
      }
      
      if (tokens >= 1) {
        tokens -= 1;
        return true;
      }
      
      return false;
    },

    /**
     * Try to acquire a token without waiting
     * Returns true if token was acquired, false otherwise
     */
    tryAcquire(): boolean {
      refillTokens();
      
      if (tokens >= 1) {
        tokens -= 1;
        return true;
      }
      
      return false;
    },

    /**
     * Check if a token is available without consuming it
     */
    isAvailable(): boolean {
      refillTokens();
      return tokens >= 1;
    },

    /**
     * Get current state
     */
    getState(): RateLimiterState {
      refillTokens();
      return {
        tokens,
        lastRefill,
        waiting: waitingCount,
      };
    },

    /**
     * Reset the rate limiter
     */
    reset(): void {
      tokens = initialTokens;
      lastRefill = Date.now();
    },

    /**
     * Get configuration
     */
    getConfig(): RateLimiterConfig {
      return { maxTokens, refillRate, initialTokens };
    },
  };
}

/**
 * Create a rate limiter per domain
 * 
 * Useful for managing rate limits across multiple APIs/domains.
 */
export function createDomainRateLimiter(defaultConfig: RateLimiterConfig) {
  const limiters = new Map<string, ReturnType<typeof createRateLimiter>>();

  /**
   * Get or create rate limiter for a domain
   */
  const getForDomain = (domain: string): ReturnType<typeof createRateLimiter> => {
    let limiter = limiters.get(domain);
    
    if (!limiter) {
      limiter = createRateLimiter(defaultConfig);
      limiters.set(domain, limiter);
    }
    
    return limiter;
  };

  return {
    /**
     * Acquire a token for a specific domain
     */
    async acquire(domain: string): Promise<boolean> {
      return getForDomain(domain).acquire();
    },

    /**
     * Try to acquire a token for a domain without waiting
     */
    tryAcquire(domain: string): boolean {
      return getForDomain(domain).tryAcquire();
    },

    /**
     * Check if a token is available for a domain
     */
    isAvailable(domain: string): boolean {
      return getForDomain(domain).isAvailable();
    },

    /**
     * Get state for a domain
     */
    getState(domain: string): RateLimiterState {
      return getForDomain(domain).getState();
    },

    /**
     * Reset rate limiter for a domain
     */
    reset(domain: string): void {
      getForDomain(domain).reset();
    },

    /**
     * Reset all domain rate limiters
     */
    resetAll(): void {
      for (const limiter of limiters.values()) {
        limiter.reset();
      }
    },

    /**
     * Get all tracked domains
     */
    getDomains(): string[] {
      return Array.from(limiters.keys());
    },
  };
}
