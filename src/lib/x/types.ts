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
