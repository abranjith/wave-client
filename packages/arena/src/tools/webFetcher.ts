/**
 * Web Fetcher
 * 
 * Fetches and parses content from reference websites with rate limiting and caching.
 * Uses cheerio for robust HTML parsing.
 */

import * as cheerio from 'cheerio';
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
   * Extract meaningful text content from HTML using cheerio.
   * Strips navigation, scripts, styles, and other non-content elements.
   */
  const extractTextFromHtml = (html: string): string => {
    const $ = cheerio.load(html);

    // Remove non-content elements
    $('script, style, nav, footer, header, aside, iframe, noscript, svg').remove();
    // Remove hidden elements
    $('[aria-hidden="true"], [hidden], [style*="display:none"], [style*="display: none"]').remove();

    // Prefer main/article content if available
    let $content = $('main, article, [role="main"]');
    if ($content.length === 0) {
      $content = $('body');
    }

    let text = $content.text();
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Limit content length
    const MAX_CONTENT_LENGTH = 15_000;
    if (text.length > MAX_CONTENT_LENGTH) {
      text = text.substring(0, MAX_CONTENT_LENGTH) + '...';
    }
    
    return text;
  };

  /**
   * Extract page title from HTML using cheerio.
   */
  const extractTitle = (html: string): string => {
    const $ = cheerio.load(html);
    const title = $('title').first().text().trim();
    return title || 'Untitled';
  };

  /**
   * Build query-aware search URLs for a reference website.
   * Maps known site IDs to their search endpoints; falls back to homepage for unknown sites.
   */
  const buildSearchUrls = (site: ReferenceWebsite, query: string): string[] => {
    const q = encodeURIComponent(query);
    switch (site.id) {
      case 'mdn':
        return [`https://developer.mozilla.org/en-US/search?q=${q}`];
      case 'ietf':
        return [`https://datatracker.ietf.org/doc/search/?name=${q}&activeDrafts=on&rfcs=on`];
      case 'rfc-editor':
        return [`https://www.rfc-editor.org/search/rfc_search_detail.php?title=${q}`];
      case 'httpwg':
        return [`https://httpwg.org/specs/`];
      case 'w3c':
        return [`https://www.w3.org/search/?q=${q}`];
      default:
        // Unknown site — just fetch the homepage
        return [site.url];
    }
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
     * Search reference websites for a query.
     * Builds query-aware URLs for known sites and fetches relevant pages.
     */
    async search(query: string, categories?: string[]): Promise<FetchResult[]> {
      const results: FetchResult[] = [];
      const enabledSites = websites.filter(w => w.enabled);
      
      // Filter by categories if provided
      const sitesToSearch = categories?.length
        ? enabledSites.filter(w => w.categories.some(c => categories.includes(c)))
        : enabledSites;

      // Build query-aware URLs for known reference sites
      const targets = sitesToSearch.flatMap(site => buildSearchUrls(site, query));

      // Fetch in parallel (limited to 3 concurrent to be polite)
      const CONCURRENCY = 3;
      for (let i = 0; i < targets.length; i += CONCURRENCY) {
        const batch = targets.slice(i, i + CONCURRENCY);
        const settled = await Promise.allSettled(
          batch.map(url => this.fetch(url)),
        );
        for (const r of settled) {
          if (r.status === 'fulfilled') {
            results.push(r.value);
          }
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
