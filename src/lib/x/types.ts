export interface XPost {
  id: string;
  text: string;
  authorName: string;
  authorHandle: string;
  authorProfileImageUrl?: string;
  isVerified?: boolean;
  likesCount: number;
  repostsCount: number;
  repliesCount?: number;
  viewsCount?: number;
  mediaUrls?: string[];
  originalUrl: string;
  publishedAt: string; // ISO DateTime string
  language?: string;
}

export type XProviderType = "official" | "apify" | "agent" | "oembed" | "mock";

export interface IXProvider {
  readonly name: XProviderType;
  fetchPost(tweetId: string, fetcher?: typeof fetch): Promise<XPost | null>;
}

// ── X Search Types ──────────────────────────────────────────────────

export type XSearchProviderType = "grok_search" | "mock_search";

export interface XSearchResult {
  tweetUrl: string;
  tweetId: string;
  authorHandle: string;
  text: string;
  publishedAt?: string;
}

export interface XSearchOptions {
  fromDate?: string;   // ISO date string
  toDate?: string;     // ISO date string
  languages?: string[]; // e.g. ["ar", "en"]
  maxResults?: number;
}

export interface IXSearchProvider {
  readonly name: XSearchProviderType;
  search(query: string, options?: XSearchOptions): Promise<XSearchResult[]>;
  healthCheck(): Promise<{ status: "healthy" | "degraded" | "error"; message?: string }>;
}

export interface XSearchRunResult {
  provider: XSearchProviderType;
  query: string;
  discoveredUrls: string[];
  newItems: number;
  duplicateSkipped: number;
  irrelevantSkipped: number;
  searchedAt: string;
  durationMs: number;
}
