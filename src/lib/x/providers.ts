import { IXProvider, XPost, XProviderType } from "./types";

/**
 * High-fidelity Mock X Provider for local testing and validation.
 * Returns realistic deterministic stub data for any given tweet ID.
 */
export class MockXProvider implements IXProvider {
  readonly name: XProviderType = "mock";

  async fetchPost(tweetId: string): Promise<XPost | null> {
    return {
      id: tweetId,
      text: `هذه تغريدة تجريبية رقم ${tweetId} لرصد التفاعل حول الهاكثون. #رصد_هاكثون_2026`,
      authorName: "حساب تجريبي رصد",
      authorHandle: "@mock_rasd_account",
      authorProfileImageUrl: "https://example.com/profiles/mock_rasd.png",
      isVerified: true,
      likesCount: 1420,
      repostsCount: 310,
      repliesCount: 88,
      viewsCount: 22800,
      mediaUrls: ["https://example.com/media/mock-tweet-image.webp"],
      originalUrl: `https://x.com/mock_rasd_account/status/${tweetId}`,
      publishedAt: new Date().toISOString(),
      language: "ar",
    };
  }
}

/**
 * Public OEmbed X Provider.
 * Free, requires zero API keys, fetches basic public data from publish.twitter.com.
 * Used as a highly cost-effective fallback for basic text/author extraction.
 */
export class OEmbedXProvider implements IXProvider {
  readonly name: XProviderType = "oembed";

  async fetchPost(tweetId: string, fetcher: typeof fetch = fetch): Promise<XPost | null> {
    try {
      const canonicalUrl = `https://x.com/i/status/${tweetId}`;
      const endpoint = `https://publish.twitter.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(canonicalUrl)}`;

      const response = await fetcher(endpoint, {
        headers: { accept: "application/json" },
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        author_name?: string;
        author_url?: string;
        html?: string;
      };

      const html = data.html ?? "";
      const tweetText = this.textFromFirstParagraph(html);
      const authorHandle = this.handleFromXAuthorUrl(data.author_url) ?? this.handleFromText(html) ?? "@x_user";
      const authorName = data.author_name?.trim() || "كاتب التغريدة";
      const publishedAt = this.publishedAtFromXEmbed(html) || new Date().toISOString();

      return {
        id: tweetId,
        text: tweetText || authorName,
        authorName,
        authorHandle,
        originalUrl: `https://x.com/${authorHandle.replace(/^@/u, "")}/status/${tweetId}`,
        publishedAt,
        likesCount: 0, // OEmbed does not provide dynamic metrics
        repostsCount: 0,
        repliesCount: 0,
        viewsCount: 0,
        isVerified: false,
        mediaUrls: [],
        language: "ar", // Defaulting to Arabic for oembed parser fallback
      };
    } catch {
      return null;
    }
  }

  private textFromFirstParagraph(html: string): string {
    const match = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/iu);
    if (!match) return "";
    return this.htmlToText(match[1]);
  }

  private htmlToText(value: string): string {
    return this.decodeHtml(value.replace(/<br\s*\/?>/giu, "\n").replace(/<[^>]+>/gu, " "))
      .replace(/\s+/gu, " ")
      .trim();
  }

  private decodeHtml(value: string): string {
    const named: Record<string, string> = {
      amp: "&",
      quot: '"',
      apos: "'",
      lt: "<",
      gt: ">",
      nbsp: " ",
    };

    return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/giu, (_, entity: string) => {
      const key = entity.toLowerCase();
      if (key.startsWith("#x")) return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
      if (key.startsWith("#")) return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
      return named[key] ?? `&${entity};`;
    });
  }

  private handleFromXAuthorUrl(value: string | undefined): string | undefined {
    if (!value) return undefined;
    try {
      const firstSegment = new URL(value).pathname.split("/").filter(Boolean)[0];
      return firstSegment ? `@${firstSegment}` : undefined;
    } catch {
      return undefined;
    }
  }

  private handleFromText(value: string): string | undefined {
    const match = value.match(/@[\p{L}\p{N}_]+/u);
    return match?.[0];
  }

  private publishedAtFromXEmbed(value: string): string | undefined {
    const anchorText = [...value.matchAll(/<a\b[^>]*>([^<]+)<\/a>/giu)].at(-1)?.[1];
    return this.isoDate(anchorText ? this.decodeHtml(anchorText) : null);
  }

  private isoDate(value: string | null | undefined): string | undefined {
    if (!value) return undefined;
    const englishDate = value.trim().match(/^([a-z]+)\s+(\d{1,2}),\s+(\d{4})$/iu);
    if (englishDate) {
      const month = this.englishMonthNumber(englishDate[1]);
      if (month !== null) {
        return new Date(Date.UTC(Number(englishDate[3]), month, Number(englishDate[2]))).toISOString();
      }
    }

    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
  }

  private englishMonthNumber(value: string): number | null {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const index = months.indexOf(value.slice(0, 3).toLowerCase());
    return index >= 0 ? index : null;
  }
}

/**
 * Official X API Provider Stub.
 * Gatekept placeholder to be fully implemented when keys are active.
 */
export class OfficialXProvider implements IXProvider {
  readonly name: XProviderType = "official";
  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async fetchPost(tweetId: string): Promise<XPost | null> {
    if (!this.apiKey) {
      throw new Error("official_x_api_key_missing");
    }
    // Stub error representation for the foundation phase
    throw new Error(`official_provider_not_implemented_stub: ${tweetId}`);
  }
}

/**
 * Apify X Scraper Provider Stub.
 * Highly cost-effective alternative stub ready for scaling.
 */
export class ApifyXProvider implements IXProvider {
  readonly name: XProviderType = "apify";
  private readonly apiToken: string | undefined;

  constructor(apiToken?: string) {
    this.apiToken = apiToken;
  }

  async fetchPost(tweetId: string): Promise<XPost | null> {
    if (!this.apiToken) {
      throw new Error("apify_api_token_missing");
    }
    // Stub error representation for the foundation phase
    throw new Error(`apify_provider_not_implemented_stub: ${tweetId}`);
  }
}

/**
 * LLM / Agent Scraper Provider.
 * Premium real-time fallback using xAI API (Grok).
 */
export class AgentXProvider implements IXProvider {
  readonly name: XProviderType = "agent";
  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async fetchPost(tweetId: string, fetcher: typeof fetch = fetch): Promise<XPost | null> {
    if (!this.apiKey) {
      throw new Error("xai_api_key_missing");
    }

    try {
      const response = await fetcher("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-2-1212",
          messages: [
            {
              role: "system",
              content: "You are a specialized agent with real-time access to X (Twitter). Your task is to fetch the current details of a specific tweet by its ID. Search X for the tweet ID and extract its exact metadata. Return the response strictly as a JSON object matching this TypeScript interface:\n\ninterface XPost {\n  id: string;\n  text: string;\n  authorName: string;\n  authorHandle: string;\n  authorProfileImageUrl?: string;\n  isVerified?: boolean;\n  likesCount: number;\n  repostsCount: number;\n  repliesCount?: number;\n  viewsCount?: number;\n  mediaUrls?: string[];\n  originalUrl: string;\n  publishedAt: string; // ISO DateTime string\n  language?: string;\n}",
            },
            {
              role: "user",
              content: `Fetch the metadata for tweet ID: ${tweetId}`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AgentXProvider] Failed to fetch from xAI: ${response.status} ${response.statusText} - ${errorText}`);
        return null;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;

      const parsed = JSON.parse(content) as XPost;
      return parsed;
    } catch (error) {
      console.error("[AgentXProvider] Error calling xAI completions:", error);
      return null;
    }
  }
}
