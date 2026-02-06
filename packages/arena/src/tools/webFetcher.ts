/**
 * Web Fetcher
 * 
 * Fetches and parses content from reference websites with rate limiting and caching.
 */

import type { ReferenceWebsite } from '../types';
import { DEFAULT_REFERENCE_WEBSITES } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface WebFetcherConfig {
  /** Reference websites to use */
  websites?: ReferenceWebsite[];
  /** Rate limit: requests per second per domain (default: 1) */
  rateLimitPerDomain?: number;
  /** Cache TTL in milliseconds (default: 1 hour) */
  cacheTtlMs?: number;
  /** Request timeout in milliseconds (default: 30 seconds) */
  timeoutMs?: number;
}

export interface FetchResult {
  url: string;
  title: string;
  content: string;
  fetchedAt: number;
  cached: boolean;
}

interface CacheEntry {
  result: FetchResult;
  expiresAt: number;
}

// ============================================================================
// Web Fetcher Implementation
// ============================================================================

/**
 * Create a web fetcher instance
 */
export function createWebFetcher(config: WebFetcherConfig = {}) {
  const {
    websites = DEFAULT_REFERENCE_WEBSITES,
    rateLimitPerDomain = 1,
    cacheTtlMs = 60 * 60 * 1000, // 1 hour
    timeoutMs = 30 * 1000, // 30 seconds
  } = config;

  // Cache for fetched content
  const cache = new Map<string, CacheEntry>();
  
  // Track last request time per domain for rate limiting
  const lastRequestTime = new Map<string, number>();

  /**
   * Get domain from URL
   */
  const getDomain = (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  /**
   * Wait for rate limit
   */
  const waitForRateLimit = async (domain: string): Promise<void> => {
    const lastTime = lastRequestTime.get(domain) || 0;
    const minInterval = 1000 / rateLimitPerDomain;
    const elapsed = Date.now() - lastTime;
    
    if (elapsed < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - elapsed));
    }
    
    lastRequestTime.set(domain, Date.now());
  };

  /**
   * Check cache for URL
   */
  const checkCache = (url: string): FetchResult | null => {
    const entry = cache.get(url);
    
    if (entry && entry.expiresAt > Date.now()) {
      return { ...entry.result, cached: true };
    }
    
    // Remove expired entry
    if (entry) {
      cache.delete(url);
    }
    
    return null;
  };

  /**
   * Add result to cache
   */
  const addToCache = (url: string, result: FetchResult): void => {
    cache.set(url, {
      result,
      expiresAt: Date.now() + cacheTtlMs,
    });
  };

  /**
   * Extract text content from HTML
   * Simple extraction - in production would use proper HTML parser
   */
  const extractTextFromHtml = (html: string): string => {
    // Remove script and style tags
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Limit content length
    if (text.length > 10000) {
      text = text.substring(0, 10000) + '...';
    }
    
    return text;
  };

  /**
   * Extract title from HTML
   */
  const extractTitle = (html: string): string => {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : 'Untitled';
  };

  return {
    /**
     * Fetch content from a URL
     */
    async fetch(url: string): Promise<FetchResult> {
      // Check cache first
      const cached = checkCache(url);
      if (cached) {
        return cached;
      }

      const domain = getDomain(url);
      
      // Wait for rate limit
      await waitForRateLimit(domain);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Wave-Client/1.0 (AI Assistant)',
            'Accept': 'text/html,application/xhtml+xml,text/plain,*/*',
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        const content = extractTextFromHtml(html);
        const title = extractTitle(html);

        const result: FetchResult = {
          url,
          title,
          content,
          fetchedAt: Date.now(),
          cached: false,
        };

        // Cache the result
        addToCache(url, result);

        return result;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Request timeout for ${url}`);
        }
        throw error;
      }
    },

    /**
     * Search reference websites for a query
     * Returns relevant content from enabled websites
     */
    async search(_query: string, categories?: string[]): Promise<FetchResult[]> {
      const results: FetchResult[] = [];
      const enabledSites = websites.filter(w => w.enabled);
      
      // Filter by categories if provided
      const sitesToSearch = categories?.length
        ? enabledSites.filter(w => w.categories.some(c => categories.includes(c)))
        : enabledSites;

      // For MVP, we'll just fetch the main pages
      // In production, we'd implement proper search APIs for each source
      for (const site of sitesToSearch) {
        try {
          const result = await this.fetch(site.url);
          results.push(result);
        } catch (error) {
          console.warn(`Failed to fetch ${site.url}:`, error);
        }
      }

      return results;
    },

    /**
     * Fetch RFC document by number
     */
    async fetchRfc(rfcNumber: string | number): Promise<FetchResult> {
      const num = typeof rfcNumber === 'string' 
        ? rfcNumber.replace(/^rfc\s*/i, '') 
        : rfcNumber;
      
      const url = `https://www.rfc-editor.org/rfc/rfc${num}.txt`;
      return this.fetch(url);
    },

    /**
     * Get configured websites
     */
    getWebsites(): ReferenceWebsite[] {
      return websites;
    },

    /**
     * Clear cache
     */
    clearCache(): void {
      cache.clear();
    },

    /**
     * Get cache stats
     */
    getCacheStats(): { size: number; oldestEntry: number | null } {
      let oldestEntry: number | null = null;
      
      for (const entry of cache.values()) {
        if (oldestEntry === null || entry.result.fetchedAt < oldestEntry) {
          oldestEntry = entry.result.fetchedAt;
        }
      }
      
      return {
        size: cache.size,
        oldestEntry,
      };
    },
  };
}
