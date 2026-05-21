import Parser from "rss-parser";
import { canonicalizeUrl, explainKeywordMatch, makeDedupeKey, type IngestedItem } from "@/lib/connectors";
import { keywordRules } from "@/lib/mock-data";
import type { ItemState, KeywordRule, MonitoringItem, Sentiment, Source } from "@/lib/types";
import { isSafePublicHttpUrl } from "@/server/url-metadata";

type FetchLike = typeof fetch;

export type RssEntry = IngestedItem & {
  canonicalUrl: string;
  imageCandidates: string[];
  warnings: string[];
};

export type RssFeedPayload = {
  feedUrl: string;
  feedTitle?: string;
  entries: RssEntry[];
  warnings: string[];
};

type ParserItem = {
  title?: string;
  link?: string;
  guid?: string;
  id?: string;
  creator?: string;
  author?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  contentSnippet?: string;
  enclosure?: {
    url?: string;
  };
  dcCreator?: string;
  contentEncoded?: string;
  mediaContent?: string | Array<Record<string, unknown>> | Record<string, unknown>;
  mediaThumbnail?: string | Array<Record<string, unknown>> | Record<string, unknown>;
};

type ParserFeed = {
  title?: string;
  items?: ParserItem[];
};

export type RssIngestionItem = {
  item: MonitoringItem;
  rawResponse: Record<string, unknown>;
  canonicalUrl: string;
  canonicalUrlHashInput: string;
  sourceItemKeyInput: string;
  normalizedText: string;
};

export type RssRelevanceResult = {
  ok: boolean;
  score: number;
  reason: string;
  matchedTerms: string[];
};

export class RssIngestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RssIngestionError";
  }
}

const rssTimeoutMs = 8000;
const maxFeedBytes = 1024 * 1024;

const parser: Parser<ParserFeed, ParserItem> = new Parser({
  customFields: {
    item: [
      ["dc:creator", "dcCreator"],
      ["content:encoded", "contentEncoded"],
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
    ],
  },
});

export async function fetchRssFeed(feedUrl: string, fetcher: FetchLike = fetch): Promise<RssFeedPayload> {
  if (!isSafePublicHttpUrl(feedUrl)) {
    throw new RssIngestionError("feed_url must be a public http or https URL");
  }

  const response = await fetchWithTimeout(feedUrl, fetcher);
  if (!response.ok) {
    throw new RssIngestionError(`rss_fetch_failed:${response.status}`);
  }

  const xml = await readLimitedText(response, maxFeedBytes);
  return parseRssFeed(xml, feedUrl);
}

export async function parseRssFeed(xml: string, feedUrl: string): Promise<RssFeedPayload> {
  if (!xml.trim()) throw new RssIngestionError("rss_feed_empty");

  try {
    const feed = await parser.parseString(xml);
    const entries = (feed.items ?? []).map((item) => normalizeParserItem(item, feedUrl)).filter((item): item is RssEntry => Boolean(item));
    return {
      feedUrl,
      feedTitle: feed.title,
      entries,
      warnings: entries.length ? [] : ["rss_feed_without_items"],
    };
  } catch {
    throw new RssIngestionError("rss_parse_failed");
  }
}

export function buildRssIngestionItem(source: Source, entry: RssEntry, nowIso = new Date().toISOString(), rule: KeywordRule = keywordRules[0]): RssIngestionItem {
  const title = cleanText(entry.title) ?? "مادة مرصودة من RSS";
  const summary = cleanText(entry.text) ?? title;
  const publishedAt = isoDate(entry.publishedAt) ?? nowIso;
  const sourceItemKeyInput = `${source.id}:${entry.sourceItemId ?? entry.canonicalUrl}`;
  const dedupeKey = makeDedupeKey(
    {
      ...entry,
      sourceItemId: sourceItemKeyInput,
    },
    "rss",
  );
  const match = explainKeywordMatch(`${title} ${summary} ${entry.canonicalUrl}`, rule);
  const relevanceScore = match.score;
  const state = initialStateForSource(source);
  const sentiment = estimateSentiment(relevanceScore);
  const rawResponse = {
    extractor: {
      name: "rasd-rss-ingestion",
      version: "1.0",
    },
    canonicalUrl: entry.canonicalUrl,
    sourcePdf: "live-hidayathon",
    platform: "News",
    publishedDateText: publishedAt,
    extractedUrls: [entry.canonicalUrl],
    imageCandidates: entry.imageCandidates,
    warnings: entry.warnings,
    rss: {
      feedUrl: source.feedUrl,
      sourceId: source.id,
      sourceName: source.name,
      sourceCredibility: source.credibility,
      sourceItemId: entry.sourceItemId,
      raw: entry.raw,
    },
  };

  return {
    item: {
      id: crypto.randomUUID(),
      sourceId: source.id,
      sourceName: source.name,
      sourceType: "rss",
      state,
      title,
      originalUrl: entry.canonicalUrl,
      authorName: cleanText(entry.authorName) ?? source.name,
      authorHandle: cleanText(entry.authorHandle),
      publishedAt,
      summary,
      summarySourceText: summary,
      sentiment,
      sentimentConfidence: Math.max(50, Math.min(95, relevanceScore || 50)),
      relevanceScore,
      relevanceReason: match.reason,
      matchedTerms: match.matchedTerms,
      dedupeKey,
      hasReportGradeCapture: false,
      sourceItemId: sourceItemKeyInput,
      warning: entry.warnings.length ? entry.warnings.join(", ") : undefined,
    },
    rawResponse,
    canonicalUrl: entry.canonicalUrl,
    canonicalUrlHashInput: entry.canonicalUrl,
    sourceItemKeyInput,
    normalizedText: summary,
  };
}

export function evaluateRssEntryRelevance(entry: RssEntry, rule: KeywordRule = keywordRules[0]): RssRelevanceResult {
  const text = [entry.title, entry.text, entry.authorName, entry.canonicalUrl].filter(Boolean).join(" ");
  const match = explainKeywordMatch(text, rule);

  return {
    ok: match.score >= 35,
    score: match.score,
    reason: match.reason,
    matchedTerms: match.matchedTerms,
  };
}

function normalizeParserItem(item: ParserItem, feedUrl: string): RssEntry | null {
  const warnings: string[] = [];
  const link = cleanText(item.link);
  const fallbackId = cleanText(item.guid) ?? cleanText(item.id);
  const url = link ?? (fallbackId && isSafePublicHttpUrl(fallbackId) ? fallbackId : undefined);
  if (!url) return null;

  const canonicalUrl = canonicalizeUrl(url);
  const title = cleanText(item.title) ?? cleanText(item.contentSnippet) ?? canonicalUrl;
  const text = htmlToText(item.contentSnippet ?? item.content ?? item.contentEncoded ?? title);
  const publishedAt = isoDate(item.isoDate ?? item.pubDate);
  if (!publishedAt) warnings.push("missing_or_invalid_date");

  return {
    sourceItemId: cleanText(item.guid) ?? cleanText(item.id) ?? canonicalUrl,
    url: canonicalUrl,
    canonicalUrl,
    title,
    text,
    authorName: cleanText(item.creator) ?? cleanText(item.dcCreator) ?? cleanText(item.author),
    publishedAt: publishedAt ?? new Date(0).toISOString(),
    imageCandidates: imageCandidatesFromItem(item, feedUrl),
    raw: compactRawItem(item),
    warnings,
  };
}

async function fetchWithTimeout(feedUrl: string, fetcher: FetchLike) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), rssTimeoutMs);

  try {
    return await fetcher(feedUrl, {
      signal: controller.signal,
      headers: {
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
        "user-agent": "RASD-Media-Monitoring/1.0",
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new RssIngestionError("rss_fetch_timeout");
    }
    throw new RssIngestionError("rss_fetch_failed");
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedText(response: Response, maxBytes: number) {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new RssIngestionError("rss_feed_too_large");
  }
  return text;
}

function imageCandidatesFromItem(item: ParserItem, feedUrl: string) {
  const candidates = [
    item.enclosure?.url,
    ...mediaUrls(item.mediaContent),
    ...mediaUrls(item.mediaThumbnail),
    ...htmlImageUrls(item.contentEncoded ?? item.content ?? ""),
  ];

  return Array.from(new Set(candidates.map((value) => absolutizeUrl(value, feedUrl)).filter((value): value is string => Boolean(value && isSafePublicHttpUrl(value)))));
}

function mediaUrls(value: ParserItem["mediaContent"]) {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.map((entry) => stringProperty(entry, "$.url") ?? stringProperty(entry, "url")).filter(Boolean);
  return [stringProperty(value, "$.url") ?? stringProperty(value, "url")].filter(Boolean);
}

function htmlImageUrls(value: string) {
  return [...value.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/giu)].map((match) => match[1]);
}

function stringProperty(value: Record<string, unknown>, key: string) {
  const direct = value[key];
  if (typeof direct === "string") return direct;
  if (key.startsWith("$.")) {
    const nested = value.$;
    const nestedValue = nested && typeof nested === "object" ? (nested as Record<string, unknown>)[key.slice(2)] : undefined;
    if (typeof nestedValue === "string") return nestedValue;
  }
  return undefined;
}

function absolutizeUrl(value: string | undefined, baseUrl: string) {
  if (!value) return undefined;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function compactRawItem(item: ParserItem) {
  return {
    guid: item.guid,
    id: item.id,
    link: item.link,
    title: item.title,
    pubDate: item.pubDate,
    isoDate: item.isoDate,
    author: item.creator ?? item.dcCreator ?? item.author,
    enclosureUrl: item.enclosure?.url,
  };
}

function initialStateForSource(source: Source): ItemState {
  if (source.credibility === "official" || source.credibility === "media") return "needs_review";
  return "candidate";
}

function estimateSentiment(score: number): Sentiment {
  if (score <= 30) return "negative";
  if (score < 40) return "neutral";
  return "positive";
}

function cleanText(value: string | null | undefined) {
  if (typeof value !== "string") return undefined;
  return htmlToText(value).trim() || undefined;
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
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}
