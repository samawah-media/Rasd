import { isIP } from "node:net";
import { XProviderManager } from "../lib/x/manager";
import { parseXUrl } from "../lib/x/parser";
import { extractWithApify, isApifyConfigured } from "./apify-extractor";
import { extractMediaMetadataWithYtDlp, type YtDlpRunner } from "./media-metadata-extractor";

export type ExtractionResult = {
  title?: string;
  text?: string;
  authorName?: string;
  authorHandle?: string;
  publisherName?: string;
  siteName?: string;
  publishedAt?: string;
  canonicalUrl?: string;
  imageUrl?: string;
  platform: "X" | "TikTok" | "Instagram" | "Website" | "Unknown";
  source: "x_oembed" | "yt_dlp_metadata" | "apify_metadata" | "html_metadata" | "url_only";
  readabilityUsed?: boolean;
  warnings?: string[];
  warning?: string;
  warningDetail?: string;
};

export type UrlMetadata = ExtractionResult;

type FetchLike = typeof fetch;

type FetchUrlMetadataOptions = {
  ytdlpRunner?: YtDlpRunner;
  apifyFetcher?: FetchLike;
};

const metadataTimeoutMs = 6000;
const maxHtmlExtractionChars = 1_000_000;
const maxReadabilityChars = 500_000;
const readabilityTimeoutMs = 2500;
const minReadableTextLength = 80;

export function isGenericTitle(title: string | undefined, platform: string): boolean {
  if (!title) return true;
  const t = title.trim();
  const lower = t.toLowerCase();

  if (platform === "TikTok" || platform === "Instagram" || platform === "X") {
    const denylist = [
      "tiktok - make your day",
      "tiktok",
      "tiktok video",
      "instagram",
      "instagram post",
      "instagram photo",
      "instagram video",
      "log in • instagram",
      "login • instagram",
    ];
    if (denylist.includes(lower)) return true;
    if (lower.includes("login") || lower.includes("make your day")) return true;
  }
  return false;
}

export async function fetchUrlMetadata(url: string, fetcher: FetchLike = fetch, options: FetchUrlMetadataOptions = {}): Promise<UrlMetadata> {
  const platform = platformFromUrl(url);

  if (!isSafePublicHttpUrl(url)) {
    return {
      platform,
      source: "url_only",
      warning: "url_not_public",
      warnings: ["url_not_public"],
    };
  }

  try {
    if (platform === "X" && isXPostUrl(url)) {
      return await fetchXMetadata(url, fetcher);
    }

    if (platform === "TikTok" || platform === "Instagram") {
      const ytdlpResult = await fetchYtDlpMetadata(url, platform, options.ytdlpRunner);
      if (ytdlpResult.metadata) {
        return ytdlpResult.metadata;
      }

      let apifyError: string | undefined;
      if (process.env.MEDIA_METADATA_EXTRACTOR !== "off" && isApifyConfigured()) {
        const apifyResult = await extractWithApify(url, platform, options.apifyFetcher ?? fetcher);
        if (apifyResult.metadata) {
          if (!isGenericTitle(apifyResult.metadata.title, platform)) {
            return apifyResult.metadata;
          }
          if (apifyResult.metadata.imageUrl) {
            const fallbackTitle = platform === "TikTok"
              ? "تعذر جلب تفاصيل فيديو تيك توك"
              : "تعذر جلب تفاصيل منشور إنستغرام";
            return {
              ...apifyResult.metadata,
              title: fallbackTitle,
              text: apifyResult.metadata.text ?? fallbackTitle,
              warning: "partial_metadata",
              warningDetail: "Image available but caption could not be extracted",
              warnings: ["partial_metadata"],
            };
          }
        }
        let errorMsg = apifyResult.error ?? "apify_metadata_unavailable";
        if (apifyResult.rawResponse) {
          const rawKeys = Object.keys(apifyResult.rawResponse).join(", ");
          errorMsg += ` | response_keys: ${rawKeys}`;
        }
        apifyError = errorMsg;
      }

      let htmlMetadata: UrlMetadata | null = null;
      let htmlError: string | undefined;
      try {
        htmlMetadata = await fetchHtmlMetadata(url, fetcher);
        if (htmlMetadata && isGenericTitle(htmlMetadata.title, platform)) {
          htmlError = `HTML scraping returned a generic/denylisted title: "${htmlMetadata.title}"`;
          htmlMetadata = null;
        }
      } catch (err) {
        htmlError = err instanceof Error ? err.message : String(err);
      }

      if (htmlMetadata) {
        return htmlMetadata;
      }

      const warningDetail = [
        `yt-dlp error: ${ytdlpResult.error || "unknown"}`,
        ytdlpResult.stderr ? `stderr: ${ytdlpResult.stderr}` : null,
        apifyError ? `Apify error: ${apifyError}` : null,
        htmlError ? `HTML backup error: ${htmlError}` : null,
      ].filter(Boolean).join(" | ");

      const arTitle = platform === "TikTok"
        ? "تعذر جلب تفاصيل فيديو تيك توك"
        : "تعذر جلب تفاصيل منشور إنستغرام";

      return {
        title: arTitle,
        text: `تعذر جلب تفاصيل الرابط بشكل كامل من ${platform}. الرابط: ${url}`,
        platform,
        source: "url_only",
        warning: "media_metadata_unavailable",
        warnings: ["media_metadata_unavailable"],
        warningDetail: warningDetail.slice(0, 2000),
      };
    }

    return await fetchHtmlMetadata(url, fetcher);
  } catch (error) {
    return {
      platform,
      source: "url_only",
      warning: error instanceof Error ? error.message : "metadata_fetch_failed",
      warnings: [error instanceof Error ? error.message : "metadata_fetch_failed"],
    };
  }
}

async function fetchYtDlpMetadata(
  url: string,
  platform: Extract<UrlMetadata["platform"], "TikTok" | "Instagram">,
  runner?: YtDlpRunner,
): Promise<{ metadata: UrlMetadata | null; error?: string; stderr?: string }> {
  try {
    const result = await extractMediaMetadataWithYtDlp(url, runner);
    if (!result.metadata) {
      return {
        metadata: null,
        error: result.error || "yt-dlp failed",
        stderr: result.stderr,
      };
    }
    const media = result.metadata;
    if (isGenericTitle(media.title, platform)) {
      return {
        metadata: null,
        error: "yt_dlp_returned_generic_title",
        stderr: `Title: "${media.title}" matches denylist. Description: ${media.description || "none"}`,
      };
    }

    const canonicalUrl = firstSafePublicUrl(media.webpageUrl, url);
    const imageUrl = firstSafePublicUrl(media.thumbnail, url);
    const text = cleanText(media.description) ?? cleanText(media.title);
    const publishedAt = media.timestamp
      ? new Date(media.timestamp * 1000).toISOString()
      : isoUploadDate(media.uploadDate);

    return {
      metadata: {
        title: cleanText(media.title) ?? text ?? "Media item",
        text,
        authorName: cleanText(media.uploader),
        authorHandle: normalizeHandle(media.uploaderId),
        publishedAt: publishedAt ?? new Date().toISOString(),
        canonicalUrl,
        imageUrl,
        platform: canonicalUrl ? platformFromUrl(canonicalUrl) : platform,
        source: "yt_dlp_metadata",
      }
    };
  } catch (err) {
    return {
      metadata: null,
      error: "yt_dlp_extraction_exception",
      stderr: err instanceof Error ? err.message : String(err),
    };
  }
}

export function platformFromUrl(value: string): UrlMetadata["platform"] {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com")) {
      return "X";
    }
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      return "TikTok";
    }
    if (host === "instagram.com" || host === "instagr.am" || host.endsWith(".instagram.com")) {
      return "Instagram";
    }
    return "Website";
  } catch {
    return "Unknown";
  }
}

export function isSafePublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    return isPublicHostname(url.hostname);
  } catch {
    return false;
  }
}

function isPublicHostname(value: string) {
  const host = value.replace(/^\[/u, "").replace(/\]$/u, "").toLowerCase();
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;

  const ipVersion = isIP(host);
  if (ipVersion === 4) return isPublicIpv4(host);
  if (ipVersion === 6) return isPublicIpv6(host);
  return true;
}

function isPublicIpv4(host: string) {
  const [a = 0, b = 0, c = 0] = host.split(".").map((part) => Number(part));

  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;

  return true;
}

function isPublicIpv6(host: string) {
  if (host === "::" || host === "::1") return false;
  if (host.startsWith("::ffff:")) return false;
  if (host.startsWith("fc") || host.startsWith("fd")) return false;
  if (host.startsWith("fe80:")) return false;
  return true;
}

function isXPostUrl(value: string) {
  try {
    const url = new URL(value);
    return /\/status\/\d+/u.test(url.pathname);
  } catch {
    return false;
  }
}



async function fetchXMetadata(url: string, fetcher: FetchLike): Promise<UrlMetadata> {
  const parsedX = parseXUrl(url);
  if (!parsedX) {
    throw new Error("x_url_invalid");
  }

  const manager = new XProviderManager();
  const post = await manager.fetchPost(parsedX.tweetId, fetcher as typeof fetch);

  if (!post) {
    throw new Error("x_metadata_unavailable");
  }

  const title = post.text
    ? clipped(post.text, 110)
    : post.authorName
    ? `تغريدة من ${post.authorName}`
    : "تغريدة X";

  return {
    title,
    text: post.text || title,
    authorName: cleanText(post.authorName),
    authorHandle: post.authorHandle,
    publishedAt: post.publishedAt,
    canonicalUrl: post.originalUrl,
    imageUrl: post.mediaUrls?.[0],
    platform: "X",
    source: "x_oembed",
  };
}

async function fetchHtmlMetadata(url: string, fetcher: FetchLike): Promise<UrlMetadata> {
  const response = await fetchWithTimeout(url, fetcher, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "RASD-Media-Monitoring/1.0",
    },
  });

  if (!response.ok) throw new Error("page_metadata_unavailable");

  const rawHtml = await response.text();
  const warnings: string[] = [];
  const html =
    rawHtml.length > maxHtmlExtractionChars
      ? rawHtml.slice(0, maxHtmlExtractionChars)
      : rawHtml;
  if (rawHtml.length > maxHtmlExtractionChars) warnings.push("html_truncated_for_extraction");
  const title = firstPresent(
    metaContent(html, "property", "og:title"),
    metaContent(html, "name", "twitter:title"),
    tagContent(html, "title"),
  );
  const description = firstPresent(
    metaContent(html, "property", "og:description"),
    metaContent(html, "name", "description"),
    metaContent(html, "name", "twitter:description"),
  );
  const authorName = firstPresent(
    metaContent(html, "name", "author"),
    metaContent(html, "property", "article:author"),
    metaContent(html, "name", "twitter:creator"),
  );
  const siteName = cleanText(
    firstPresent(
      metaContent(html, "property", "og:site_name"),
      metaContent(html, "name", "application-name"),
      metaContent(html, "name", "twitter:site"),
    ),
  );
  const shouldUseReadability = !title || !description;
  const readableArticle = shouldUseReadability ? await extractReadableArticle(html, url, warnings) : null;
  const readableText = readableArticle?.textContent ? clipped(readableArticle.textContent, 900) : undefined;
  const readableSiteName = cleanText(readableArticle?.siteName);
  const publisherName = siteName ?? readableSiteName ?? publisherNameFromUrl(url);
  const publishedAt = isoDate(
    firstPresent(
      metaContent(html, "property", "article:published_time"),
      metaContent(html, "property", "og:published_time"),
      metaContent(html, "name", "date"),
      metaContent(html, "name", "pubdate"),
      metaContent(html, "name", "publishdate"),
      metaContent(html, "name", "DC.date.issued"),
      metaContent(html, "itemprop", "datePublished"),
    ),
  );
  const canonicalUrl = firstSafePublicUrl(linkHref(html, "canonical"), url);
  const imageUrl = firstSafePublicUrl(
    firstPresent(
      metaContent(html, "property", "og:image"),
      metaContent(html, "name", "twitter:image"),
      metaContent(html, "property", "twitter:image"),
    ),
    url,
  );

  return {
    title: title ?? cleanText(readableArticle?.title) ?? "مادة مرصودة من رابط",
    text: description ?? cleanText(readableArticle?.excerpt) ?? readableText ?? title ?? url,
    authorName: authorName ?? cleanText(readableArticle?.byline) ?? publisherName,
    publisherName,
    siteName: siteName ?? readableSiteName,
    publishedAt,
    canonicalUrl,
    imageUrl,
    platform: platformFromUrl(canonicalUrl ?? url),
    source: "html_metadata",
    readabilityUsed: Boolean(readableArticle),
    warnings: warnings.length ? warnings : undefined,
  };
}

type ReadableArticle = {
  title?: string | null;
  byline?: string | null;
  siteName?: string | null;
  excerpt?: string | null;
  textContent?: string | null;
};

async function extractReadableArticle(html: string, url: string, warnings: string[]) {
  if (html.length > maxReadabilityChars) {
    warnings.push("readability_skipped_html_too_large");
    return null;
  }

  try {
    const article = await withTimeout(async () => {
      const [{ Readability }, { JSDOM }] = await Promise.all([
        import("@mozilla/readability"),
        import("jsdom"),
      ]);
      const dom = new JSDOM(html, { url });

      try {
        return new Readability(dom.window.document).parse() as ReadableArticle | null;
      } finally {
        dom.window.close();
      }
    }, readabilityTimeoutMs);
    const textContent = cleanText(article?.textContent);

    if (!article || !textContent || textContent.length < minReadableTextLength) return null;

    return {
      title: cleanText(article.title),
      byline: cleanText(article.byline),
      siteName: cleanText(article.siteName),
      excerpt: cleanText(article.excerpt),
      textContent,
    };
  } catch {
    warnings.push("readability_failed");
    return null;
  }
}

async function withTimeout<T>(run: () => Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("operation_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function fetchWithTimeout(input: string, fetcher: FetchLike, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), metadataTimeoutMs);

  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}



function tagContent(html: string, tagName: string) {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "iu"));
  return match ? htmlToText(match[1]) : null;
}

function metaContent(html: string, attr: "name" | "property" | "itemprop", value: string) {
  const escaped = escapeRegex(value);
  const pattern = new RegExp(
    `<meta\\b(?=[^>]*\\b${attr}=["']${escaped}["'])(?=[^>]*\\bcontent=["']([^"']*)["'])[^>]*>`,
    "iu",
  );
  const match = html.match(pattern);
  return match ? decodeHtml(match[1]).trim() || null : null;
}

function linkHref(html: string, rel: string) {
  const escaped = escapeRegex(rel);
  const pattern = new RegExp(
    `<link\\b(?=[^>]*\\brel=["'][^"']*\\b${escaped}\\b[^"']*["'])(?=[^>]*\\bhref=["']([^"']*)["'])[^>]*>`,
    "iu",
  );
  const match = html.match(pattern);
  return match ? decodeHtml(match[1]).trim() || null : null;
}

function firstSafePublicUrl(value: string | null | undefined, baseUrl: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value, baseUrl).toString();
    return isSafePublicHttpUrl(url) ? url : undefined;
  } catch {
    return undefined;
  }
}

function htmlToText(value: string) {
  return decodeHtml(value.replace(/<br\s*\/?>/giu, "\n").replace(/<[^>]+>/gu, " "))
    .replace(/\s+/gu, " ")
    .trim();
}

function decodeHtml(value: string) {
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



function isoDate(value: string | null | undefined) {
  if (!value) return undefined;
  const englishDate = value.trim().match(/^([a-z]+)\s+(\d{1,2}),\s+(\d{4})$/iu);
  if (englishDate) {
    const month = englishMonthNumber(englishDate[1]);
    if (month !== null) {
      return new Date(Date.UTC(Number(englishDate[3]), month, Number(englishDate[2]))).toISOString();
    }
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function isoUploadDate(value: string | null | undefined) {
  if (!value || !/^\d{8}$/u.test(value)) return undefined;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  return new Date(Date.UTC(year, month, day)).toISOString();
}

function normalizeHandle(value: string | null | undefined) {
  const cleaned = cleanText(value);
  if (!cleaned) return undefined;
  return cleaned.startsWith("@") ? cleaned : `@${cleaned}`;
}

function englishMonthNumber(value: string) {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const index = months.indexOf(value.slice(0, 3).toLowerCase());
  return index >= 0 ? index : null;
}

function cleanText(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function publisherNameFromUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./u, "").toLowerCase();
    const ignoredLabels = new Set([
      "com",
      "net",
      "org",
      "gov",
      "edu",
      "co",
      "news",
      "sa",
      "ae",
      "qa",
      "kw",
      "bh",
      "om",
    ]);
    const label = hostname
      .split(".")
      .filter((part) => part && !ignoredLabels.has(part))
      .at(-1);

    return label ? titleCaseDomainLabel(label) : hostname;
  } catch {
    return undefined;
  }
}

function titleCaseDomainLabel(value: string) {
  return value
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function clipped(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}…` : value;
}

function firstPresent(...values: Array<string | null | undefined>) {
  return values.find((value): value is string => Boolean(value?.trim()));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function getInstagramPostId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("instagram.com") && host !== "instagr.am") {
      return null;
    }
    const match = parsed.pathname.match(/\/(?:p|reel|reels)\/([\w-]+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function getTikTokVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("tiktok.com")) {
      return null;
    }
    const match = parsed.pathname.match(/\/video\/(\d+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function resolveScreenshotUrl(
  url: string | undefined | null,
  platform: string,
  metadataImageUrl: string | undefined | null,
  defaultKind: "evidence_lite" | "preview" | "report_grade" = "evidence_lite"
): { url: string; kind: "evidence_lite" | "preview" | "report_grade" } | null {
  if (metadataImageUrl && isSafePublicHttpUrl(metadataImageUrl)) {
    return { url: metadataImageUrl, kind: "preview" };
  }

  if (platform === "TikTok" && url) {
    const videoId = getTikTokVideoId(url);
    if (videoId) {
      const embedUrl = `https://www.tiktok.com/embed/${videoId}`;
      const screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(embedUrl)}&screenshot=true&embed=screenshot.url&waitForTimeout=3000`;
      return { url: screenshotUrl, kind: "preview" };
    }
  }

  if (platform === "Instagram" && url) {
    const postId = getInstagramPostId(url);
    if (postId) {
      const embedUrl = `https://www.instagram.com/p/${postId}/embed/captioned/`;
      const screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(embedUrl)}&screenshot=true&embed=screenshot.url&waitForTimeout=3000`;
      return { url: screenshotUrl, kind: "preview" };
    }
  }

  if (url && isSafePublicHttpUrl(url)) {
    const screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&embed=screenshot.url`;
    return { url: screenshotUrl, kind: defaultKind };
  }

  return null;
}

