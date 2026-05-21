import type {
  IXSearchProvider,
  XSearchOptions,
  XSearchResult,
  XSearchRunResult,
  XSearchProviderType,
} from "./types";
import { GrokXSearchProvider, MockSearchProvider, buildSearchQuery } from "./search-providers";
import { canonicalizeXUrl, isValidXUrl } from "./parser";

/**
 * XSearchManager — orchestrates tweet discovery via search providers.
 *
 * Responsibilities:
 * 1. Selects and initializes the active search provider based on env config
 * 2. Builds the search query from keyword rules
 * 3. Deduplicates discovered URLs against known items
 * 4. Tracks run results for audit and admin dashboard display
 */
export class XSearchManager {
  private provider: IXSearchProvider;
  private lastRunResult: XSearchRunResult | null = null;

  constructor(env: Record<string, string | undefined> = {}) {
    const providerType = (env.X_SEARCH_PROVIDER_TYPE ?? "grok_search") as XSearchProviderType;
    const xaiKey = env.XAI_API_KEY;

    switch (providerType) {
      case "grok_search":
        this.provider = new GrokXSearchProvider(xaiKey);
        break;
      case "mock_search":
        this.provider = new MockSearchProvider();
        break;
      default:
        // Default to mock if unrecognized
        console.warn(`[XSearchManager] Unknown provider "${providerType}", falling back to mock_search`);
        this.provider = new MockSearchProvider();
    }
  }

  getActiveProviderName(): XSearchProviderType {
    return this.provider.name;
  }

  getLastRunResult(): XSearchRunResult | null {
    return this.lastRunResult;
  }

  async checkHealth(): Promise<{ status: "healthy" | "degraded" | "error"; message?: string }> {
    return this.provider.healthCheck();
  }

  /**
   * Execute a search cycle:
   * 1. Build query from keyword rules
   * 2. Call the active search provider
   * 3. Deduplicate against existingUrls
   * 4. Return only new, valid, relevant URLs
   */
  async executeSearch(config: {
    requiredTerms: string[];
    optionalTerms: string[];
    languages?: string[];
    existingUrls: Set<string>;
    options?: XSearchOptions;
  }): Promise<{
    results: XSearchResult[];
    runResult: XSearchRunResult;
  }> {
    const startTime = Date.now();
    const query = buildSearchQuery(
      config.requiredTerms,
      config.optionalTerms,
      config.languages ?? ["ar", "en"],
    );

    let rawResults: XSearchResult[];
    try {
      rawResults = await this.provider.search(query, config.options);
    } catch (err) {
      console.error("[XSearchManager] Search provider error:", err);
      rawResults = [];
    }

    // Deduplicate against existing URLs in the system
    let duplicateSkipped = 0;
    let irrelevantSkipped = 0;
    const newResults: XSearchResult[] = [];

    for (const result of rawResults) {
      // Validate URL
      if (!isValidXUrl(result.tweetUrl)) {
        irrelevantSkipped++;
        continue;
      }

      // Canonicalize for dedup
      const canonical = canonicalizeXUrl(result.tweetUrl);
      if (config.existingUrls.has(canonical)) {
        duplicateSkipped++;
        continue;
      }

      newResults.push(result);
    }

    const runResult: XSearchRunResult = {
      provider: this.provider.name,
      query: query.slice(0, 200), // Truncate for logging
      discoveredUrls: newResults.map((r) => r.tweetUrl),
      newItems: newResults.length,
      duplicateSkipped,
      irrelevantSkipped,
      searchedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };

    this.lastRunResult = runResult;

    console.log(
      `[XSearchManager] Search complete: ${newResults.length} new, ${duplicateSkipped} duplicates, ${irrelevantSkipped} irrelevant`,
    );

    return { results: newResults, runResult };
  }
}
