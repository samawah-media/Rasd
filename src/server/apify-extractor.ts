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

type SocialPlatform = Extract<ExtractionResult["platform"], "TikTok" | "Instagram">;
type FetchLike = typeof fetch;

const apifyTimeoutMs = 30_000;
const tiktokActorId = "clockworks/free-tiktok-scraper";
const instagramActorId = "apify/instagram-post-scraper";

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
    const metadata = mapInstagramItem(firstItem, url);
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

  console.log(`[Apify:TikTok] Running primary actor: ${primaryActor}`);

  const payload = {
    postURLs: [url],
    resultsPerPage: 1,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  };

  const primaryResult = await runActor(primaryActor, payload, token, fetcher);
  const primaryItem = firstObject(primaryResult.items);
  const primaryMetadata = primaryItem ? mapTikTokItem(primaryItem, url) : null;

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

  // Fallback mode if primary actor yielded empty or textless metadata
  console.log(`[Apify:TikTok] Primary actor returned incomplete result. Running fallback actor: ${fallbackActor}`);

  const fallbackResult = await runActor(fallbackActor, payload, token, fetcher);
  const fallbackItem = firstObject(fallbackResult.items);
  const fallbackMetadata = fallbackItem ? mapTikTokItem(fallbackItem, url) : null;

  if (fallbackMetadata) {
    console.log(`[Apify:TikTok] Fallback actor succeeded.`);
    return {
      metadata: fallbackMetadata,
      rawResponse: fallbackItem,
    };
  }

  if (primaryMetadata) {
    console.log(`[Apify:TikTok] Fallback actor also failed. Returning primary partial metadata.`);
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

function mapTikTokItem(item: Record<string, unknown>, inputUrl: string): ExtractionResult | null {
  const authorMeta = objectValue(item.authorMeta);
  const videoMeta = objectValue(item.videoMeta);
  const shareMeta = objectValue(item.shareMeta);
  const author = objectValue(item.author);

  // Log top-level response keys for diagnostics
  console.log(`[Apify:TikTok] Response keys: ${Object.keys(item).join(", ")}`);

  // Log availability of text fields to check where captions are placed
  const textCheck = {
    text: !!item.text,
    desc: !!item.desc,
    description: !!item.description,
    content_desc: !!item.content_desc,
    caption: !!item.caption,
    shareMetaDesc: !!shareMeta?.desc,
    shareMetaTitle: !!shareMeta?.title,
    title: !!item.title,
  };
  console.log(`[Apify:TikTok] Text fields check:`, textCheck);

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

function mapInstagramItem(item: Record<string, unknown>, inputUrl: string): ExtractionResult | null {
  const caption = stringValue(item.caption) ?? stringValue(item.alt) ?? stringValue(item.description);
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
