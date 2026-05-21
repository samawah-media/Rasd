import { IXProvider, XPost, XProviderType } from "./types";
import {
  MockXProvider,
  OEmbedXProvider,
  OfficialXProvider,
  ApifyXProvider,
  AgentXProvider,
} from "./providers";

/**
 * Orchestrator class that manages X/Twitter data providers.
 * Reads environment configurations and instantiates the correct active engine.
 * Implements a cost-safe fallback mechanism when premium engines fail.
 */
export class XProviderManager {
  private readonly activeProvider: IXProvider;
  private readonly fallbackProvider: IXProvider;

  constructor(env: Record<string, string | undefined> = process.env) {
    const providerType = (env.X_PROVIDER_TYPE || "oembed").toLowerCase() as XProviderType;

    const officialKey = env.X_OFFICIAL_API_KEY;
    const apifyToken = env.X_APIFY_API_TOKEN;
    const xaiKey = env.XAI_API_KEY;

    switch (providerType) {
      case "mock":
        this.activeProvider = new MockXProvider();
        break;
      case "official":
        this.activeProvider = new OfficialXProvider(officialKey);
        break;
      case "apify":
        this.activeProvider = new ApifyXProvider(apifyToken);
        break;
      case "agent":
        this.activeProvider = new AgentXProvider(xaiKey);
        break;
      case "oembed":
      default:
        this.activeProvider = new OEmbedXProvider();
        break;
    }

    // Define zero-cost public embed fallback
    this.fallbackProvider = new OEmbedXProvider();
  }

  /**
   * Fetches a tweet using the active provider.
   * If it fails (due to key issues, rate limits, or stub unimplemented errors),
   * it falls back to the public free OEmbed provider (if the active one isn't already oembed or mock).
   */
  async fetchPost(tweetId: string, fetcher?: typeof fetch): Promise<XPost | null> {
    try {
      const post = await this.activeProvider.fetchPost(tweetId, fetcher);
      if (post) return post;
    } catch (error) {
      console.warn(
        `[XProviderManager] Active provider "${this.activeProvider.name}" failed:`,
        error instanceof Error ? error.message : error
      );
    }

    // Cost-safe Fallback check:
    // Avoid redundant call if we are already running on oembed or mock
    if (this.activeProvider.name !== "oembed" && this.activeProvider.name !== "mock") {
      console.log(`[XProviderManager] Falling back to zero-cost OEmbed provider for tweet ID: ${tweetId}`);
      try {
        return await this.fallbackProvider.fetchPost(tweetId, fetcher);
      } catch (fallbackError) {
        console.error("[XProviderManager] Fallback provider failed:", fallbackError);
      }
    }

    return null;
  }

  getActiveProviderName(): XProviderType {
    return this.activeProvider.name;
  }
}
