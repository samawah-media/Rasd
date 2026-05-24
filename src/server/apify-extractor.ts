import type { ExtractionResult } from "@/server/url-metadata";

export type ApifyExtractionResult = {
  metadata: ExtractionResult | null;
  error?: string;
  rawResponse?: Record<string, unknown>;
};

export type ApifyHealth = {
  configured: boolean;
  status: "healthy" | "not_configured";
  message: string;
};

export type ApifyGoogleSearchResult = {
  title: string;
  url: string;
  description?: string;
};

export type NewsSiteSearchResult = ApifyGoogleSearchResult & {
  source: "apify_google_search" | "news_sitemap";
};

type SocialPlatform = Extract<ExtractionResult["platform"], "TikTok" | "Instagram">;
type FetchLike = typeof fetch;

export const apifyTimeoutMs = 30_000;
export const tiktokActorId = "clockworks/free-tiktok-scraper";
export const instagramActorId = "apify/instagram-post-scraper";
export const googleSearchActorId = "apify/google-search-scraper";

export function isApifyConfigured() {
  return Boolean(cleanEnv(process.env.APIFY_API_TOKEN));
}

export function getApifyHealth(): ApifyHealth {
  const configured = isApifyConfigured();
  return {
    configured,
    status: configured ? "healthy" : "not_configured",
    message: configured
      ? "Apify is configured for TikTok/Instagram metadata extraction."
      : "APIFY_API_TOKEN is not set. Apify extraction is disabled.",
  };
}

async function runActor(
  actorId: string,
  payload: Record<string, unknown>,
  token: string,
  fetcher: FetchLike,
): Promise<{ items: unknown[]; error?: string }> {
  const endpoint = new URL(`https://api.apify.com/v2/acts/${actorId.replace("/", "~")}/run-sync-get-dataset-items`);
  endpoint.searchParams.set("token", token);
  endpoint.searchParams.set("timeout", String(Math.trunc(apifyTimeoutMs / 1000)));

  try {
    const response = await fetchWithTimeout(endpoint.toString(), fetcher, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        items: [],
        error: sanitizeApifyError(`apify_http_${response.status}: ${body}`),
      };
    }

    const json = (await response.json().catch(() => null)) as unknown;
    const items = Array.isArray(json) ? json : [];
    return { items };
  } catch (error) {
    return {
      items: [],
      error: sanitizeApifyError(error instanceof Error ? error.message : String(error)),
    };
  }
}

export async function runApifyActorDatasetItems(
  actorId: string,
  payload: Record<string, unknown>,
  fetcher: FetchLike = fetch,
) {
  const token = cleanEnv(process.env.APIFY_API_TOKEN);
  if (!token) return { items: [], error: "apify_not_configured" };
  return runActor(actorId, payload, token, fetcher);
}

export async function searchNewsSiteWithApifyGoogle(
  siteUrl: string,
  term: string,
  options: { maxResults?: number; fetcher?: FetchLike } = {},
): Promise<{ results: NewsSiteSearchResult[]; query: string; error?: string }> {
  const token = cleanEnv(process.env.APIFY_API_TOKEN);
  const host = hostForSiteSearch(siteUrl);
  const cleanTerm = term.trim();
  const query = host && cleanTerm ? `site:${host} "${cleanTerm}"` : cleanTerm;
  if (!token) return { results: [], query, error: "apify_not_configured" };
  if (!host || !cleanTerm) return { results: [], query, error: "apify_search_input_invalid" };

  const maxResults = clampNumber(options.maxResults ?? Number(process.env.APIFY_GOOGLE_SEARCH_MAX_RESULTS ?? 5), 1, 10);
  const actorId = process.env.APIFY_GOOGLE_SEARCH_ACTOR || googleSearchActorId;
  const { items, error } = await runActor(
    actorId,
    {
      queries: query,
      resultsPerPage: maxResults,
      maxPagesPerQuery: 1,
      countryCode: process.env.APIFY_GOOGLE_SEARCH_COUNTRY || "sa",
      languageCode: process.env.APIFY_GOOGLE_SEARCH_LANGUAGE || "ar",
      mobileResults: false,
      saveHtml: false,
      saveHtmlToKeyValueStore: false,
    },
    token,
    options.fetcher ?? fetch,
  );

  const results = mapGoogleSearchItems(items)
    .filter((result) => sameHostnameOrSubdomain(result.url, host))
    .slice(0, maxResults)
    .map((result) => ({ ...result, source: "apify_google_search" as const }));
  return {
    results,
    query,
    error: results.length ? undefined : error ?? "apify_google_search_empty",
  };
}

export async function searchNewsSiteSitemap(
  siteUrl: string,
  term: string,
  options: { maxResults?: number; fetcher?: FetchLike } = {},
): Promise<{ results: NewsSiteSearchResult[]; searched: string[]; error?: string }> {
  const host = hostForSiteSearch(siteUrl);
  const cleanTerm = term.trim();
  if (!host || !cleanTerm) return { results: [], searched: [], error: "news_sitemap_input_invalid" };

  const maxResults = clampNumber(options.maxResults ?? 5, 1, 10);
  const fetcher = options.fetcher ?? fetch;
  const sitemapUrls = await discoverNewsSitemaps(siteUrl, fetcher);
  const searched: string[] = [];
  const results: NewsSiteSearchResult[] = [];

  for (const sitemapUrl of sitemapUrls) {
    if (results.length >= maxResults) break;
    searched.push(sitemapUrl);
    const xml = await fetchText(sitemapUrl, fetcher);
    if (!xml) continue;
    for (const row of parseNewsSitemap(xml)) {
      if (results.length >= maxResults) break;
      if (!sameHostnameOrSubdomain(row.url, host)) continue;
      if (!matchesNewsTerm([row.title, row.description, row.url], cleanTerm)) continue;
      results.push({
        title: row.title || row.url,
        url: row.url,
        description: row.description,
        source: "news_sitemap",
      });
    }
  }

  return {
    results,
    searched,
    error: results.length ? undefined : "news_sitemap_empty",
  };
}

export async function extractWithApify(
  url: string,
  platform: SocialPlatform,
  fetcher: FetchLike = fetch,
): Promise<ApifyExtractionResult> {
  const token = cleanEnv(process.env.APIFY_API_TOKEN);
  if (!token) return { metadata: null, error: "apify_not_configured" };

  if (platform === "Instagram") {
    const actorId = instagramActorId;
    const { items, error } = await runActor(actorId, { directUrls: [url] }, token, fetcher);
    const firstItem = firstObject(items);
    if (!firstItem) return { metadata: null, error: error ?? "apify_empty_dataset" };
    const metadata = mapApifyInstagramItem(firstItem, url);
    return {
      metadata,
      rawResponse: firstItem,
      error: metadata ? undefined : "apify_metadata_unusable",
    };
  }

  // TikTok Extraction:
  const primaryActor = process.env.APIFY_TIKTOK_PRIMARY_ACTOR || "clockworks/free-tiktok-scraper";
  const fallbackActor = process.env.APIFY_TIKTOK_FALLBACK_ACTOR || "OtzYfK1ndEGdwWFKQ/tiktok-scraper";
  const useFallback = process.env.APIFY_TIKTOK_USE_FALLBACK !== "false";

  const payload = {
    postURLs: [url],
    resultsPerPage: 1,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  };

  const primaryResult = await runActor(primaryActor, payload, token, fetcher);
  const primaryItem = firstObject(primaryResult.items);
  const primaryMetadata = primaryItem ? mapApifyTikTokItem(primaryItem, url) : null;

  // We consider it a "complete" metadata if we retrieved an actual caption/text and it's not a generic fallback
  const isPrimaryComplete = primaryMetadata && primaryMetadata.text && !primaryMetadata.text.startsWith("فيديو تيك توك");

  if (isPrimaryComplete || !useFallback) {
    if (primaryItem) {
      return {
        metadata: primaryMetadata,
        rawResponse: primaryItem,
        error: primaryMetadata ? undefined : (primaryResult.error ?? "apify_metadata_unusable"),
      };
    } else {
      return {
        metadata: null,
        error: primaryResult.error ?? "apify_empty_dataset",
      };
    }
  }

  // Fallback mode if primary actor yielded empty or textless metadata.
  const fallbackResult = await runActor(fallbackActor, payload, token, fetcher);
  const fallbackItem = firstObject(fallbackResult.items);
  const fallbackMetadata = fallbackItem ? mapApifyTikTokItem(fallbackItem, url) : null;

  if (fallbackMetadata) {
    return {
      metadata: fallbackMetadata,
      rawResponse: fallbackItem,
    };
  }

  if (primaryMetadata) {
    return {
      metadata: primaryMetadata,
      rawResponse: primaryItem,
    };
  }

  return {
    metadata: null,
    error: `Both actors failed. Primary: ${primaryResult.error || "empty_dataset"}. Fallback: ${fallbackResult.error || "empty_dataset"}.`,
  };
}

export function mapApifyTikTokItem(item: Record<string, unknown>, inputUrl: string): ExtractionResult | null {
  const authorMeta = objectValue(item.authorMeta);
  const videoMeta = objectValue(item.videoMeta);
  const shareMeta = objectValue(item.shareMeta);
  const author = objectValue(item.author);

  const text =
    stringValue(item.text) ??
    stringValue(item.desc) ??
    stringValue(item.description) ??
    stringValue(item.content_desc) ??
    stringValue(item.caption) ??
    stringValue(shareMeta?.desc) ??
    stringValue(shareMeta?.title);

  const authorName =
    stringValue(authorMeta?.nickName) ??
    stringValue(authorMeta?.name) ??
    stringValue(author?.nickname) ??
    stringValue(author?.unique_id) ??
    stringValue(item.authorName);

  const authorHandle =
    stringValue(authorMeta?.uniqueId) ??
    stringValue(author?.unique_id) ??
    stringValue(authorMeta?.name) ??
    stringValue(item.authorName);

  const imageUrl =
    stringValue(videoMeta?.coverUrl) ??
    stringValue(videoMeta?.originalCoverUrl) ??
    stringValue(videoMeta?.dynamicCoverUrl) ??
    stringValue(item.thumbnail) ??
    stringValue(item.cover) ??
    stringValue(item.originCover) ??
    stringValue(item.dynamicCover);

  const canonicalUrl = stringValue(item.webVideoUrl) ?? stringValue(item.url) ?? inputUrl;

  const createTimeVal = item.createTimeISO ?? item.createTime;
  let publishedAt: string | undefined;
  if (typeof createTimeVal === "string" || typeof createTimeVal === "number") {
    publishedAt = isoDate(String(createTimeVal));
    if (!publishedAt) {
      publishedAt = numberToIso(numberValue(createTimeVal));
    }
  }

  const titleFallback = authorName ? `فيديو تيك توك — ${authorName}` : "فيديو تيك توك";
  const title = clipped(text ?? stringValue(item.title) ?? titleFallback, 110);

  // Accept result even with partial data (image only, or author only)
  if (!text && !imageUrl && !authorName) return null;

  return {
    title,
    text: text ?? title,
    authorName,
    authorHandle: normalizeHandle(authorHandle),
    publishedAt: publishedAt ?? new Date().toISOString(),
    canonicalUrl,
    imageUrl,
    platform: "TikTok",
    source: "apify_metadata",
  };
}

export function mapApifyInstagramItem(item: Record<string, unknown>, inputUrl: string): ExtractionResult | null {
  const caption = stringValue(item.caption) ?? stringValue(item.alt) ?? stringValue(item.description) ?? stringValue(item.accessibility);
  const title = clipped(caption ?? stringValue(item.title) ?? "Instagram post", 110);
  const imageUrl =
    stringValue(item.displayUrl) ??
    stringValue(item.imageUrl) ??
    stringValue(item.thumbnailUrl) ??
    firstString(arrayValue(item.images));
  const canonicalUrl = stringValue(item.url) ?? stringValue(item.shortCodeUrl) ?? inputUrl;

  if (!caption && !imageUrl && !stringValue(item.ownerUsername)) return null;

  return {
    title,
    text: caption ?? title,
    authorName: stringValue(item.ownerFullName) ?? stringValue(item.ownerUsername),
    authorHandle: normalizeHandle(stringValue(item.ownerUsername)),
    publishedAt: isoDate(stringValue(item.timestamp)),
    canonicalUrl,
    imageUrl,
    platform: "Instagram",
    source: "apify_metadata",
  };
}

async function fetchWithTimeout(input: string, fetcher: FetchLike, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), apifyTimeoutMs);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function firstObject(items: unknown[]) {
  return items.find((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function mapGoogleSearchItems(items: unknown[]) {
  const candidates: ApifyGoogleSearchResult[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    for (const nested of nestedSearchRows(row)) {
      const result = googleResultFromObject(nested);
      if (result) candidates.push(result);
    }
    const direct = googleResultFromObject(row);
    if (direct) candidates.push(direct);
  }

  const seen = new Set<string>();
  return candidates.filter((result) => {
    const key = result.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function nestedSearchRows(row: Record<string, unknown>) {
  const fields = ["organicResults", "organic_results", "results", "searchResults"];
  return fields.flatMap((field) => {
    const value = row[field];
    return Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
      : [];
  });
}

function googleResultFromObject(row: Record<string, unknown>): ApifyGoogleSearchResult | null {
  const rawUrl =
    stringValue(row.url) ??
    stringValue(row.link) ??
    stringValue(row.displayedUrl) ??
    stringValue(row.displayUrl);
  if (!rawUrl) return null;

  let url: string;
  try {
    url = new URL(rawUrl).toString();
  } catch {
    return null;
  }

  const title = stringValue(row.title) ?? url;
  return {
    title,
    url,
    description: stringValue(row.description) ?? stringValue(row.snippet),
  };
}

async function discoverNewsSitemaps(siteUrl: string, fetcher: FetchLike) {
  const root = new URL(siteUrl);
  const origin = root.origin;
  const robots = await fetchText(`${origin}/robots.txt`, fetcher);
  const fromRobots =
    robots
      ?.split(/\r?\n/u)
      .map((line) => line.match(/^\s*sitemap:\s*(\S+)/iu)?.[1])
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => sitemapPriority(b) - sitemapPriority(a)) ?? [];

  return uniqueStrings([
    ...fromRobots,
    `${origin}/sitemaps/news_sitemap.xml`,
    `${origin}/news_sitemap.xml`,
    `${origin}/sitemap-news.xml`,
    `${origin}/sitemap.xml`,
  ]).slice(0, 6);
}

async function fetchText(url: string, fetcher: FetchLike) {
  try {
    const response = await fetchWithTimeout(url, fetcher, {
      method: "GET",
      headers: { accept: "application/xml,text/xml,text/plain,*/*" },
    });
    if (!response.ok) return undefined;
    return await response.text();
  } catch {
    return undefined;
  }
}

function parseNewsSitemap(xml: string) {
  const rows: Array<{ url: string; title: string; description?: string }> = [];
  for (const block of xml.matchAll(/<url\b[\s\S]*?<\/url>/giu)) {
    const value = block[0];
    const url = decodeXml(xmlTag(value, "loc") ?? "");
    if (!url) continue;
    const title = decodeXml(xmlTag(value, "news:title") ?? xmlTag(value, "title") ?? url);
    const publishedAt = decodeXml(xmlTag(value, "news:publication_date") ?? "");
    rows.push({
      url,
      title,
      description: publishedAt ? `Published ${publishedAt}` : undefined,
    });
  }
  return rows;
}

function xmlTag(xml: string, tag: string) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}[^>]*>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*<\\/${escaped}>`, "iu"));
  return match?.[1]?.trim();
}

function decodeXml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .trim();
}

function matchesNewsTerm(values: Array<string | undefined>, term: string) {
  const normalizedTerm = normalizeSearchText(term);
  const relaxedTerm = normalizeSearchText(term.replace(/[«»"']/gu, " "));
  return values.some((value) => {
    const normalizedValue = normalizeSearchText(value ?? "");
    return normalizedValue.includes(normalizedTerm) || (relaxedTerm.length > 3 && normalizedValue.includes(relaxedTerm));
  });
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[ًٌٍَُِّْـ]/gu, "")
    .replace(/[إأآ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function sitemapPriority(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes("news")) return 3;
  if (lower.includes("sitemap")) return 1;
  return 0;
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function hostForSiteSearch(siteUrl: string) {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

function sameHostnameOrSubdomain(url: string, host: string) {
  try {
    const candidate = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return candidate === host || candidate.endsWith(`.${host}`);
  } catch {
    return false;
  }
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}

function firstString(values: unknown[] | undefined) {
  return values?.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim();
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanEnv(value: string | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeHandle(value: string | undefined) {
  if (!value) return undefined;
  return value.startsWith("@") ? value : `@${value}`;
}

function isoDate(value: string | undefined) {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function clipped(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}...` : value;
}

function sanitizeApifyError(value: string) {
  const token = cleanEnv(process.env.APIFY_API_TOKEN);
  const sanitized = token ? value.replaceAll(token, "[APIFY_TOKEN_HIDDEN]") : value;
  return sanitized.length > 500 ? `${sanitized.slice(0, 497)}...` : sanitized;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function numberToIso(value: number | undefined): string | undefined {
  if (!value) return undefined;
  const ms = value > 9999999999 ? value : value * 1000;
  try {
    return new Date(ms).toISOString();
  } catch {
    return undefined;
  }
}
