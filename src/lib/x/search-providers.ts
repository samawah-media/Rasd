import type { IXSearchProvider, XSearchOptions, XSearchResult, XSearchProviderType } from "./types";
import { parseXUrl } from "./parser";

// ── Build the search query from keyword rules ───────────────────────

export function buildSearchQuery(
  requiredTerms: string[],
  optionalTerms: string[],
  languages: string[] = ["ar", "en"],
): string {
  const required = requiredTerms.slice(0, 5).map((t) => `"${t}"`).join(" أو ");
  const optional = optionalTerms.slice(0, 5).map((t) => `"${t}"`).join("، ");
  const langLabel = languages.includes("ar") && languages.includes("en")
    ? "العربية والإنجليزية"
    : languages.includes("ar") ? "العربية" : "الإنجليزية";

  return `ابحث في منصة X عن كل التغريدات والمنشورات التي تذكر أياً من هذه العبارات: ${required}.\n` +
    `أيضاً ابحث عن تغريدات تذكر: ${optional}.\n` +
    `ركز على المحتوى باللغة ${langLabel}.\n` +
    `أريد قائمة بكل تغريدة وجدتها. لكل تغريدة أعطني: رابط التغريدة الكامل، اسم حساب الكاتب (handle)، نص التغريدة المختصر، وتاريخ النشر.`;
}

// ── Grok X Search Provider ──────────────────────────────────────────

/**
 * Uses xAI Grok API with real-time X access to search for tweets
 * matching Hidayathon keywords. Extracts tweet URLs from the response.
 */
export class GrokXSearchProvider implements IXSearchProvider {
  readonly name: XSearchProviderType = "grok_search";
  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async healthCheck(): Promise<{ status: "healthy" | "degraded" | "error"; message?: string }> {
    if (!this.apiKey) {
      return { status: "error", message: "xai_api_key_missing" };
    }

    try {
      const response = await fetch("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (response.ok) {
        return { status: "healthy" };
      }

      const text = await response.text();
      if (response.status === 403) {
        return { status: "degraded", message: `xai_no_credits: ${text.slice(0, 120)}` };
      }
      return { status: "error", message: `xai_api_error_${response.status}` };
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : "xai_connection_error" };
    }
  }

  async search(
    query: string,
    options?: XSearchOptions,
    fetcher: typeof fetch = fetch,
  ): Promise<XSearchResult[]> {
    if (!this.apiKey) {
      throw new Error("xai_api_key_missing");
    }

    const dateContext = options?.fromDate
      ? `\nابحث عن تغريدات منشورة بعد ${options.fromDate}.`
      : "\nابحث عن تغريدات آخر 7 أيام.";

    const systemPrompt =
      "أنت وكيل متخصص لديك وصول مباشر لمنصة X (تويتر) في الوقت الفعلي. " +
      "مهمتك البحث عن تغريدات حسب الكلمات المفتاحية المطلوبة وإرجاع النتائج بتنسيق JSON. " +
      "أرجع فقط مصفوفة JSON تحتوي كائنات بهذا الشكل:\n" +
      '{"tweets": [{"url": "https://x.com/user/status/123", "handle": "@user", "text": "نص مختصر", "date": "2026-05-20"}]}\n' +
      "إذا لم تجد أي نتائج، أرجع {\"tweets\": []}.\n" +
      "تأكد أن كل رابط هو رابط تغريدة حقيقي يبدأ بـ https://x.com/ أو https://twitter.com/.\n" +
      "لا تختلق روابط أو بيانات غير موجودة فعلاً.";

    try {
      const response = await fetcher("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-3-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query + dateContext },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GrokXSearch] API error: ${response.status} - ${errorText.slice(0, 200)}`);
        return [];
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return [];

      const parsed = JSON.parse(content) as {
        tweets?: Array<{ url?: string; handle?: string; text?: string; date?: string }>;
      };

      if (!parsed.tweets || !Array.isArray(parsed.tweets)) return [];

      const maxResults = options?.maxResults ?? 50;
      const results: XSearchResult[] = [];

      for (const tweet of parsed.tweets) {
        if (!tweet.url || results.length >= maxResults) continue;

        const parsedUrl = parseXUrl(tweet.url);
        if (!parsedUrl) continue; // Skip non-X URLs

        results.push({
          tweetUrl: tweet.url,
          tweetId: parsedUrl.tweetId,
          authorHandle: tweet.handle || parsedUrl.handle,
          text: tweet.text || "",
          publishedAt: tweet.date,
        });
      }

      console.log(`[GrokXSearch] Found ${results.length} valid tweet URLs`);
      return results;
    } catch (err) {
      console.error("[GrokXSearch] Search error:", err);
      return [];
    }
  }
}

// ── Mock Search Provider ────────────────────────────────────────────

/**
 * Returns deterministic fake search results for local testing.
 */
export class MockSearchProvider implements IXSearchProvider {
  readonly name: XSearchProviderType = "mock_search";

  async healthCheck(): Promise<{ status: "healthy" | "degraded" | "error"; message?: string }> {
    return { status: "healthy", message: "mock_provider_always_healthy" };
  }

  async search(_query: string, _options?: XSearchOptions): Promise<XSearchResult[]> {  // eslint-disable-line @typescript-eslint/no-unused-vars
    return [
      {
        tweetUrl: "https://x.com/Hidayathon/status/100001",
        tweetId: "100001",
        authorHandle: "@Hidayathon",
        text: "يسعدنا الإعلان عن انطلاق هاكثون الهداية #هدايةثون",
        publishedAt: new Date().toISOString(),
      },
      {
        tweetUrl: "https://x.com/univ_jeddah/status/100002",
        tweetId: "100002",
        authorHandle: "@univ_jeddah",
        text: "جامعة جدة تشارك في هاكثون الهداية لرقمنة الخدمات الدينية",
        publishedAt: new Date().toISOString(),
      },
      {
        tweetUrl: "https://x.com/tech_enthusiast/status/100003",
        tweetId: "100003",
        authorHandle: "@tech_enthusiast",
        text: "Excited about Hidayathon! Great initiative for digitizing religious services",
        publishedAt: new Date().toISOString(),
      },
    ];
  }
}
