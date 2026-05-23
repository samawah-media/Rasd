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

export async function extractWithApify(
  url: string,
  platform: SocialPlatform,
  fetcher: FetchLike = fetch,
): Promise<ApifyExtractionResult> {
  const token = cleanEnv(process.env.APIFY_API_TOKEN);
  if (!token) return { metadata: null, error: "apify_not_configured" };

  const actorId = platform === "TikTok" ? tiktokActorId : instagramActorId;
  const endpoint = new URL(`https://api.apify.com/v2/acts/${actorId.replace("/", "~")}/run-sync-get-dataset-items`);
  endpoint.searchParams.set("token", token);
  endpoint.searchParams.set("timeout", String(Math.trunc(apifyTimeoutMs / 1000)));

  try {
    const response = await fetchWithTimeout(endpoint.toString(), fetcher, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(platform === "TikTok" ? { postURLs: [url] } : { directUrls: [url] }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        metadata: null,
        error: sanitizeApifyError(`apify_http_${response.status}: ${body}`),
      };
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    const items = Array.isArray(payload) ? payload : [];
    const firstItem = firstObject(items);
    if (!firstItem) return { metadata: null, error: "apify_empty_dataset" };

    const metadata = platform === "TikTok"
      ? mapTikTokItem(firstItem, url)
      : mapInstagramItem(firstItem, url);

    return {
      metadata,
      rawResponse: firstItem,
      error: metadata ? undefined : "apify_metadata_unusable",
    };
  } catch (error) {
    return {
      metadata: null,
      error: sanitizeApifyError(error instanceof Error ? error.message : String(error)),
    };
  }
}

function mapTikTokItem(item: Record<string, unknown>, inputUrl: string): ExtractionResult | null {
  const authorMeta = objectValue(item.authorMeta);
  const videoMeta = objectValue(item.videoMeta);
  const text = stringValue(item.text) ?? stringValue(item.desc) ?? stringValue(item.description);
  const title = clipped(text ?? stringValue(item.title) ?? "TikTok video", 110);
  const imageUrl =
    stringValue(videoMeta?.coverUrl) ??
    stringValue(videoMeta?.originalCoverUrl) ??
    stringValue(videoMeta?.dynamicCoverUrl) ??
    stringValue(item.thumbnail);
  const canonicalUrl = stringValue(item.webVideoUrl) ?? stringValue(item.url) ?? inputUrl;

  if (!text && !imageUrl && !stringValue(authorMeta?.name)) return null;

  return {
    title,
    text: text ?? title,
    authorName: stringValue(authorMeta?.nickName) ?? stringValue(authorMeta?.name),
    authorHandle: normalizeHandle(stringValue(authorMeta?.name)),
    publishedAt: isoDate(stringValue(item.createTimeISO) ?? stringValue(item.createTime)),
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
