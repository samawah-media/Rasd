import type { IngestedItem } from "@/lib/connectors";
import type { SourceRule } from "@/lib/types";
import {
  instagramActorId,
  mapApifyInstagramItem,
  mapApifyTikTokItem,
  runApifyActorDatasetItems,
  tiktokActorId,
} from "@/server/apify-extractor";

type FetchLike = typeof fetch;

export function getApifyAutoMaxItems() {
  const parsed = Number(process.env.APIFY_SOCIAL_MAX_ITEMS ?? process.env.SOCIAL_AUTO_MAX_ITEMS ?? 5);
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(25, Math.trunc(parsed)));
}

export function hasApifyToken() {
  return Boolean(process.env.APIFY_API_TOKEN?.trim());
}

export async function fetchTikTokWatchlistWithApify(rule: SourceRule, fetcher: FetchLike = fetch): Promise<IngestedItem[]> {
  if (!hasApifyToken()) return [];
  const input = buildTikTokInput(rule);
  const result = await runApifyActorDatasetItems(process.env.APIFY_TIKTOK_AUTO_ACTOR || tiktokActorId, input, fetcher);
  if (result.error) throw new Error(`apify_tiktok_fetch_failed:${result.error}`);

  return result.items
    .map((item) => toObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const metadata = mapApifyTikTokItem(item, rule.url || "https://www.tiktok.com");
      return metadata ? toIngestedItem(metadata, item, "tiktok_research") : null;
    })
    .filter((item): item is IngestedItem => Boolean(item))
    .filter((item) => isNewerThanCursor(item, rule.cursor));
}

export async function fetchInstagramWatchlistWithApify(rule: SourceRule, fetcher: FetchLike = fetch): Promise<IngestedItem[]> {
  if (!hasApifyToken()) return [];
  const input = buildInstagramInput(rule);
  const result = await runApifyActorDatasetItems(process.env.APIFY_INSTAGRAM_AUTO_ACTOR || instagramActorId, input, fetcher);
  if (result.error) throw new Error(`apify_instagram_fetch_failed:${result.error}`);

  return result.items
    .map((item) => toObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const metadata = mapApifyInstagramItem(item, rule.url || "https://instagram.com");
      return metadata ? toIngestedItem(metadata, item, "instagram_public_profile") : null;
    })
    .filter((item): item is IngestedItem => Boolean(item))
    .filter((item) => isNewerThanCursor(item, rule.cursor));
}

function buildTikTokInput(rule: SourceRule) {
  const maxItems = getApifyAutoMaxItems();
  const base = {
    resultsPerPage: maxItems,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadSubtitles: false,
    shouldDownloadVideos: false,
  };

  if (rule.url) {
    return isTikTokVideoUrl(rule.url)
      ? { ...base, postURLs: [rule.url] }
      : { ...base, profiles: [rule.url] };
  }

  const query = (rule.query || "").trim();
  if (query.startsWith("#")) return { ...base, hashtags: [query.slice(1)] };
  return { ...base, search: [query || "هداية"] };
}

function buildInstagramInput(rule: SourceRule) {
  const maxItems = getApifyAutoMaxItems();
  const username = instagramUsernameFromRule(rule);
  return {
    username: [username],
    resultsLimit: maxItems,
    skipPinnedPosts: true,
    dataDetailLevel: "basicData",
  };
}

function instagramUsernameFromRule(rule: SourceRule) {
  const raw = (rule.url || rule.query || "").trim();
  if (!raw) return "instagram";
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./u, "").toLowerCase();
    if (host === "instagram.com" || host === "instagr.am") {
      const segment = url.pathname.split("/").filter(Boolean)[0];
      if (segment) return segment.replace(/^@/u, "");
    }
  } catch {
    // Fall through to handle-like input.
  }
  return raw.replace(/^https?:\/\/(?:www\.)?instagram\.com\//iu, "").split(/[/?#]/u)[0]?.replace(/^@/u, "") || raw.replace(/^@/u, "");
}

function toIngestedItem(
  metadata: NonNullable<ReturnType<typeof mapApifyTikTokItem> | ReturnType<typeof mapApifyInstagramItem>>,
  raw: Record<string, unknown>,
  sourceType: "tiktok_research" | "instagram_public_profile",
): IngestedItem {
  const sourceItemId = stringValue(raw.id) ?? stringValue(raw.shortCode) ?? videoIdFromUrl(metadata.canonicalUrl);
  return {
    sourceItemId,
    url: metadata.canonicalUrl || sourceItemIdToUrl(sourceItemId, metadata.authorHandle, sourceType),
    title: metadata.title || metadata.text || "مادة مرصودة تلقائيًا",
    text: metadata.text || metadata.title || "",
    authorName: metadata.authorName,
    authorHandle: metadata.authorHandle,
    publishedAt: metadata.publishedAt || new Date().toISOString(),
    imageUrl: metadata.imageUrl,
    raw: {
      provider: "apify",
      metadataSource: metadata.source,
      imageUrl: metadata.imageUrl,
      item: raw,
    },
  };
}

function isNewerThanCursor(item: IngestedItem, cursor: Record<string, unknown> | null) {
  const lastPublishedAt = typeof cursor?.lastPublishedAt === "string" ? Date.parse(cursor.lastPublishedAt) : NaN;
  if (Number.isNaN(lastPublishedAt)) return true;
  return Date.parse(item.publishedAt) > lastPublishedAt;
}

function toObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isTikTokVideoUrl(value: string) {
  return /\/video\/\d+/u.test(value);
}

function videoIdFromUrl(value: string | undefined) {
  if (!value) return undefined;
  return value.match(/\/video\/(\d+)/u)?.[1] ?? value.match(/\/(?:p|reel|tv)\/([^/?#]+)/u)?.[1];
}

function sourceItemIdToUrl(
  sourceItemId: string | undefined,
  handle: string | undefined,
  sourceType: "tiktok_research" | "instagram_public_profile",
) {
  if (sourceType === "instagram_public_profile" && sourceItemId) return `https://instagram.com/p/${sourceItemId}`;
  const cleanHandle = handle?.replace(/^@/u, "") || "unknown";
  return sourceItemId ? `https://www.tiktok.com/@${cleanHandle}/video/${sourceItemId}` : `https://www.tiktok.com/@${cleanHandle}`;
}
