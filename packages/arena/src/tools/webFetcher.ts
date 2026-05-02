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
     * Fetch RFC document by number.
     * @param rfcNumber - RFC number as string or integer
     * @param section   - Optional section identifier appended as an anchor to the HTML URL
     *                    (e.g. '15.5.30' produces …/rfc9110#section-15.5.30).
     *                    Only used when provided; plain .txt URL is used otherwise.
     */
    async fetchRfc(rfcNumber: string | number, section?: string): Promise<FetchResult> {
      const num = typeof rfcNumber === 'string' 
        ? rfcNumber.replace(/^rfc\s*/i, '') 
        : rfcNumber;

      const url = section
        ? `https://www.rfc-editor.org/rfc/rfc${num}#section-${section}`
        : `https://www.rfc-editor.org/rfc/rfc${num}.txt`;
      return this.fetch(url);
    },

    /**
     * Fetch the Hacker News front page and extract the top story titles and
     * URLs into a markdown summary.
     * Reuses the shared rate-limiting and caching infrastructure.
     */
    async fetchTrending(): Promise<FetchResult> {
      const url = 'https://news.ycombinator.com/';

      const cached = checkCache(url);
      if (cached) return cached;

      const domain = getDomain(url);
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
        const $ = cheerio.load(html);

        const stories: Array<{ title: string; href: string }> = [];
        $('.titleline > a').each((_i, el) => {
          const title = $(el).text().trim();
          const href = $(el).attr('href') ?? '';
          if (title && stories.length < 30) {
            const storyUrl = href.startsWith('http') ? href : `https://news.ycombinator.com/${href}`;
            stories.push({ title, href: storyUrl });
          }
        });

        const content = stories.length > 0
          ? `## Trending on Hacker News\n\n${stories.map((s, i) => `${i + 1}. [${s.title}](${s.href})`).join('\n')}`
          : '## Trending on Hacker News\n\nNo stories found.';

        const result: FetchResult = {
          url,
          title: 'Hacker News — Top Stories',
          content,
          fetchedAt: Date.now(),
          cached: false,
        };

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
     * Fetch a URL provided by the user.
     *
     * **Allowlist policy (option B):** Only URLs whose origin matches a configured
     * reference website are fetched automatically. Unknown origins are returned with
     * empty content and a `console.warn` — the caller surfaces the policy message to
     * the model. This prevents SSRF via user-controlled URLs while keeping the
     * existing rate-limit and allowlist contract intact.
     *
     * RFC Editor URLs (rfc-editor.org/rfc/rfcNNNN) are normalised to the canonical
     * `.txt` form via `fetchRfc` so that dedup with explicit RFC detection works
     * correctly (both paths produce the same URL in `sources`).
     *
     * @param url - The URL to fetch (must be a valid http/https URL).
     */
    async fetchUrl(url: string): Promise<FetchResult> {
      // Normalise RFC Editor URLs to canonical .txt form for source dedup.
      const rfcMatch = url.match(/rfc-editor\.org\/rfc\/rfc(\d+)/i);
      if (rfcMatch) {
        return this.fetchRfc(rfcMatch[1]);
      }

      let origin: string;
      try {
        origin = new URL(url).origin;
      } catch {
        console.warn('[WebFetcher/fetchUrl] Invalid URL — not fetched:', { url });
        return { url, title: '<invalid URL>', content: '', fetchedAt: Date.now(), cached: false };
      }

      // Check if origin is in the configured reference-website allowlist.
      const isAllowed = websites.some(site => {
        try {
          return new URL(site.url).origin === origin;
        } catch {
          return false;
        }
      });

      if (isAllowed) {
        return this.fetch(url);
      }

      console.warn('[WebFetcher/fetchUrl] URL origin not in allowlist — not fetched:', {
        url: url.substring(0, 120),
        origin,
      });
      return {
        url,
        title: '<external URL>',
        content: '',
        fetchedAt: Date.now(),
        cached: false,
      };
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
