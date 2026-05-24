import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { api } from "../src/server/api";
import { store } from "../src/server/store";
import { TikTokResearchConnector } from "../src/lib/connectors/tiktok/research";
import { InstagramPublicProfileConnector } from "../src/lib/connectors/instagram/public-profile";
import { DEFAULT_ORGANIZATION_ID, DEFAULT_TOPIC_ID } from "../src/lib/auth-config";

async function requestJson(path: string, init?: RequestInit) {
  const response = await api.fetch(
    new Request(`http://rasd.test${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    }),
  );

  const json = await response.json();
  return { response, json };
}

async function requestText(path: string, init?: RequestInit) {
  const response = await api.fetch(new Request(`http://rasd.test${path}`, init));
  const text = await response.text();
  return { response, text };
}

function rssFeed(item: { guid: string; link: string; title?: string; description?: string }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>RASD Test Feed</title>
    <item>
      <guid>${item.guid}</guid>
      <title>${item.title ?? "هداية هاكاثون خبر تجريبي"}</title>
      <link>${item.link}</link>
      <description>${item.description ?? "تغطية تجريبية عن هداية وهاكاثون هداية."}</description>
      <dc:creator>فريق الأخبار</dc:creator>
      <pubDate>Wed, 20 May 2026 10:30:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
}

describe("Hono API acceptance workflow", () => {
  beforeEach(() => {
    store.resetForTest();
  });

  it("returns request IDs and runtime persistence status", async () => {
    const { response, json } = await requestJson("/api/admin/persistence");

    assert.equal(response.status, 200);
    assert.equal(typeof json.requestId, "string");
    assert.equal(json.persistence.ok, true);
    assert.match(json.persistence.mode, /^(memory|supabase)$/);
    assert.equal(typeof json.persistence.publicConfigured, "boolean");
    assert.equal(typeof json.persistence.serverConfigured, "boolean");
    assert.equal(typeof json.persistence.message, "string");
  });

  it("reports partial Supabase activation without requiring server write credentials", async () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const previousServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ewunxfttbpqisspqthiz.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      const { response, json } = await requestJson("/api/admin/persistence");

      assert.equal(response.status, 200);
      assert.equal(json.persistence.mode, "memory");
      assert.equal(json.persistence.publicConfigured, true);
      assert.equal(json.persistence.serverConfigured, false);
      assert.equal(json.persistence.projectRef, "ewunxfttbpqisspqthiz");
      assert.equal(json.persistence.missing.serviceRoleKey, true);
    } finally {
      if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;

      if (previousPublishableKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousPublishableKey;

      if (previousServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRoleKey;
    }
  });

  it("does not expose Supabase keys or admin tokens in persistence responses", async () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const previousServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const previousAdminToken = process.env.RASD_ADMIN_IMPORT_TOKEN;

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ewunxfttbpqisspqthiz.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_should_not_echo";
    process.env.RASD_ADMIN_IMPORT_TOKEN = "admin_token_should_not_echo";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      const { response, json } = await requestJson("/api/admin/persistence");
      const serialized = JSON.stringify(json);

      assert.equal(response.status, 200);
      assert.equal(json.persistence.projectRef, "ewunxfttbpqisspqthiz");
      assert.equal(serialized.includes("sb_publishable_should_not_echo"), false);
      assert.equal(serialized.includes("admin_token_should_not_echo"), false);
      assert.equal(serialized.includes("service_role"), false);
    } finally {
      if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;

      if (previousPublishableKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousPublishableKey;

      if (previousServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRoleKey;

      if (previousAdminToken === undefined) delete process.env.RASD_ADMIN_IMPORT_TOKEN;
      else process.env.RASD_ADMIN_IMPORT_TOKEN = previousAdminToken;
    }
  });

  it("rejects invalid manual intake payloads", async () => {
    const { response, json } = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({ title: "Missing URL" }),
    });
    const invalidUrl = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({ url: "not-a-url" }),
    });
    const invalidDate = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/story", published_at: "not-a-date" }),
    });
    const privateUrl = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({ url: "http://127.0.0.1/admin" }),
    });

    assert.equal(response.status, 400);
    assert.equal(json.error, "url is required");
    assert.equal(invalidUrl.response.status, 400);
    assert.equal(invalidUrl.json.error, "url must be a valid http or https URL");
    assert.equal(invalidDate.response.status, 400);
    assert.equal(invalidDate.json.error, "published_at must be a valid date");
    assert.equal(privateUrl.response.status, 400);
    assert.equal(privateUrl.json.error, "url must be a public http or https URL");
  });

  it("uses a temporary keyword to admit a direct news URL without saving the keyword", async () => {
    const result = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({
        url: "https://www.okaz.com.sa/local/na/2250043",
        title: "السعودية و14 دولة: سفارة «أرض الصومال» بالقدس غير قانونية ومرفوضة",
        text: "دان وزراء خارجية المملكة العربية السعودية و14 دولة افتتاح سفارة مزعومة في القدس.",
        author_name: "عكاظ",
        test_term: "سفارة «أرض الصومال»",
      }),
    });
    const keywords = await requestJson("/api/keyword-rules");

    assert.equal(result.response.status, 201);
    assert.equal(result.json.item.state, "needs_review");
    assert.deepEqual(result.json.item.matchedTerms, ["سفارة «أرض الصومال»"]);
    assert.equal(result.json.testTerm, "سفارة «أرض الصومال»");
    assert.equal(result.json.next_step, "review");
    assert.equal(keywords.json.keyword_rules[0].requiredTerms.includes("سفارة «أرض الصومال»"), false);
  });

  it("creates RSS sources with public feed validation", async () => {
    const created = await requestJson("/api/sources", {
      method: "POST",
      body: JSON.stringify({
        name: "Official Hidayathon Feed",
        type: "rss",
        url: "https://rss-validation.example.com/news",
        feed_url: "https://rss-validation.example.com/rss.xml",
        credibility: "official",
        poll_interval_minutes: 60,
      }),
    });
    const privateFeed = await requestJson("/api/sources", {
      method: "POST",
      body: JSON.stringify({
        name: "Private Feed",
        type: "rss",
        feed_url: "http://127.0.0.1/rss.xml",
      }),
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.json.source.type, "rss");
    assert.equal(created.json.source.feedUrl, "https://rss-validation.example.com/rss.xml");
    assert.equal(created.json.source.isActive, true);
    assert.equal(created.json.source.pollIntervalMinutes, 60);
    assert.equal(privateFeed.response.status, 400);
    assert.equal(privateFeed.json.error, "feed_url must be a public http or https URL");
  });

  it("returns the existing RSS source when the same feed is added again", async () => {
    const payload = {
      name: "Duplicate Feed",
      type: "rss",
      url: "https://duplicate.example.com/rss.xml",
      feed_url: "https://duplicate.example.com/rss.xml",
      credibility: "media",
    };

    const first = await requestJson("/api/sources", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const second = await requestJson("/api/sources", {
      method: "POST",
      body: JSON.stringify({ ...payload, name: "Duplicate Feed Again" }),
    });

    assert.equal(first.response.status, 201);
    assert.equal(second.response.status, 200);
    assert.equal(second.json.duplicate, true);
    assert.equal(second.json.source.id, first.json.source.id);
  });

  it("lets admins update source automation schedule from the API", async () => {
    const created = await requestJson("/api/sources", {
      method: "POST",
      body: JSON.stringify({
        name: "Scheduled Feed",
        type: "rss",
        feed_url: "https://schedule.example.com/rss.xml",
        credibility: "media",
      }),
    });
    const updated = await requestJson(`/api/sources/${created.json.source.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        is_active: false,
        poll_interval_minutes: 2880,
      }),
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.json.source.pollIntervalMinutes, 4320);
    assert.equal(updated.response.status, 200);
    assert.equal(updated.json.source.isActive, false);
    assert.equal(updated.json.source.pollIntervalMinutes, 2880);
  });

  it("lets admins update keyword rules used by RSS relevance", async () => {
    const listed = await requestJson("/api/keyword-rules");
    const updated = await requestJson("/api/keyword-rules", {
      method: "POST",
      body: JSON.stringify({
        id: listed.json.keyword_rules[0].id,
        requiredTerms: "هداية ثون\nHidayathon\nجامعة جدة",
        optionalTerms: "رئاسة الشؤون الدينية\nالحرمين",
        excludeTerms: "وظائف\nإعلان ممول",
      }),
    });

    assert.equal(listed.response.status, 200);
    assert.equal(updated.response.status, 201);
    assert.deepEqual(updated.json.keyword_rule.requiredTerms, ["هداية ثون", "Hidayathon", "جامعة جدة"]);
    assert.deepEqual(updated.json.keyword_rule.excludeTerms, ["وظائف", "إعلان ممول"]);
  });

  it("returns legacy source intelligence for the sources page", async () => {
    const result = await requestJson("/api/source-intelligence");

    assert.equal(result.response.status, 200);
    assert.ok(result.json.intelligence.summary.items > 0);
    assert.ok(result.json.intelligence.keywords.requiredTerms.includes("هداية"));
    assert.ok(result.json.intelligence.newsSources.some((source: { url: string }) => source.url === "https://prh.gov.sa"));
    assert.ok(result.json.intelligence.xAccounts.some((source: { url: string }) => source.url === "https://x.com/UOfjeddah"));
  });

  it("applies legacy keywords into the active keyword rule", async () => {
    const result = await requestJson("/api/source-intelligence/apply", {
      method: "POST",
      body: JSON.stringify({ action: "apply_keywords" }),
    });

    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
    assert.ok(result.json.keyword_rule.requiredTerms.includes("هداية"));
    assert.ok(result.json.keyword_rule.optionalTerms.includes("رئاسة الشؤون الدينية"));
  });

  it("applies legacy social watchlists without duplicating reruns", async () => {
    const first = await requestJson("/api/source-intelligence/apply", {
      method: "POST",
      body: JSON.stringify({ action: "apply_social_watchlists", limit: 2 }),
    });
    const second = await requestJson("/api/source-intelligence/apply", {
      method: "POST",
      body: JSON.stringify({ action: "apply_social_watchlists", limit: 2 }),
    });
    const listed = await requestJson("/api/source-rules");

    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 200);
    assert.equal(first.json.created.length, 6);
    assert.equal(second.json.created.length, 0);
    assert.equal(second.json.skipped.length, 6);
    assert.equal(listed.json.source_rules.length, 6);
    assert.ok(listed.json.source_rules.some((rule: { type: string; query: string | null }) => rule.type === "tiktok_research" && rule.query === "هداية"));
    assert.ok(listed.json.source_rules.some((rule: { type: string; url: string | null }) => rule.type === "instagram_public_profile" && rule.url));
  });

  it("saves legacy news and X sources as editable reference sources", async () => {
    const first = await requestJson("/api/source-intelligence/apply", {
      method: "POST",
      body: JSON.stringify({ action: "apply_reference_sources", limit: 2 }),
    });
    const second = await requestJson("/api/source-intelligence/apply", {
      method: "POST",
      body: JSON.stringify({ action: "apply_reference_sources", limit: 2 }),
    });
    const listed = await requestJson("/api/sources");
    const referenceSources = listed.json.sources.filter((source: { type: string }) => source.type !== "rss");

    assert.equal(first.response.status, 200);
    assert.equal(first.json.created.length, 4);
    assert.equal(second.json.created.length, 0);
    assert.equal(second.json.skipped.length, 4);
    assert.ok(referenceSources.length >= 4);
    assert.ok(referenceSources.some((source: { type: string; url: string }) => source.type === "web_page" && source.url === "https://prh.gov.sa"));
    assert.ok(referenceSources.some((source: { type: string; url: string }) => source.type === "x_recent_search" && source.url === "https://x.com/UOfjeddah"));
  });

  it("polls one RSS source into review items and deduplicates reruns", async () => {
    const source = store.createSource({
      name: "Hidayathon RSS API",
      type: "rss",
      feedUrl: "https://news.example.com/rss.xml",
      credibility: "official",
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        rssFeed({
          guid: "api-story-1",
          link: "https://news.example.com/hidayathon/api-story-1?utm_source=rss",
        }),
        { status: 200, headers: { "content-type": "application/rss+xml" } },
      );

    try {
      const first = await requestJson(`/api/sources/${source.id}/poll`, { method: "POST" });
      const second = await requestJson(`/api/sources/${source.id}/poll`, { method: "POST" });

      assert.equal(first.response.status, 200);
      assert.equal(first.json.poll.fetched, 1);
      assert.equal(first.json.poll.created, 1);
      assert.equal(first.json.poll.duplicates, 0);
      assert.equal(first.json.poll.skipped, 0);
      assert.equal(first.json.poll.items[0].sourceType, "rss");
      assert.equal(first.json.poll.items[0].state, "needs_review");
      assert.equal(first.json.poll.items[0].originalUrl, "https://news.example.com/hidayathon/api-story-1");

      assert.equal(second.response.status, 200);
      assert.equal(second.json.poll.created, 0);
      assert.equal(second.json.poll.duplicates, 1);
      assert.equal(second.json.poll.skipped, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("tests RSS matching with a temporary keyword without saving it", async () => {
    const source = store.createSource({
      name: "Temporary Keyword RSS",
      type: "rss",
      feedUrl: "https://news.example.com/temp-keyword.xml",
      credibility: "media",
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        rssFeed({
          guid: "temp-keyword-story-1",
          link: "https://news.example.com/local/temp-keyword-story-1",
          title: "AcmeSolarLaunch announces a city pilot",
          description: "A general technology story used to verify RSS ingestion.",
        }),
        { status: 200, headers: { "content-type": "application/rss+xml" } },
      );

    try {
      const withoutTerm = await requestJson(`/api/sources/${source.id}/poll`, { method: "POST" });
      const withTerm = await requestJson(`/api/sources/${source.id}/poll`, {
        method: "POST",
        body: JSON.stringify({ test_term: "AcmeSolarLaunch" }),
      });
      const keywords = await requestJson("/api/keyword-rules");

      assert.equal(withoutTerm.response.status, 200);
      assert.equal(withoutTerm.json.poll.created, 0);
      assert.equal(withoutTerm.json.poll.skipped, 1);
      assert.equal(withTerm.response.status, 200);
      assert.equal(withTerm.json.poll.created, 1);
      assert.equal(withTerm.json.poll.skipped, 0);
      assert.equal(withTerm.json.poll.testTerm, "AcmeSolarLaunch");
      assert.equal(keywords.json.keyword_rules[0].requiredTerms.includes("AcmeSolarLaunch"), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("searches inside a news site through Apify Google Search and ingests matching results", async () => {
    const previousApifyToken = process.env.APIFY_API_TOKEN;
    process.env.APIFY_API_TOKEN = "apify_test_token";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      assert.match(String(input), /apify~google-search-scraper/);
      assert.equal(init?.method, "POST");
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.queries, 'site:okaz.com.sa "سفارة «أرض الصومال»"');
      return new Response(
        JSON.stringify([
          {
            organicResults: [
              {
                title: "السعودية و14 دولة: سفارة «أرض الصومال» بالقدس غير قانونية ومرفوضة",
                url: "https://www.okaz.com.sa/local/na/2250043",
                description: "دان وزراء خارجية المملكة العربية السعودية و14 دولة افتتاح سفارة مزعومة.",
              },
              {
                title: "نتيجة خارج النطاق",
                url: "https://example.com/not-okaz",
                description: "يجب تجاهل هذه النتيجة.",
              },
            ],
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    try {
      const result = await requestJson("/api/sources/search-news", {
        method: "POST",
        body: JSON.stringify({
          site_url: "https://www.okaz.com.sa/",
          test_term: "سفارة «أرض الصومال»",
        }),
      });
      const keywords = await requestJson("/api/keyword-rules");

      assert.equal(result.response.status, 200);
      assert.equal(result.json.search.provider, "apify_google_search");
      assert.equal(result.json.search.fetched, 1);
      assert.equal(result.json.search.created, 1);
      assert.equal(result.json.search.items[0].state, "needs_review");
      assert.equal(result.json.search.items[0].originalUrl, "https://www.okaz.com.sa/local/na/2250043");
      assert.deepEqual(result.json.search.items[0].matchedTerms, ["سفارة «أرض الصومال»"]);
      assert.equal(keywords.json.keyword_rules[0].requiredTerms.includes("سفارة «أرض الصومال»"), false);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApifyToken === undefined) delete process.env.APIFY_API_TOKEN;
      else process.env.APIFY_API_TOKEN = previousApifyToken;
    }
  });

  it("falls back to a news sitemap when Apify Google Search has not indexed a recent article", async () => {
    const previousApifyToken = process.env.APIFY_API_TOKEN;
    process.env.APIFY_API_TOKEN = "apify_test_token";
    const originalFetch = globalThis.fetch;
    const term = "\u0633\u0641\u0627\u0631\u0629 \u00ab\u0623\u0631\u0636 \u0627\u0644\u0635\u0648\u0645\u0627\u0644\u00bb";
    const title = "\u0627\u0644\u0633\u0639\u0648\u062f\u064a\u0629 \u064814 \u062f\u0648\u0644\u0629: \u0633\u0641\u0627\u0631\u0629 \u00ab\u0623\u0631\u0636 \u0627\u0644\u0635\u0648\u0645\u0627\u0644\u00bb \u0628\u0627\u0644\u0642\u062f\u0633 \u063a\u064a\u0631 \u0642\u0627\u0646\u0648\u0646\u064a\u0629 \u0648\u0645\u0631\u0641\u0648\u0636\u0629";

    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("apify~google-search-scraper")) {
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === "https://www.okaz.com.sa/robots.txt") {
        return new Response("Sitemap: https://www.okaz.com.sa/sitemaps/news_sitemap.xml", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      if (url === "https://www.okaz.com.sa/sitemaps/news_sitemap.xml") {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
          <urlset>
            <url>
              <loc>https://www.okaz.com.sa/local/na/2250043</loc>
              <news:news>
                <news:title>${title}</news:title>
                <news:publication_date>2026-05-24T14:07:00+03:00</news:publication_date>
              </news:news>
            </url>
          </urlset>`,
          { status: 200, headers: { "content-type": "application/xml" } },
        );
      }
      return new Response("", { status: 404 });
    };

    try {
      const result = await requestJson("/api/sources/search-news", {
        method: "POST",
        body: JSON.stringify({
          site_url: "https://www.okaz.com.sa/",
          test_term: term,
        }),
      });

      assert.equal(result.response.status, 200);
      assert.equal(result.json.search.provider, "news_sitemap");
      assert.equal(result.json.search.apifyError, "apify_google_search_empty");
      assert.equal(result.json.search.fetched, 1);
      assert.equal(result.json.search.created, 1);
      assert.equal(result.json.search.results[0].source, "news_sitemap");
      assert.equal(result.json.search.items[0].originalUrl, "https://www.okaz.com.sa/local/na/2250043");
      assert.deepEqual(result.json.search.items[0].matchedTerms, [term]);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApifyToken === undefined) delete process.env.APIFY_API_TOKEN;
      else process.env.APIFY_API_TOKEN = previousApifyToken;
    }
  });

  it("polls active RSS sources with a small batch limit", async () => {
    const active = store.createSource({
      name: "Active RSS",
      type: "rss",
      feedUrl: "https://news.example.com/active.xml",
      credibility: "media",
    });
    store.createSource({
      name: "Inactive RSS",
      type: "rss",
      feedUrl: "https://news.example.com/inactive.xml",
      credibility: "media",
      isActive: false,
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        rssFeed({
          guid: "active-story-1",
          link: "https://news.example.com/hidayathon/active-story-1",
        }),
        { status: 200, headers: { "content-type": "application/rss+xml" } },
      );

    try {
      const result = await requestJson("/api/sources/poll-active", {
        method: "POST",
        body: JSON.stringify({ limit: 1 }),
      });

      assert.equal(result.response.status, 200);
      assert.equal(result.json.poll.sources, 1);
      assert.equal(result.json.poll.created, 1);
      assert.equal(result.json.poll.skipped, 0);
      assert.equal(result.json.poll.runs[0].sourceId, active.id);
      assert.equal(result.json.poll.runs[0].ok, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("runs scheduled RSS polling only for due sources behind CRON_SECRET", async () => {
    const previousSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "cron_test_secret";
    for (const source of store.listSources()) {
      if (source.type === "rss") source.isActive = false;
    }

    const due = store.createSource({
      name: "Due Scheduled RSS",
      type: "rss",
      feedUrl: "https://news.example.com/due.xml",
      credibility: "media",
      pollIntervalMinutes: 2880,
    });
    const notDue = store.createSource({
      name: "Fresh Scheduled RSS",
      type: "rss",
      feedUrl: "https://news.example.com/fresh.xml",
      credibility: "media",
      pollIntervalMinutes: 2880,
    });
    notDue.lastCheckedAt = new Date().toISOString();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        rssFeed({
          guid: "cron-story-1",
          link: "https://news.example.com/hidayathon/cron-story-1",
        }),
        { status: 200, headers: { "content-type": "application/rss+xml" } },
      );

    try {
      const unauthorized = await requestJson("/api/cron/poll-sources");
      const result = await requestJson("/api/cron/poll-sources", {
        headers: { authorization: "Bearer cron_test_secret" },
      });

      assert.equal(unauthorized.response.status, 401);
      assert.equal(result.response.status, 200);
      assert.equal(result.json.poll.due, 1);
      assert.equal(result.json.poll.created, 1);
      assert.equal(result.json.poll.runs[0].sourceId, due.id);
      assert.equal(result.json.poll.runs.some((run: { sourceId: string }) => run.sourceId === notDue.id), false);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previousSecret;
    }
  });

  it("returns controlled JSON errors for invalid RSS source polling", async () => {
    const manual = store.createSource({ name: "Manual", type: "manual_url" });
    const missing = await requestJson("/api/sources/source-does-not-exist/poll", { method: "POST" });
    const notRss = await requestJson(`/api/sources/${manual.id}/poll`, { method: "POST" });

    assert.equal(missing.response.status, 404);
    assert.equal(missing.json.error, "source_not_found");
    assert.equal(notRss.response.status, 400);
    assert.equal(notRss.json.error, "source_not_rss");
  });

  it("hydrates a pasted X URL into a readable manual item", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          author_name: "Hidayathon",
          author_url: "https://twitter.com/Hidayathon",
          html:
            '<blockquote><p lang="ar">تغطية جديدة لهاكاثون هداية من رابط فقط.</p>&mdash; Hidayathon (@Hidayathon) <a href="https://twitter.com/Hidayathon/status/987654321">May 20, 2026</a></blockquote>',
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    try {
      const manual = await requestJson("/api/items/manual-url", {
        method: "POST",
        body: JSON.stringify({ url: "https://x.com/Hidayathon/status/987654321?utm_source=test" }),
      });

      assert.equal(manual.response.status, 201);
      assert.equal(manual.json.metadata.source, "x_oembed");
      assert.equal(manual.json.item.title, "تغطية جديدة لهاكاثون هداية من رابط فقط.");
      assert.equal(manual.json.item.summary, "تغطية جديدة لهاكاثون هداية من رابط فقط.");
      assert.equal(manual.json.item.authorName, "Hidayathon");
      assert.equal(manual.json.item.authorHandle, "@Hidayathon");
      assert.equal(manual.json.item.originalUrl, "https://x.com/Hidayathon/status/987654321");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("refreshes stale duplicate X items with newly available metadata", async () => {
    const stale = store.ingestManualUrl({
      url: "https://x.com/UOfjeddah/status/2013613302509699235?lang=en",
    });
    assert.equal(stale.item.summary.startsWith("تم حفظ الرابط"), true);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          author_name: "جامعة جدة",
          author_url: "https://twitter.com/UOfjeddah",
          html:
            '<blockquote><p lang="ar" dir="rtl">هاكثون هداية | من مكة تنطلق الفكرة وبالعلم يتحقق الأثر.</p>&mdash; جامعة جدة (@UOfjeddah) <a href="https://twitter.com/UOfjeddah/status/2013613302509699235">January 20, 2026</a></blockquote>',
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    try {
      const duplicate = await requestJson("/api/items/manual-url", {
        method: "POST",
        body: JSON.stringify({ url: "https://x.com/UOfjeddah/status/2013613302509699235" }),
      });

      assert.equal(duplicate.response.status, 200);
      assert.equal(duplicate.json.duplicate, true);
      assert.equal(duplicate.json.item.id, stale.item.id);
      assert.equal(duplicate.json.item.title, "هاكثون هداية | من مكة تنطلق الفكرة وبالعلم يتحقق الأثر.");
      assert.equal(duplicate.json.item.summary, "هاكثون هداية | من مكة تنطلق الفكرة وبالعلم يتحقق الأثر.");
      assert.equal(duplicate.json.item.authorName, "جامعة جدة");
      assert.equal(duplicate.json.item.authorHandle, "@UOfjeddah");
      assert.equal(duplicate.json.item.originalUrl, "https://x.com/UOfjeddah/status/2013613302509699235");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("runs the manual intake to report insertion lifecycle", async () => {
    const liveReport = await requestJson("/api/reports/hidayathon-live");
    assert.equal(liveReport.response.status, 200);
    assert.equal(liveReport.json.report.id, "report-5");

    const manual = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({
        url: "https://x.com/Hidayathon/status/123456789?utm_campaign=test#frag",
        title: "متابعة هاكاثون هداية عبر اختبار API",
        text: "مادة عن هداية وهاكاثون هداية لاختبار دورة الرصد.",
        author_name: "فريق اختبار رصد",
        author_handle: "@rasd_test",
        published_at: "2026-05-20T10:30:00.000Z",
      }),
    });

    assert.equal(manual.response.status, 201);
    assert.equal(manual.json.item.state, "needs_review");
    assert.equal(manual.json.evidence.kind, "evidence_lite");
    assert.match(manual.json.evidence.assetUrl, /^\/api\/items\/.+\/evidence-card\.svg$|^https:\/\/api\.microlink\.io\//);
    assert.equal(manual.json.item.authorName, "فريق اختبار رصد");
    assert.equal(manual.json.item.authorHandle, "@rasd_test");
    assert.equal(manual.json.item.publishedAt, "2026-05-20T10:30:00.000Z");

    const duplicate = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({
        url: "https://x.com/Hidayathon/status/123456789",
        title: "متابعة هاكاثون هداية عبر اختبار API",
        text: "مادة عن هداية وهاكاثون هداية لاختبار دورة الرصد.",
      }),
    });

    assert.equal(duplicate.response.status, 200);
    assert.equal(duplicate.json.duplicate, true);
    assert.equal(duplicate.json.item.id, manual.json.item.id);

    const approved = await requestJson(`/api/items/${manual.json.item.id}/review`, {
      method: "POST",
      body: JSON.stringify({ action: "approve", review_notes: "API acceptance" }),
    });

    assert.equal(approved.response.status, 200);
    assert.equal(approved.json.item.state, "approved_pending_capture");

    const blockedInsert = await requestJson(`/api/reports/${liveReport.json.report.id}/items`, {
      method: "POST",
      body: JSON.stringify({ item_id: manual.json.item.id }),
    });

    assert.equal(blockedInsert.response.status, 409);
    assert.equal(blockedInsert.json.error, "item_not_report_ready");

    const captured = await requestJson(`/api/items/${manual.json.item.id}/capture-report-grade`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    assert.equal(captured.response.status, 200);
    assert.equal(captured.json.item.state, "report_ready");
    assert.equal(captured.json.capture.status, "success");
    assert.match(captured.json.capture.assetUrl, /^\/api\/items\/.+\/evidence-card\.svg$|^https:\/\/api\.microlink\.io\//);
    assert.equal(captured.json.capture_source, "rendered_evidence_card");

    if (captured.json.capture.assetUrl.startsWith("/api/")) {
      const evidenceSvg = await requestText(captured.json.capture.assetUrl);
      assert.equal(evidenceSvg.response.status, 200);
      assert.match(evidenceSvg.response.headers.get("content-type") ?? "", /image\/svg\+xml/);
      assert.match(evidenceSvg.text, /متابعة/);
    }

    const inserted = await requestJson(`/api/reports/${liveReport.json.report.id}/items`, {
      method: "POST",
      body: JSON.stringify({ item_id: manual.json.item.id }),
    });

    assert.equal(inserted.response.status, 200);
    assert.equal(inserted.json.ok, true);
    assert.equal(inserted.json.reportItem.itemId, manual.json.item.id);

    const corrected = await requestJson(`/api/items/${manual.json.item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: "عنوان محرر لرصد هاكاثون هداية",
        summary: "ملخص محرر يظهر للعميل بعد تصحيح بيانات المادة من الأدمن.",
        author_name: "ناشر محرر",
        author_handle: "@edited_source",
        published_at: "2026-05-21T07:15:00.000Z",
        original_url: "https://x.com/Hidayathon/status/123456790?utm_source=edit",
      }),
    });

    assert.equal(corrected.response.status, 200);
    assert.deepEqual(
      new Set(corrected.json.changed),
      new Set(["title", "summary", "authorName", "authorHandle", "publishedAt", "originalUrl"]),
    );
    assert.equal(corrected.json.item.title, "عنوان محرر لرصد هاكاثون هداية");
    assert.equal(corrected.json.item.originalUrl, "https://x.com/Hidayathon/status/123456790");

    const clientReport = await requestJson("/api/client-report/hidayathon");
    const manualReportItem = clientReport.json.report.items.find((item: { id: string }) => item.id === manual.json.item.id);

    assert.equal(clientReport.response.status, 200);
    assert.equal(clientReport.json.report.summary.items, 125);
    assert.equal(manualReportItem.title, "عنوان محرر لرصد هاكاثون هداية");
    assert.equal(manualReportItem.summary, "ملخص محرر يظهر للعميل بعد تصحيح بيانات المادة من الأدمن.");
    assert.equal(manualReportItem.authorName, "ناشر محرر");
    assert.equal(manualReportItem.platform, "X");
    assert.equal(manualReportItem.reportLabel, "الرصد الحي");
    assert.equal(manualReportItem.originalUrl, "https://x.com/Hidayathon/status/123456790");
    assert.equal(manualReportItem.linkStatus, "openable");
    assert.equal(manualReportItem.screenshotStatus, "available");
    assert.match(manualReportItem.contentImagePath, /^\/api\/items\/.+\/evidence-card\.svg$|^https:\/\/api\.microlink\.io\//);

    const archived = await requestJson(`/api/items/${manual.json.item.id}/archive`, {
      method: "POST",
      body: JSON.stringify({ reason: "bad test item" }),
    });

    assert.equal(archived.response.status, 200);
    assert.equal(archived.json.item.state, "archived");
    assert.equal(archived.json.removedReportItems, 1);

    const clientReportAfterArchive = await requestJson("/api/client-report/hidayathon");
    const archivedReportItem = clientReportAfterArchive.json.report.items.find((item: { id: string }) => item.id === manual.json.item.id);

    assert.equal(clientReportAfterArchive.response.status, 200);
    assert.equal(clientReportAfterArchive.json.report.summary.items, 124);
    assert.equal(archivedReportItem, undefined);
  });

  it("bulk archives only visible workflow items without touching legacy archive data", async () => {
    store.importLegacyReports();
    const first = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({
        url: "https://example.com/cleanup-one",
        title: "مادة تنظيف أولى عن هداية هاكاثون",
        text: "مادة تجريبية عن هداية هاكاثون لتنظيف قائمة التشغيل الظاهرة.",
      }),
    });
    const second = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({
        url: "https://example.com/cleanup-two",
        title: "مادة تنظيف ثانية عن هداية هاكاثون",
        text: "مادة تجريبية ثانية عن هداية هاكاثون لتنظيف قائمة التشغيل الظاهرة.",
      }),
    });
    const legacyItem = store.listItems().find((item) => item.id.startsWith("legacy-item-"));

    const result = await requestJson("/api/items/archive-workflow", {
      method: "POST",
      body: JSON.stringify({
        ids: [first.json.item.id, second.json.item.id, legacyItem?.id],
      }),
    });
    const listed = await requestJson("/api/items");

    assert.equal(result.response.status, 200);
    assert.equal(result.json.cleanup.requested, 3);
    assert.equal(result.json.cleanup.archived, 2);
    assert.deepEqual(new Set(result.json.cleanup.itemIds), new Set([first.json.item.id, second.json.item.id]));
    assert.equal(listed.json.items.find((item: { id: string; state: string }) => item.id === first.json.item.id)?.state, "archived");
    assert.equal(listed.json.items.find((item: { id: string; state: string }) => item.id === second.json.item.id)?.state, "archived");
    assert.equal(listed.json.items.find((item: { id: string; state: string }) => item.id === legacyItem?.id)?.state, "published");
  });

  it("preserves warning gates for failed captures", async () => {
    const blocked = await requestJson("/api/reports/report-5/items", {
      method: "POST",
      body: JSON.stringify({ item_id: "item-3" }),
    });
    const accepted = await requestJson("/api/reports/report-5/items", {
      method: "POST",
      body: JSON.stringify({ item_id: "item-3", warning_accepted: true }),
    });

    assert.equal(blocked.response.status, 409);
    assert.equal(accepted.response.status, 200);
    assert.equal(accepted.json.reportItem.warningAccepted, true);
  });

  it("validates review actions and missing items", async () => {
    const invalidAction = await requestJson("/api/items/item-2/review", {
      method: "POST",
      body: JSON.stringify({ action: "maybe" }),
    });
    const missingItem = await requestJson("/api/items/nope/review", {
      method: "POST",
      body: JSON.stringify({ action: "approve" }),
    });

    assert.equal(invalidAction.response.status, 400);
    assert.equal(missingItem.response.status, 404);
  });

  it("enforces share link token privacy, view limits, and revocation through the API", async () => {
    const created = await requestJson("/api/reports/report-5/share-link", {
      method: "POST",
      body: JSON.stringify({ max_views: 1, expires_in_days: 1 }),
    });

    assert.equal(created.response.status, 201);
    assert.equal(typeof created.json.token, "string");
    assert.notEqual(created.json.link.tokenHash, `sha256:${created.json.token}`);
    assert.equal(created.json.link.tokenHash.length, "sha256:".length + 64);

    const firstView = await requestJson(`/api/share-links/${created.json.token}`);
    const secondView = await requestJson(`/api/share-links/${created.json.token}`);

    assert.equal(firstView.response.status, 200);
    assert.equal(firstView.json.link.viewCount, 1);
    assert.equal(secondView.response.status, 410);
    assert.equal(secondView.json.error, "share_link_view_limit_reached");

    const revocable = await requestJson("/api/reports/report-5/share-link", {
      method: "POST",
      body: JSON.stringify({ expires_in_days: 1 }),
    });
    const revoked = await requestJson(`/api/share-links/${revocable.json.token}/revoke`, { method: "POST" });
    const afterRevoke = await requestJson(`/api/share-links/${revocable.json.token}`);

    assert.equal(revoked.response.status, 200);
    assert.equal(afterRevoke.response.status, 410);
    assert.equal(afterRevoke.json.error, "share_link_revoked");
  });

  it("lists and revokes report share links for admin UI management", async () => {
    const created = await requestJson("/api/reports/report-5/share-link", {
      method: "POST",
      body: JSON.stringify({}),
    });
    assert.equal(created.response.status, 201);

    const listed = await requestJson("/api/reports/report-5/share-links");
    assert.equal(listed.response.status, 200);
    assert.equal(listed.json.links.length, 1);
    assert.equal(listed.json.links[0].id, created.json.link.id);
    assert.equal(listed.json.links[0].tokenHash, created.json.link.tokenHash);
    assert.equal("token" in listed.json.links[0], false);

    const revoked = await requestJson(`/api/share-links/${created.json.link.id}/revoke-by-id`, {
      method: "POST",
    });
    assert.equal(revoked.response.status, 200);
    assert.equal(typeof revoked.json.link.revokedAt, "string");

    const afterRevoke = await requestJson(`/api/share-links/${created.json.token}`);
    assert.equal(afterRevoke.response.status, 410);
    assert.equal(afterRevoke.json.error, "share_link_revoked");
  });

  it("accepts x_recent_search connector run as queued", async () => {
    const { response, json } = await requestJson("/api/connectors/x_recent_search/run", { method: "POST" });

    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.run.status, "queued");
  });

  it("imports approved legacy data through the API idempotently", async () => {
    const before = await requestJson("/api/imports/legacy/status");
    assert.equal(before.response.status, 200);
    assert.equal(before.json.legacy_import.imported, false);

    const first = await requestJson("/api/imports/legacy", { method: "POST" });
    assert.equal(first.response.status, 201);
    assert.equal(first.json.legacy_import.importedItems, 124);
    assert.equal(first.json.legacy_import.importedReports, 4);
    assert.equal(first.json.legacy_import.itemsCreated, 124);

    const second = await requestJson("/api/imports/legacy", { method: "POST" });
    assert.equal(second.response.status, 201);
    assert.equal(second.json.legacy_import.importedItems, 124);
    assert.equal(second.json.legacy_import.itemsCreated, 0);
    assert.equal(second.json.legacy_import.duplicatesSkipped, 124);
  });

  it("serves the interactive client report dataset", async () => {
    const { response, json } = await requestJson("/api/client-report/hidayathon");

    assert.equal(response.status, 200);
    assert.equal(json.report.summary.items, 124);
    assert.equal(json.report.reports.length, 4);
    assert.ok(json.report.filters.dates.length > 0);
    assert.ok(json.report.items[0].publishDateLabel);
  });

  it("serves a printable client PDF export for the selected visible items", async () => {
    const report = await requestJson("/api/client-report/hidayathon");
    const ids = report.json.report.items
      .slice(0, 2)
      .map((item: { id: string }) => item.id)
      .join(",");
    const exportPage = await requestText(`/api/client-report/hidayathon/export-pdf?ids=${encodeURIComponent(ids)}`);

    assert.equal(exportPage.response.status, 200);
    assert.match(exportPage.response.headers.get("content-type") ?? "", /text\/html/);
    assert.match(exportPage.text, /رصد هداية هاكاثون/);
    assert.match(exportPage.text, /حفظ PDF/);
    assert.doesNotMatch(exportPage.text, /confidence|raw text|backfill|النص الخام|تحذيرات الاستخراج/i);
  });

  it("limits printable client PDF export to 50 items", async () => {
    const report = await requestJson("/api/client-report/hidayathon");
    const ids = report.json.report.items
      .slice(0, 51)
      .map((item: { id: string }) => item.id)
      .join(",");
    const limited = await requestJson(`/api/client-report/hidayathon/export-pdf?ids=${encodeURIComponent(ids)}`);

    assert.equal(limited.response.status, 400);
    assert.equal(limited.json.error, "export_item_limit_exceeded");
    assert.equal(limited.json.maxItems, 50);
  });

  it("serves the legacy link backfill dataset for missing original URLs", async () => {
    const { response, json } = await requestJson("/api/imports/legacy/backfill");

    assert.equal(response.status, 200);
    assert.equal(json.backfill.totalItems, 124);
    assert.equal(json.backfill.itemsWithExtractedOriginalUrl, 124);
    assert.equal(json.backfill.itemsWithOriginalUrl, 124);
    assert.equal(json.backfill.itemsMissingOriginalUrl, 0);
    assert.equal(json.backfill.itemsWithoutOpenableOriginalUrl, 0);
    assert.equal(json.backfill.invalidOriginalUrlItems, 0);
    assert.equal(json.backfill.overrideReadyItems, 0);
    assert.equal(
      json.backfill.items
        .filter((item: { backfillStatus: string }) => item.backfillStatus === "missing_url" || item.backfillStatus === "invalid_url")
        .every((item: { effectiveOriginalUrl: string | null }) => item.effectiveOriginalUrl === null),
      true,
    );
  });

  it("serves a Supabase upsert plan for the approved legacy archive", async () => {
    const { response, json } = await requestJson("/api/imports/legacy/supabase-plan");

    assert.equal(response.status, 200);
    assert.equal(json.supabase_import.summary.reports, 4);
    assert.equal(json.supabase_import.summary.monitoringItems, 124);
    assert.equal(json.supabase_import.summary.openableOriginalUrls, 124);
    assert.ok(
      json.supabase_import.batches.some(
        (batch: { table: string; rows: number; onConflict: string }) =>
          batch.table === "monitoring_items" && batch.rows === 124 && batch.onConflict === "id",
      ),
    );
  });

  it("keeps legacy Supabase upsert dry-run by default", async () => {
    const { response, json } = await requestJson("/api/imports/legacy/upsert-supabase", { method: "POST" });

    assert.equal(response.status, 200);
    assert.equal(json.supabase_import.ok, true);
    assert.equal(json.supabase_import.dryRun, true);
    assert.equal(json.supabase_import.summary.monitoringItems, 124);
  });

  it("blocks real legacy Supabase upsert without an admin import token", async () => {
    const { response, json } = await requestJson("/api/imports/legacy/upsert-supabase", {
      method: "POST",
      body: JSON.stringify({ dry_run: false }),
    });

    assert.equal(response.status, 403);
    assert.equal(json.error, "admin_import_token_required");
  });

  it("does not accept the real Supabase import token from the JSON body", async () => {
    const previousAdminToken = process.env.RASD_ADMIN_IMPORT_TOKEN;
    process.env.RASD_ADMIN_IMPORT_TOKEN = "body_token_must_not_authorize";

    try {
      const { response, json } = await requestJson("/api/imports/legacy/upsert-supabase", {
        method: "POST",
        body: JSON.stringify({ dry_run: false, admin_token: "body_token_must_not_authorize" }),
      });
      const serialized = JSON.stringify(json);

      assert.equal(response.status, 403);
      assert.equal(json.error, "admin_import_token_required");
      assert.equal(serialized.includes("body_token_must_not_authorize"), false);
    } finally {
      if (previousAdminToken === undefined) delete process.env.RASD_ADMIN_IMPORT_TOKEN;
      else process.env.RASD_ADMIN_IMPORT_TOKEN = previousAdminToken;
    }
  });

  it("handles the UOfjeddah URL with ?lang=en by canonicalizing and fetching oEmbed", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      assert.ok(!url.includes("lang=en"), "oEmbed URL should not contain lang=en query param");
      return new Response(
        JSON.stringify({
          author_name: "جامعة جدة",
          author_url: "https://twitter.com/UOfjeddah",
          html:
            '<blockquote><p lang="ar" dir="rtl">هاكثون هداية | من مكة تنطلق الفكرة وبالعلم يتحقق الأثر.</p>&mdash; جامعة جدة (@UOfjeddah) <a href="https://twitter.com/UOfjeddah/status/2013613302509699235">January 20, 2026</a></blockquote>',
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    try {
      const result = await requestJson("/api/items/manual-url", {
        method: "POST",
        body: JSON.stringify({ url: "https://x.com/UOfjeddah/status/2013613302509699235?lang=en" }),
      });

      assert.equal(result.response.status, 201);
      assert.equal(result.json.metadata.source, "x_oembed");
      assert.equal(result.json.item.authorName, "جامعة جدة");
      assert.equal(result.json.item.authorHandle, "@UOfjeddah");
      assert.equal(result.json.item.originalUrl, "https://x.com/UOfjeddah/status/2013613302509699235");
      assert.ok(result.json.item.title.includes("هاكثون هداية"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deduplicates identical content submitted via different URLs through the API", async () => {
    const first = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({
        url: "https://x.com/FirstReporter/status/888888",
        title: "تقرير أول",
        text: "هذا نص مكرر طويل جدا يتجاوز الثلاثين حرفا ليتم رصده كمحتوى مكرر عبر الـ API.",
      }),
    });

    const second = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({
        url: "https://x.com/SecondReporter/status/999999",
        title: "تقرير ثانٍ",
        text: "هذا نص مكرر طويل جدا يتجاوز الثلاثين حرفا ليتم رصده كمحتوى مكرر عبر الـ API.",
      }),
    });

    assert.equal(first.response.status, 201);
    assert.equal(second.response.status, 200);
    assert.equal(second.json.duplicate, true);
    assert.equal(second.json.duplicateType, "content");
    assert.equal(second.json.item.id, first.json.item.id);
  });

  it("returns valid JSON error responses and never causes Unexpected end of JSON input", async () => {
    const endpoints = [
      { path: "/api/items/manual-url", method: "POST", body: "{}" },
      { path: "/api/items/manual-url", method: "POST", body: "" },
      { path: "/api/items/nonexistent/review", method: "POST", body: JSON.stringify({ action: "approve" }) },
      { path: "/api/items/nonexistent/captures", method: "GET", body: undefined },
    ];

    for (const endpoint of endpoints) {
      const response = await api.fetch(
        new Request(`http://rasd.test${endpoint.path}`, {
          method: endpoint.method,
          headers: { "content-type": "application/json" },
          body: endpoint.method === "POST" ? (endpoint.body || "{}") : undefined,
        }),
      );

      const contentType = response.headers.get("content-type") ?? "";
      assert.ok(contentType.includes("application/json") || contentType.includes("text/plain"),
        `${endpoint.path} should return JSON or text, got: ${contentType}`);

      if (contentType.includes("application/json")) {
        const json = await response.json();
        assert.equal(typeof json, "object", `${endpoint.path} should return a JSON object`);
      }
    }
  });

  it("returns a valid evidence card SVG with image/svg+xml content type", async () => {
    const manual = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({
        url: "https://example.com/evidence-test-page",
        title: "اختبار صورة دليل المحتوى",
        text: "محتوى اختباري لصورة الدليل.",
        author_name: "مختبر",
      }),
    });

    assert.equal(manual.response.status, 201);
    const evidenceUrl = `/api/items/${manual.json.item.id}/evidence-card.svg`;
    const svg = await requestText(evidenceUrl);

    assert.equal(svg.response.status, 200);
    assert.match(svg.response.headers.get("content-type") ?? "", /image\/svg\+xml/);
    assert.match(svg.text, /<svg/);
    assert.match(svg.text, /صورة دليل محتوى/);
    assert.match(svg.text, /اختبار/);
  });

  it("handles TikTok manual URL ingestion and verification workflow smoke test", async () => {
    const originalFetch = globalThis.fetch;
    const previousExtractor = process.env.MEDIA_METADATA_EXTRACTOR;
    const previousApifyToken = process.env.APIFY_API_TOKEN;
    const title = "\u062a\u063a\u0637\u064a\u0629 \u0647\u0627\u0643\u0627\u062b\u0648\u0646 \u0647\u062f\u0627\u064a\u0629 \u0639\u0644\u0649 \u062a\u064a\u0643 \u062a\u0648\u0643";
    const description = "\u0641\u064a\u062f\u064a\u0648 \u0631\u0627\u0626\u0639 \u0639\u0644\u0649 \u062a\u064a\u0643 \u062a\u0648\u0643 \u062d\u0648\u0644 \u0647\u0627\u0643\u0627\u062b\u0648\u0646 \u0647\u062f\u0627\u064a\u0629";
    process.env.MEDIA_METADATA_EXTRACTOR = "off";
    delete process.env.APIFY_API_TOKEN;
    globalThis.fetch = async () =>
      new Response(
        `<html><head><title>${title}</title><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:image" content="https://tiktok.com/image.jpg"></head></html>`,
        { status: 200, headers: { "content-type": "text/html" } }
      );

    try {
      const liveReport = await requestJson("/api/reports/hidayathon-live");
      assert.equal(liveReport.response.status, 200);

      const manual = await requestJson("/api/items/manual-url", {
        method: "POST",
        body: JSON.stringify({ url: "https://tiktok.com/@username/video/12345" }),
      });

      assert.equal(manual.response.status, 201);
      assert.equal(manual.json.metadata.platform, "TikTok");
      assert.equal(manual.json.item.state, "needs_review");
      assert.equal(manual.json.item.title, title);

      const approved = await requestJson(`/api/items/${manual.json.item.id}/review`, {
        method: "POST",
        body: JSON.stringify({ action: "approve", review_notes: "TikTok smoke test approval" }),
      });

      assert.equal(approved.response.status, 200);
      assert.equal(approved.json.item.state, "approved_pending_capture");

      const captured = await requestJson(`/api/items/${manual.json.item.id}/capture-report-grade`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      assert.equal(captured.response.status, 200);
      assert.equal(captured.json.item.state, "report_ready");

      const inserted = await requestJson(`/api/reports/${liveReport.json.report.id}/items`, {
        method: "POST",
        body: JSON.stringify({ item_id: manual.json.item.id }),
      });

      assert.equal(inserted.response.status, 200);
      assert.equal(inserted.json.ok, true);
      assert.equal(inserted.json.reportItem.itemId, manual.json.item.id);

      const duplicate = await requestJson("/api/items/manual-url", {
        method: "POST",
        body: JSON.stringify({ url: "https://tiktok.com/@username/video/12345?utm_source=again" }),
      });
      assert.equal(duplicate.response.status, 200);
      assert.equal(duplicate.json.duplicate, true);
      assert.equal(duplicate.json.item.id, manual.json.item.id);
      assert.equal(duplicate.json.item.state, "added_to_report");

      const items = await requestJson("/api/items");
      const storedItem = items.json.items.find((item: { id: string }) => item.id === manual.json.item.id);
      assert.equal(storedItem.state, "added_to_report");
      assert.equal(storedItem.originalUrl, "https://tiktok.com/@username/video/12345");

      const reportItems = await requestJson(`/api/reports/${liveReport.json.report.id}/items`);
      assert.ok(reportItems.json.report_items.some((item: { itemId: string }) => item.itemId === manual.json.item.id));

      const clientReport = await requestJson("/api/client-report/hidayathon");
      const clientReportItem = clientReport.json.report.items.find((item: { id: string }) => item.id === manual.json.item.id);
      assert.equal(clientReport.response.status, 200);
      assert.equal(clientReport.json.report.summary.items, 125);
      assert.equal(clientReportItem.platform, "TikTok");
      assert.equal(clientReportItem.title, title);
      assert.equal(clientReportItem.originalUrl, "https://tiktok.com/@username/video/12345");
      assert.equal(clientReportItem.screenshotStatus, "available");
    } finally {
      globalThis.fetch = originalFetch;
      if (previousExtractor === undefined) delete process.env.MEDIA_METADATA_EXTRACTOR;
      else process.env.MEDIA_METADATA_EXTRACTOR = previousExtractor;
      if (previousApifyToken === undefined) delete process.env.APIFY_API_TOKEN;
      else process.env.APIFY_API_TOKEN = previousApifyToken;
    }
  });

  it("handles Instagram manual URL ingestion and verification workflow smoke test", async () => {
    const originalFetch = globalThis.fetch;
    const previousExtractor = process.env.MEDIA_METADATA_EXTRACTOR;
    const previousApifyToken = process.env.APIFY_API_TOKEN;
    const title = "\u062a\u063a\u0637\u064a\u0629 \u0647\u0627\u0643\u0627\u062b\u0648\u0646 \u0647\u062f\u0627\u064a\u0629 \u0639\u0644\u0649 \u0627\u0646\u0633\u062a\u063a\u0631\u0627\u0645";
    const description = "\u0645\u0646\u0634\u0648\u0631 \u0631\u0627\u0626\u0639 \u0639\u0644\u0649 \u0627\u0646\u0633\u062a\u063a\u0631\u0627\u0645 \u062d\u0648\u0644 \u0631\u0635\u062f \u0647\u062f\u0627\u064a\u0629";
    process.env.MEDIA_METADATA_EXTRACTOR = "off";
    delete process.env.APIFY_API_TOKEN;
    globalThis.fetch = async () =>
      new Response(
        `<html><head><title>${title}</title><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:image" content="https://instagram.com/image.jpg"></head></html>`,
        { status: 200, headers: { "content-type": "text/html" } }
      );

    try {
      const liveReport = await requestJson("/api/reports/hidayathon-live");
      assert.equal(liveReport.response.status, 200);

      const manual = await requestJson("/api/items/manual-url", {
        method: "POST",
        body: JSON.stringify({ url: "https://instagram.com/p/ABCDE" }),
      });

      assert.equal(manual.response.status, 201);
      assert.equal(manual.json.metadata.platform, "Instagram");
      assert.equal(manual.json.item.state, "needs_review");
      assert.equal(manual.json.item.title, title);

      const approved = await requestJson(`/api/items/${manual.json.item.id}/review`, {
        method: "POST",
        body: JSON.stringify({ action: "approve", review_notes: "Instagram smoke test approval" }),
      });

      assert.equal(approved.response.status, 200);
      assert.equal(approved.json.item.state, "approved_pending_capture");

      const captured = await requestJson(`/api/items/${manual.json.item.id}/capture-report-grade`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      assert.equal(captured.response.status, 200);
      assert.equal(captured.json.item.state, "report_ready");

      const inserted = await requestJson(`/api/reports/${liveReport.json.report.id}/items`, {
        method: "POST",
        body: JSON.stringify({ item_id: manual.json.item.id }),
      });

      assert.equal(inserted.response.status, 200);
      assert.equal(inserted.json.ok, true);
      assert.equal(inserted.json.reportItem.itemId, manual.json.item.id);

      const duplicate = await requestJson("/api/items/manual-url", {
        method: "POST",
        body: JSON.stringify({ url: "https://instagram.com/p/ABCDE?utm_source=again" }),
      });
      assert.equal(duplicate.response.status, 200);
      assert.equal(duplicate.json.duplicate, true);
      assert.equal(duplicate.json.item.id, manual.json.item.id);
      assert.equal(duplicate.json.item.state, "added_to_report");

      const items = await requestJson("/api/items");
      const storedItem = items.json.items.find((item: { id: string }) => item.id === manual.json.item.id);
      assert.equal(storedItem.state, "added_to_report");
      assert.equal(storedItem.originalUrl, "https://instagram.com/p/ABCDE");

      const reportItems = await requestJson(`/api/reports/${liveReport.json.report.id}/items`);
      assert.ok(reportItems.json.report_items.some((item: { itemId: string }) => item.itemId === manual.json.item.id));

      const clientReport = await requestJson("/api/client-report/hidayathon");
      const clientReportItem = clientReport.json.report.items.find((item: { id: string }) => item.id === manual.json.item.id);
      assert.equal(clientReport.response.status, 200);
      assert.equal(clientReport.json.report.summary.items, 125);
      assert.equal(clientReportItem.platform, "Instagram");
      assert.equal(clientReportItem.title, title);
      assert.equal(clientReportItem.originalUrl, "https://instagram.com/p/ABCDE");
      assert.equal(clientReportItem.screenshotStatus, "available");
    } finally {
      globalThis.fetch = originalFetch;
      if (previousExtractor === undefined) delete process.env.MEDIA_METADATA_EXTRACTOR;
      else process.env.MEDIA_METADATA_EXTRACTOR = previousExtractor;
      if (previousApifyToken === undefined) delete process.env.APIFY_API_TOKEN;
      else process.env.APIFY_API_TOKEN = previousApifyToken;
    }
  });

  it("creates, lists, disables, and deletes TikTok and Instagram source rules through the API", async () => {
    const invalidType = await requestJson("/api/source-rules", {
      method: "POST",
      body: JSON.stringify({ type: "rss", query: "hidayathon" }),
    });
    const invalidInstagram = await requestJson("/api/source-rules", {
      method: "POST",
      body: JSON.stringify({ type: "instagram_public_profile", url: "https://instagram.com/p/ABCDE" }),
    });
    const missingTikTokTarget = await requestJson("/api/source-rules", {
      method: "POST",
      body: JSON.stringify({ type: "tiktok_research" }),
    });
    const invalidInterval = await requestJson("/api/source-rules", {
      method: "POST",
      body: JSON.stringify({ type: "tiktok_research", query: "hidayathon", poll_interval_minutes: 10 }),
    });

    assert.equal(invalidType.response.status, 400);
    assert.equal(invalidType.json.error, "source_rule_type_unsupported");
    assert.equal(invalidInstagram.response.status, 400);
    assert.equal(invalidInstagram.json.error, "instagram_profile_url_invalid");
    assert.equal(missingTikTokTarget.response.status, 400);
    assert.equal(missingTikTokTarget.json.error, "tiktok_query_or_url_required");
    assert.equal(invalidInterval.response.status, 400);
    assert.equal(invalidInterval.json.error, "poll_interval_minutes must be between 15 and 10080");

    const tiktok = await requestJson("/api/source-rules", {
      method: "POST",
      body: JSON.stringify({
        type: "tiktok_research",
        query: "hidayathon",
        poll_interval_minutes: 360,
      }),
    });
    const instagram = await requestJson("/api/source-rules", {
      method: "POST",
      body: JSON.stringify({
        type: "instagram_public_profile",
        url: "https://instagram.com/hidayathon",
        query: "hidayathon",
      }),
    });

    assert.equal(tiktok.response.status, 201);
    assert.equal(tiktok.json.source_rule.organizationId, DEFAULT_ORGANIZATION_ID);
    assert.equal(tiktok.json.source_rule.topicId, DEFAULT_TOPIC_ID);
    assert.equal(tiktok.json.source_rule.type, "tiktok_research");
    assert.equal(tiktok.json.source_rule.query, "hidayathon");
    assert.equal(tiktok.json.source_rule.active, true);
    assert.equal(tiktok.json.source_rule.pollIntervalMinutes, 360);

    assert.equal(instagram.response.status, 201);
    assert.equal(instagram.json.source_rule.type, "instagram_public_profile");
    assert.equal(instagram.json.source_rule.url, "https://instagram.com/hidayathon");
    assert.equal(instagram.json.source_rule.pollIntervalMinutes, 1440);

    const listed = await requestJson("/api/source-rules");
    assert.equal(listed.response.status, 200);
    assert.equal(listed.json.source_rules.length, 2);
    assert.equal(Array.isArray(listed.json.connector_runs), true);

    const disabled = await requestJson(`/api/source-rules/${tiktok.json.source_rule.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    assert.equal(disabled.response.status, 200);
    assert.equal(disabled.json.source_rule.active, false);

    const rescheduled = await requestJson(`/api/source-rules/${tiktok.json.source_rule.id}`, {
      method: "PATCH",
      body: JSON.stringify({ poll_interval_minutes: 2880 }),
    });
    assert.equal(rescheduled.response.status, 200);
    assert.equal(rescheduled.json.source_rule.pollIntervalMinutes, 2880);

    const deleted = await requestJson(`/api/source-rules/${instagram.json.source_rule.id}`, {
      method: "DELETE",
    });
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.json.ok, true);

    const listedAfterDelete = await requestJson("/api/source-rules");
    assert.deepEqual(
      listedAfterDelete.json.source_rules.map((rule: { id: string }) => rule.id),
      [tiktok.json.source_rule.id],
    );
  });

  it("runs due connector jobs from source rules created by the API", async () => {
    const previousSecret = process.env.CRON_SECRET;
    const previousConnectorMocks = process.env.RASD_CONNECTOR_MOCKS;
    process.env.CRON_SECRET = "cron_api_rules_secret";
    process.env.RASD_CONNECTOR_MOCKS = "true";

    try {
      const tiktok = await requestJson("/api/source-rules", {
        method: "POST",
        body: JSON.stringify({
          type: "tiktok_research",
          query: "hidayathon",
        }),
      });
      const instagram = await requestJson("/api/source-rules", {
        method: "POST",
        body: JSON.stringify({
          type: "instagram_public_profile",
          url: "https://instagram.com/hidayathon",
          query: "hidayathon",
        }),
      });

      assert.equal(tiktok.response.status, 201);
      assert.equal(instagram.response.status, 201);

      const result = await requestJson("/api/connectors/run-due", {
        method: "POST",
        headers: { authorization: "Bearer cron_api_rules_secret" },
        body: JSON.stringify({ organization_id: DEFAULT_ORGANIZATION_ID }),
      });

      assert.equal(result.response.status, 200);
      assert.equal(result.json.ok, true);
      assert.equal(result.json.dueRulesCount, 2);
      assert.equal(result.json.enqueuedCount, 2);
      assert.equal(result.json.executedCount, 2);
      assert.equal(result.json.failedCount, 0);

      const items = store
        .listItems()
        .filter((item) => item.sourceType === "tiktok_research" || item.sourceType === "instagram_public_profile");
      assert.equal(items.length, 2);
      assert.equal(items.every((item) => item.state === "needs_review"), true);
      assert.ok(items.some((item) => item.sourceType === "tiktok_research"));
      assert.ok(items.some((item) => item.sourceType === "instagram_public_profile"));
    } finally {
      if (previousSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previousSecret;
      if (previousConnectorMocks === undefined) delete process.env.RASD_CONNECTOR_MOCKS;
      else process.env.RASD_CONNECTOR_MOCKS = previousConnectorMocks;
    }
  });

  it("lets admins run due source rules without exposing the cron secret to the browser", async () => {
    const previousConnectorMocks = process.env.RASD_CONNECTOR_MOCKS;
    process.env.RASD_CONNECTOR_MOCKS = "true";

    try {
      await requestJson("/api/source-rules", {
        method: "POST",
        body: JSON.stringify({
          type: "tiktok_research",
          query: "hidayathon",
        }),
      });

      const result = await requestJson("/api/source-rules/run-due", {
        method: "POST",
        body: JSON.stringify({ organization_id: DEFAULT_ORGANIZATION_ID }),
      });

      assert.equal(result.response.status, 200);
      assert.equal(result.json.ok, true);
      assert.equal(result.json.dueRulesCount, 1);
      assert.equal(result.json.executedCount, 1);
    } finally {
      if (previousConnectorMocks === undefined) delete process.env.RASD_CONNECTOR_MOCKS;
      else process.env.RASD_CONNECTOR_MOCKS = previousConnectorMocks;
    }
  });

  it("lets admins force a social source rule scan even when it is not due", async () => {
    const previousConnectorMocks = process.env.RASD_CONNECTOR_MOCKS;
    process.env.RASD_CONNECTOR_MOCKS = "true";

    try {
      const created = await requestJson("/api/source-rules", {
        method: "POST",
        body: JSON.stringify({
          type: "tiktok_research",
          query: "hidayathon force scan",
        }),
      });
      const first = await requestJson("/api/source-rules/run-due", {
        method: "POST",
        body: JSON.stringify({ organization_id: DEFAULT_ORGANIZATION_ID }),
      });
      const secondDueOnly = await requestJson("/api/source-rules/run-due", {
        method: "POST",
        body: JSON.stringify({ organization_id: DEFAULT_ORGANIZATION_ID }),
      });
      const forced = await requestJson("/api/source-rules/run-due", {
        method: "POST",
        body: JSON.stringify({
          organization_id: DEFAULT_ORGANIZATION_ID,
          force: true,
          source_rule_id: created.json.source_rule.id,
        }),
      });

      assert.equal(first.response.status, 200);
      assert.equal(first.json.dueRulesCount, 1);
      assert.equal(secondDueOnly.response.status, 200);
      assert.equal(secondDueOnly.json.dueRulesCount, 0);
      assert.equal(secondDueOnly.json.executedCount, 0);
      assert.equal(forced.response.status, 200);
      assert.equal(forced.json.dueRulesCount, 1);
      assert.equal(forced.json.executedCount, 1);
    } finally {
      if (previousConnectorMocks === undefined) delete process.env.RASD_CONNECTOR_MOCKS;
      else process.env.RASD_CONNECTOR_MOCKS = previousConnectorMocks;
    }
  });

  it("runs connector scheduler through the Vercel cron wrapper", async () => {
    const previousSecret = process.env.CRON_SECRET;
    const previousConnectorMocks = process.env.RASD_CONNECTOR_MOCKS;
    process.env.CRON_SECRET = "cron_wrapper_secret";
    process.env.RASD_CONNECTOR_MOCKS = "true";

    try {
      await requestJson("/api/source-rules", {
        method: "POST",
        body: JSON.stringify({
          type: "tiktok_research",
          query: "hidayathon",
        }),
      });

      const unauthorized = await requestJson("/api/cron/run-connectors");
      const result = await requestJson("/api/cron/run-connectors", {
        headers: { authorization: "Bearer cron_wrapper_secret" },
      });

      assert.equal(unauthorized.response.status, 401);
      assert.equal(unauthorized.json.error, "cron_unauthorized");
      assert.equal(result.response.status, 200);
      assert.equal(result.json.ok, true);
      assert.equal(result.json.dueRulesCount, 1);
      assert.equal(result.json.executedCount, 1);
      assert.equal(result.json.failedJobs.length, 0);
    } finally {
      if (previousSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previousSecret;
      if (previousConnectorMocks === undefined) delete process.env.RASD_CONNECTOR_MOCKS;
      else process.env.RASD_CONNECTOR_MOCKS = previousConnectorMocks;
    }
  });

  it("exposes TikTok and Instagram automation status in admin health", async () => {
    await requestJson("/api/source-rules", {
      method: "POST",
      body: JSON.stringify({
        type: "tiktok_research",
        query: "hidayathon",
        poll_interval_minutes: 60,
      }),
    });

    const health = await requestJson("/api/admin/health");

    assert.equal(health.response.status, 200);
    assert.equal(health.json.status, "ok");
    assert.equal(health.json.automation.schemaReady, true);
    assert.equal(typeof health.json.automation.cronSecretConfigured, "boolean");
    assert.equal(health.json.automation.connectorCronPath, "/api/cron/run-connectors");
    assert.equal(health.json.automation.tiktok.activeRulesCount, 1);
    assert.equal(typeof health.json.automation.mediaMetadataExtractor.enabled, "boolean");
    assert.equal(typeof health.json.automation.mediaMetadataExtractor.ytDlpAvailable, "boolean");
    assert.equal(typeof health.json.automation.mediaMetadataExtractor.cookiesConfigured, "boolean");
    assert.equal(typeof health.json.automation.mediaMetadataExtractor.proxyConfigured, "boolean");
    assert.equal(typeof health.json.automation.apify.configured, "boolean");
    assert.ok(["healthy", "not_configured"].includes(health.json.automation.apify.status));
  });

  it("does not ingest automated TikTok or Instagram items without mocks or credentials", async () => {
    const previousSecret = process.env.CRON_SECRET;
    const previousTikTokEnabled = process.env.TIKTOK_RESEARCH_ENABLED;
    const previousTikTokKey = process.env.TIKTOK_CLIENT_KEY;
    const previousInstagramEnabled = process.env.INSTAGRAM_WATCHLIST_ENABLED;
    const previousMocks = process.env.RASD_CONNECTOR_MOCKS;
    const previousApifyToken = process.env.APIFY_API_TOKEN;

    process.env.CRON_SECRET = "cron_no_mock_secret";
    delete process.env.TIKTOK_RESEARCH_ENABLED;
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.INSTAGRAM_WATCHLIST_ENABLED;
    delete process.env.RASD_CONNECTOR_MOCKS;
    delete process.env.APIFY_API_TOKEN;

    try {
      await requestJson("/api/source-rules", {
        method: "POST",
        body: JSON.stringify({ type: "tiktok_research", query: "hidayathon" }),
      });
      await requestJson("/api/source-rules", {
        method: "POST",
        body: JSON.stringify({
          type: "instagram_public_profile",
          url: "https://instagram.com/hidayathon",
        }),
      });

      const result = await requestJson("/api/connectors/run-due", {
        method: "POST",
        headers: { authorization: "Bearer cron_no_mock_secret" },
        body: JSON.stringify({ organization_id: DEFAULT_ORGANIZATION_ID }),
      });

      assert.equal(result.response.status, 200);
      assert.equal(result.json.ok, true);
      assert.equal(result.json.dueRulesCount, 2);
      assert.equal(result.json.executedCount, 2);
      assert.equal(result.json.failedCount, 0);
      assert.equal(
        store.listItems().some((item) => item.sourceType === "tiktok_research" || item.sourceType === "instagram_public_profile"),
        false,
      );
    } finally {
      if (previousSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previousSecret;
      if (previousTikTokEnabled === undefined) delete process.env.TIKTOK_RESEARCH_ENABLED;
      else process.env.TIKTOK_RESEARCH_ENABLED = previousTikTokEnabled;
      if (previousTikTokKey === undefined) delete process.env.TIKTOK_CLIENT_KEY;
      else process.env.TIKTOK_CLIENT_KEY = previousTikTokKey;
      if (previousInstagramEnabled === undefined) delete process.env.INSTAGRAM_WATCHLIST_ENABLED;
      else process.env.INSTAGRAM_WATCHLIST_ENABLED = previousInstagramEnabled;
      if (previousMocks === undefined) delete process.env.RASD_CONNECTOR_MOCKS;
      else process.env.RASD_CONNECTOR_MOCKS = previousMocks;
      if (previousApifyToken === undefined) delete process.env.APIFY_API_TOKEN;
      else process.env.APIFY_API_TOKEN = previousApifyToken;
    }
  });

  it("uses Apify for automated TikTok and Instagram watchlist ingestion", async () => {
    const previousSecret = process.env.CRON_SECRET;
    const previousApifyToken = process.env.APIFY_API_TOKEN;
    const previousTikTokEnabled = process.env.TIKTOK_RESEARCH_ENABLED;
    const previousTikTokKey = process.env.TIKTOK_CLIENT_KEY;
    const previousInstagramEnabled = process.env.INSTAGRAM_WATCHLIST_ENABLED;
    const previousMocks = process.env.RASD_CONNECTOR_MOCKS;
    const originalFetch = globalThis.fetch;

    process.env.CRON_SECRET = "cron_apify_watchlist_secret";
    process.env.APIFY_API_TOKEN = "apify_test_token";
    delete process.env.TIKTOK_RESEARCH_ENABLED;
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.INSTAGRAM_WATCHLIST_ENABLED;
    delete process.env.RASD_CONNECTOR_MOCKS;

    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? init.body : "";

      if (url.includes("clockworks~free-tiktok-scraper")) {
        assert.match(body, /"search":\["هداية"\]/);
        return new Response(
          JSON.stringify([
            {
              id: "7620000000000000001",
              text: "تغطية تلقائية عن هاكاثون هداية من تيك توك",
              authorMeta: { name: "hidayathon_tiktok", nickName: "Hidayathon TikTok" },
              videoMeta: { coverUrl: "https://cdn.example.com/tiktok-auto.jpg" },
              createTimeISO: "2026-05-23T10:00:00.000Z",
              webVideoUrl: "https://www.tiktok.com/@hidayathon_tiktok/video/7620000000000000001",
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("apify~instagram-post-scraper")) {
        assert.match(body, /"username":"hidayathon"/);
        assert.match(body, /"resultsLimit":5/);
        return new Response(
          JSON.stringify([
            {
              id: "ig-auto-1",
              shortCode: "IGAUTO1",
              caption: "منشور تلقائي عن هاكاثون هداية من انستغرام",
              ownerUsername: "hidayathon",
              ownerFullName: "Hidayathon Instagram",
              displayUrl: "https://cdn.example.com/instagram-auto.jpg",
              timestamp: "2026-05-23T09:30:00.000Z",
              url: "https://www.instagram.com/p/IGAUTO1/",
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      throw new Error(`unexpected_fetch:${url}`);
    };

    try {
      await requestJson("/api/source-rules", {
        method: "POST",
        body: JSON.stringify({ type: "tiktok_research", query: "هداية" }),
      });
      await requestJson("/api/source-rules", {
        method: "POST",
        body: JSON.stringify({
          type: "instagram_public_profile",
          url: "https://instagram.com/hidayathon",
          query: "هداية",
        }),
      });

      const result = await requestJson("/api/connectors/run-due", {
        method: "POST",
        headers: { authorization: "Bearer cron_apify_watchlist_secret" },
        body: JSON.stringify({ organization_id: DEFAULT_ORGANIZATION_ID }),
      });

      assert.equal(result.response.status, 200);
      assert.equal(result.json.ok, true);
      assert.equal(result.json.dueRulesCount, 2);
      assert.equal(result.json.executedCount, 2);
      assert.equal(result.json.failedCount, 0);
      assert.equal(result.json.createdCount, 2);
      assert.equal(result.json.createdBySourceType.tiktok_research, 1);
      assert.equal(result.json.createdBySourceType.instagram_public_profile, 1);
      assert.equal(result.json.newItemIds.length, 2);

      const items = store
        .listItems()
        .filter((item) => item.sourceType === "tiktok_research" || item.sourceType === "instagram_public_profile");
      assert.equal(items.length, 2);
      assert.ok(items.some((item) => item.title.includes("تيك توك") && item.raw_response && JSON.stringify(item.raw_response).includes("apify")));
      assert.ok(items.some((item) => item.title.includes("انستغرام") && item.raw_response && JSON.stringify(item.raw_response).includes("instagram-auto.jpg")));
    } finally {
      globalThis.fetch = originalFetch;
      if (previousSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previousSecret;
      if (previousApifyToken === undefined) delete process.env.APIFY_API_TOKEN;
      else process.env.APIFY_API_TOKEN = previousApifyToken;
      if (previousTikTokEnabled === undefined) delete process.env.TIKTOK_RESEARCH_ENABLED;
      else process.env.TIKTOK_RESEARCH_ENABLED = previousTikTokEnabled;
      if (previousTikTokKey === undefined) delete process.env.TIKTOK_CLIENT_KEY;
      else process.env.TIKTOK_CLIENT_KEY = previousTikTokKey;
      if (previousInstagramEnabled === undefined) delete process.env.INSTAGRAM_WATCHLIST_ENABLED;
      else process.env.INSTAGRAM_WATCHLIST_ENABLED = previousInstagramEnabled;
      if (previousMocks === undefined) delete process.env.RASD_CONNECTOR_MOCKS;
      else process.env.RASD_CONNECTOR_MOCKS = previousMocks;
    }
  });

  it("executes the watchlist scheduler and worker API pipeline for due rules", async () => {
    const previousSecret = process.env.CRON_SECRET;
    const previousConnectorMocks = process.env.RASD_CONNECTOR_MOCKS;
    process.env.CRON_SECRET = "cron_integration_test_secret";
    process.env.RASD_CONNECTOR_MOCKS = "true";

    try {
      store.resetForTest();

      await store.upsertSourceRule({
        organizationId: "demo-org",
        topicId: "demo-topic",
        type: "tiktok_research",
        query: "هداية",
        active: true,
      });

      await store.upsertSourceRule({
        organizationId: "demo-org",
        topicId: "demo-topic",
        type: "instagram_public_profile",
        url: "https://instagram.com/hidayathon",
        query: "هداية",
        active: true,
      });

      const unauthorized = await requestJson("/api/connectors/run-due", { method: "POST" });
      assert.equal(unauthorized.response.status, 401);
      assert.equal(unauthorized.json.error, "cron_unauthorized");

      const result = await requestJson("/api/connectors/run-due", {
        method: "POST",
        headers: { authorization: "Bearer cron_integration_test_secret" },
        body: JSON.stringify({ organization_id: "demo-org" }),
      });

      assert.equal(result.response.status, 200);
      assert.equal(result.json.ok, true);
      assert.equal(result.json.dueRulesCount, 2);
      assert.equal(result.json.enqueuedCount, 2);
      assert.equal(result.json.executedCount, 2);
      assert.equal(result.json.failedCount, 0);

      const jobs = await store.listJobs("demo-org");
      assert.equal(jobs.length, 2);
      assert.equal(jobs.every((j) => j.status === "succeeded"), true);

      const items = store.listItems();
      assert.ok(items.length > 0);
      assert.ok(items.some((item) => item.sourceType === "tiktok_research"));
      assert.ok(items.some((item) => item.sourceType === "instagram_public_profile"));
      const automatedItems = items.filter((item) => item.sourceType === "tiktok_research" || item.sourceType === "instagram_public_profile");
      assert.equal(automatedItems.every((item) => item.state === "needs_review"), true);

      const ruleFresh = await store.upsertSourceRule({
        organizationId: "demo-org",
        topicId: "demo-topic",
        type: "tiktok_research",
        query: "هداية",
        active: true,
      });

      const jobFresh = await store.enqueueConnectorJob(ruleFresh);
      assert.equal(jobFresh.status, "queued");

      const unauthorizedJob = await requestJson("/api/connectors/run-job", {
        method: "POST",
        body: JSON.stringify({ jobId: jobFresh.id }),
      });
      assert.equal(unauthorizedJob.response.status, 401);

      const runJobResult = await requestJson("/api/connectors/run-job", {
        method: "POST",
        headers: { authorization: "Bearer cron_integration_test_secret" },
        body: JSON.stringify({ jobId: jobFresh.id }),
      });
      assert.equal(runJobResult.response.status, 200);
      assert.equal(runJobResult.json.ok, true);
      assert.equal(runJobResult.json.status, "succeeded");

      const updatedJobs = await store.listJobs("demo-org");
      const ranJob = updatedJobs.find((j) => j.id === jobFresh.id);
      assert.ok(ranJob);
      assert.equal(ranJob.status, "succeeded");

    } finally {
      if (previousSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previousSecret;
      if (previousConnectorMocks === undefined) delete process.env.RASD_CONNECTOR_MOCKS;
      else process.env.RASD_CONNECTOR_MOCKS = previousConnectorMocks;
    }
  });

  it("does not return TikTok or Instagram mock connector items unless mock mode is explicit", async () => {
    const previousTikTokEnabled = process.env.TIKTOK_RESEARCH_ENABLED;
    const previousTikTokKey = process.env.TIKTOK_CLIENT_KEY;
    const previousInstagramEnabled = process.env.INSTAGRAM_WATCHLIST_ENABLED;
    const previousMocks = process.env.RASD_CONNECTOR_MOCKS;
    const previousNodeEnv = process.env["NODE_ENV"];

    delete process.env.TIKTOK_RESEARCH_ENABLED;
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.INSTAGRAM_WATCHLIST_ENABLED;
    delete process.env.RASD_CONNECTOR_MOCKS;

    try {
      const rule = await store.upsertSourceRule({
        organizationId: "demo-org",
        topicId: "demo-topic",
        type: "tiktok_research",
        query: "Ù‡Ø¯Ø§ÙŠØ©",
        active: true,
      });

      assert.deepEqual(await new TikTokResearchConnector().fetch(rule, null), []);
      assert.deepEqual(await new InstagramPublicProfileConnector().fetch({ ...rule, type: "instagram_public_profile" }, null), []);

      process.env.RASD_CONNECTOR_MOCKS = "true";
      assert.equal((await new TikTokResearchConnector().fetch(rule, null)).length, 1);
      assert.equal((await new InstagramPublicProfileConnector().fetch({ ...rule, type: "instagram_public_profile" }, null)).length, 1);

      Object.assign(process.env, { NODE_ENV: "production" });
      assert.deepEqual(await new TikTokResearchConnector().fetch(rule, null), []);
      assert.deepEqual(await new InstagramPublicProfileConnector().fetch({ ...rule, type: "instagram_public_profile" }, null), []);
    } finally {
      if (previousTikTokEnabled === undefined) delete process.env.TIKTOK_RESEARCH_ENABLED;
      else process.env.TIKTOK_RESEARCH_ENABLED = previousTikTokEnabled;
      if (previousTikTokKey === undefined) delete process.env.TIKTOK_CLIENT_KEY;
      else process.env.TIKTOK_CLIENT_KEY = previousTikTokKey;
      if (previousInstagramEnabled === undefined) delete process.env.INSTAGRAM_WATCHLIST_ENABLED;
      else process.env.INSTAGRAM_WATCHLIST_ENABLED = previousInstagramEnabled;
      if (previousMocks === undefined) delete process.env.RASD_CONNECTOR_MOCKS;
      else process.env.RASD_CONNECTOR_MOCKS = previousMocks;
      if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
      else Object.assign(process.env, { NODE_ENV: previousNodeEnv });
    }
  });

  it("reports connector job failures from run-job and run-due responses", async () => {
    const previousSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "cron_failure_test_secret";

    try {
      store.resetForTest();
      const unsupportedRule = await store.upsertSourceRule({
        organizationId: "demo-org",
        topicId: "demo-topic",
        type: "rss",
        query: "Ù‡Ø¯Ø§ÙŠØ©",
        active: true,
      });
      const job = await store.enqueueConnectorJob(unsupportedRule);

      const runJobResult = await requestJson("/api/connectors/run-job", {
        method: "POST",
        headers: { authorization: "Bearer cron_failure_test_secret" },
        body: JSON.stringify({ jobId: job.id }),
      });

      assert.equal(runJobResult.response.status, 500);
      assert.equal(runJobResult.json.ok, false);
      assert.equal(runJobResult.json.status, "failed");
      assert.match(runJobResult.json.failureReason, /unsupported_connector_type:rss/);

      await store.upsertSourceRule({
        organizationId: "demo-org",
        topicId: "demo-topic",
        type: "rss",
        query: "Ù‡Ø¯Ø§ÙŠØ©",
        active: true,
      });

      const dueFailure = await requestJson("/api/connectors/run-due", {
        method: "POST",
        headers: { authorization: "Bearer cron_failure_test_secret" },
        body: JSON.stringify({ organization_id: "demo-org" }),
      });

      assert.equal(dueFailure.response.status, 200);
      assert.equal(dueFailure.json.ok, true);
      assert.equal(dueFailure.json.executedCount, 0);
      assert.equal(dueFailure.json.failedCount, 1);
      assert.match(dueFailure.json.failedJobs[0].error, /unsupported_connector_type:rss/);
    } finally {
      if (previousSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previousSecret;
    }
  });
});
