import type { Connector, Cursor, IngestedItem } from "../../connectors";
import type { ConnectorHealth, SourceRule } from "../../types";
import { shouldUseConnectorMocks } from "../mock-mode";
import { fetchInstagramWatchlistWithApify, hasApifyToken } from "../apify-social";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class InstagramPublicProfileConnector implements Connector {
  async testConnection(): Promise<ConnectorHealth> {
    if (hasApifyToken()) {
      return {
        connector: "instagram_public_profile",
        status: "healthy",
        message: "Instagram Public Profile monitoring is configured through Apify.",
      };
    }

    const enabled = process.env.INSTAGRAM_WATCHLIST_ENABLED === "true";
    if (!enabled) {
      return {
        connector: "instagram_public_profile",
        status: "not_configured",
        message: "Instagram Public Profile monitoring is not enabled.",
      };
    }

    try {
      await execAsync("yt-dlp --version");
      return {
        connector: "instagram_public_profile",
        status: "healthy",
        message: "Instagram Public Profile connector is healthy (yt-dlp detected).",
      };
    } catch {
      return {
        connector: "instagram_public_profile",
        status: "degraded",
        message: "Instagram Public Profile connector is degraded (yt-dlp not found).",
      };
    }
  }

  async fetch(rule: SourceRule, _cursor?: Cursor | null): Promise<IngestedItem[]> {
    void _cursor;
    const apifyItems = await fetchInstagramWatchlistWithApify(rule);
    if (apifyItems.length > 0) return apifyItems;

    const enabled = process.env.INSTAGRAM_WATCHLIST_ENABLED === "true";
    if (!enabled) {
      return shouldUseConnectorMocks() ? this.getMockItems(rule) : [];
    }

    const profileUrl = rule.url;
    if (!profileUrl) {
      return [];
    }

    try {
      const { stdout } = await execAsync(`yt-dlp --dump-json --playlist-items 5 --flat-playlist "${profileUrl}"`, { timeout: 30000 });
      const lines = stdout.trim().split("\n").filter(Boolean);
      const items: IngestedItem[] = [];

      for (const line of lines) {
        try {
          const post = JSON.parse(line);
          const publishedAt = post.upload_date
            ? new Date(`${post.upload_date.slice(0,4)}-${post.upload_date.slice(4,6)}-${post.upload_date.slice(6,8)}`).toISOString()
            : new Date().toISOString();

          items.push({
            sourceItemId: post.id,
            url: post.webpage_url || `https://instagram.com/p/${post.id}`,
            title: post.title || post.description?.slice(0, 100) || "منشور انستغرام",
            text: post.description || "",
            authorName: post.uploader || rule.query || "instagram_user",
            authorHandle: post.uploader_id ? `@${post.uploader_id}` : undefined,
            publishedAt,
            raw: post,
          });
        } catch {
          // ignore
        }
      }

      return items;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (shouldUseConnectorMocks()) {
        console.error("[InstagramPublicProfileConnector] yt-dlp fetch failed, falling back to mock:", message);
        return this.getMockItems(rule);
      }
      throw new Error(`instagram_fetch_failed:${message}`);
    }
  }

  normalize(raw: IngestedItem) {
    return {
      id: raw.sourceItemId || crypto.randomUUID(),
      sourceId: "instagram",
      sourceName: raw.authorName || "Instagram User",
      sourceType: "instagram_public_profile" as const,
      state: "needs_review" as const,
      title: raw.title,
      originalUrl: raw.url,
      authorName: raw.authorName,
      authorHandle: raw.authorHandle,
      publishedAt: raw.publishedAt,
      summary: raw.text,
      summarySourceText: raw.text,
      sentiment: "neutral" as const,
      sentimentConfidence: 1,
      relevanceScore: 100,
      relevanceReason: "تم الرصد تلقائياً",
      matchedTerms: [],
      dedupeKey: `instagram_public_profile:${raw.sourceItemId || raw.url}`,
      hasReportGradeCapture: false,
    };
  }

  private getMockItems(rule: SourceRule): IngestedItem[] {
    const handle = rule.query || "test_instagram_profile";
    return [
      {
        sourceItemId: `instagram-mock-1-${rule.id}`,
        url: `https://instagram.com/p/ABCDE12345_${rule.id}`,
        title: `منشور رائع عن هاكاثون هداية من حساب ${handle}`,
        text: `لقد سعدنا كثيراً بالمشاركة في هاكاثون هداية وعرض منصتنا المبتكرة. تجربة رائعة وتنافس مميز! #هداية #هاكاثون_هداية @${handle}`,
        authorName: handle,
        authorHandle: `@${handle}`,
        publishedAt: new Date().toISOString(),
        raw: { mock: true },
      },
    ];
  }
}
