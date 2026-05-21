import { isIP } from "node:net";

export type UrlMetadata = {
  title?: string;
  text?: string;
  authorName?: string;
  authorHandle?: string;
  publishedAt?: string;
  platform: "X" | "Website" | "Unknown";
  source: "x_oembed" | "html_metadata" | "url_only";
  warning?: string;
};

type FetchLike = typeof fetch;

const metadataTimeoutMs = 6000;

export async function fetchUrlMetadata(url: string, fetcher: FetchLike = fetch): Promise<UrlMetadata> {
  const platform = platformFromUrl(url);

  if (!isSafePublicHttpUrl(url)) {
    return {
      platform,
      source: "url_only",
      warning: "url_not_public",
    };
  }

  try {
    if (platform === "X" && isXPostUrl(url)) {
      return await fetchXMetadata(url, fetcher);
    }

    return await fetchHtmlMetadata(url, fetcher);
  } catch (error) {
    return {
      platform,
      source: "url_only",
      warning: error instanceof Error ? error.message : "metadata_fetch_failed",
    };
  }
}

export function platformFromUrl(value: string): UrlMetadata["platform"] {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com")) {
      return "X";
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

function canonicalizeXUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.protocol = "https:";
    parsed.hostname = "x.com";
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

async function fetchXMetadata(url: string, fetcher: FetchLike): Promise<UrlMetadata> {
  const canonicalUrl = canonicalizeXUrl(url);
  const endpoint = `https://publish.twitter.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(canonicalUrl)}`;
  const response = await fetchWithTimeout(endpoint, fetcher, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) throw new Error("x_metadata_unavailable");

  const data = (await response.json()) as {
    author_name?: string;
    author_url?: string;
    html?: string;
  };
  const html = data.html ?? "";
  const tweetText = textFromFirstParagraph(html);
  const authorHandle = handleFromXAuthorUrl(data.author_url) ?? handleFromText(html);
  const title = tweetText ? clipped(tweetText, 110) : data.author_name ? `تغريدة من ${data.author_name}` : "تغريدة X";

  return {
    title,
    text: tweetText || title,
    authorName: cleanText(data.author_name),
    authorHandle,
    publishedAt: publishedAtFromXEmbed(html),
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

  const html = await response.text();
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
  const publishedAt = isoDate(
    firstPresent(
      metaContent(html, "property", "article:published_time"),
      metaContent(html, "name", "date"),
      metaContent(html, "name", "pubdate"),
    ),
  );

  return {
    title: title ?? "مادة مرصودة من رابط",
    text: description ?? title ?? url,
    authorName,
    publishedAt,
    platform: "Website",
    source: "html_metadata",
  };
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

function textFromFirstParagraph(html: string) {
  const match = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/iu);
  if (!match) return null;
  return htmlToText(match[1]);
}

function tagContent(html: string, tagName: string) {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "iu"));
  return match ? htmlToText(match[1]) : null;
}

function metaContent(html: string, attr: "name" | "property", value: string) {
  const escaped = escapeRegex(value);
  const pattern = new RegExp(
    `<meta\\b(?=[^>]*\\b${attr}=["']${escaped}["'])(?=[^>]*\\bcontent=["']([^"']*)["'])[^>]*>`,
    "iu",
  );
  const match = html.match(pattern);
  return match ? decodeHtml(match[1]).trim() || null : null;
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

function handleFromXAuthorUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const firstSegment = new URL(value).pathname.split("/").filter(Boolean)[0];
    return firstSegment ? `@${firstSegment}` : undefined;
  } catch {
    return undefined;
  }
}

function handleFromText(value: string) {
  const match = value.match(/@[\p{L}\p{N}_]+/u);
  return match?.[0];
}

function publishedAtFromXEmbed(value: string) {
  const anchorText = [...value.matchAll(/<a\b[^>]*>([^<]+)<\/a>/giu)].at(-1)?.[1];
  return isoDate(anchorText ? decodeHtml(anchorText) : null);
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

function englishMonthNumber(value: string) {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const index = months.indexOf(value.slice(0, 3).toLowerCase());
  return index >= 0 ? index : null;
}

function cleanText(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
