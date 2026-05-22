import type { Connector, IngestedItem } from "../../connectors";
import type { ConnectorHealth, SourceRule } from "../../types";
import { shouldUseConnectorMocks } from "../mock-mode";

export class TikTokResearchConnector implements Connector {
  async testConnection(): Promise<ConnectorHealth> {
    const enabled = process.env.TIKTOK_RESEARCH_ENABLED === "true" || !!process.env.TIKTOK_CLIENT_KEY;
    if (!enabled) {
      return {
        connector: "tiktok_research",
        status: "not_configured",
        message: "TikTok Research API is not enabled or credentials are missing.",
      };
    }
    return {
      connector: "tiktok_research",
      status: "healthy",
      message: "TikTok Research API is configured.",
    };
  }

  async fetch(rule: SourceRule, cursor?: Record<string, unknown> | null): Promise<IngestedItem[]> {
    const enabled = process.env.TIKTOK_RESEARCH_ENABLED === "true" || !!process.env.TIKTOK_CLIENT_KEY;
    if (!enabled) {
      return shouldUseConnectorMocks() ? this.getMockItems(rule) : [];
    }

    try {
      const token = await this.getAccessToken();
      const response = await fetch("https://open-api.tiktok.com/research/video/query/", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: {
            and: [
              { field_name: "video_description", operation: "IN", field_values: [rule.query ?? "هداية"] }
            ]
          },
          cursor: cursor?.search_id ?? 0,
          start_date: "2026-01-01",
          end_date: "2026-05-22",
        }),
      });
      if (!response.ok) {
        throw new Error(`TikTok API error: ${response.statusText}`);
      }
      const data = await response.json();
      type TikTokVideoItem = { id: string; username: string; video_description?: string; create_time: number };
      return (data.data?.videos ?? []).map((v: TikTokVideoItem) => ({
        sourceItemId: v.id,
        url: `https://www.tiktok.com/@${v.username}/video/${v.id}`,
        title: v.video_description?.slice(0, 100) || "فيديو تيك توك",
        text: v.video_description || "",
        authorName: v.username,
        authorHandle: `@${v.username}`,
        publishedAt: new Date(v.create_time * 1000).toISOString(),
        raw: v,
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (shouldUseConnectorMocks()) {
        console.error("[TikTokResearchConnector] fetch failed, falling back to mock:", message);
        return this.getMockItems(rule);
      }
      throw new Error(`tiktok_fetch_failed:${message}`);
    }
  }

  normalize(raw: IngestedItem) {
    return {
      id: raw.sourceItemId || crypto.randomUUID(),
      sourceId: "tiktok",
      sourceName: raw.authorName || "TikTok User",
      sourceType: "tiktok_research" as const,
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
      dedupeKey: `tiktok_research:${raw.sourceItemId || raw.url}`,
      hasReportGradeCapture: false,
    };
  }

  private async getAccessToken(): Promise<string> {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    const response = await fetch("https://open-api.tiktok.com/oauth/token/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey || "",
        client_secret: clientSecret || "",
        grant_type: "client_credentials",
      }),
    });
    const data = await response.json();
    return data.access_token;
  }

  private getMockItems(rule: SourceRule): IngestedItem[] {
    const query = rule.query || "هداية";
    return [
      {
        sourceItemId: `tiktok-mock-1-${rule.id}`,
        url: `https://tiktok.com/@user_tiktok_test/video/111111111`,
        title: `تغطية رائعة للهاكاثون هداية - البحث عن ${query}`,
        text: `فيديو رائع يتحدث عن هاكاثون هداية وعن أثره والابتكارات المقدمة فيه. #هداية #${query}`,
        authorName: "user_tiktok_test",
        authorHandle: "@user_tiktok_test",
        publishedAt: new Date().toISOString(),
        raw: { mock: true },
      },
    ];
  }
}
