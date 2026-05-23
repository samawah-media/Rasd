import { getImportedReportsDataset } from "@/lib/imported-reports";

export type LegacyKeywordSuggestions = {
  requiredTerms: string[];
  optionalTerms: string[];
  excludeTerms: string[];
  hashtags: string[];
};

export type LegacySourceRecommendation = {
  id: string;
  kind: "news" | "x_account" | "instagram_profile" | "tiktok_profile" | "tiktok_query";
  label: string;
  url?: string;
  query?: string;
  count: number;
  sampleUrls: string[];
  sampleTitles: string[];
};

export type LegacySourceIntelligence = {
  summary: {
    reports: number;
    items: number;
    newsSources: number;
    xAccounts: number;
    instagramProfiles: number;
    tiktokProfiles: number;
  };
  keywords: LegacyKeywordSuggestions;
  newsSources: LegacySourceRecommendation[];
  xAccounts: LegacySourceRecommendation[];
  instagramProfiles: LegacySourceRecommendation[];
  tiktokProfiles: LegacySourceRecommendation[];
  tiktokQueries: LegacySourceRecommendation[];
};

const socialHosts = new Set([
  "x.com",
  "twitter.com",
  "tiktok.com",
  "vt.tiktok.com",
  "vm.tiktok.com",
  "instagram.com",
  "instagr.am",
  "youtube.com",
  "youtu.be",
  "linkedin.com",
  "t.me",
]);

const requiredTerms = [
  "هداية",
  "هداية ثون",
  "هدايةثون",
  "هاكاثون هداية",
  "هاكثون هداية",
  "hidayathon",
];

const optionalTerms = [
  "رئاسة الشؤون الدينية",
  "الشؤون الدينية",
  "جامعة جدة",
  "الحرمين",
  "المسجد الحرام",
  "المسجد النبوي",
  "الخدمات الدينية",
  "رقمنة الخدمات الدينية",
  "الحلول التقنية",
  "الابتكار",
  "المشاركين",
  "تطوير الخدمات",
  "الحج والعمرة",
  "Jeddah",
  "Hidaya",
];

const excludeTerms = ["وظائف", "إعلان ممول", "خصم", "كوبون"];

export function getLegacySourceIntelligence(): LegacySourceIntelligence {
  const dataset = getImportedReportsDataset();
  const items = dataset.items.filter((item) => item.originalUrl || item.extractedUrls.length > 0);
  const news = new Map<string, LegacySourceRecommendation>();
  const xAccounts = new Map<string, LegacySourceRecommendation>();
  const instagramProfiles = new Map<string, LegacySourceRecommendation>();
  const tiktokProfiles = new Map<string, LegacySourceRecommendation>();
  const hashtagCounts = new Map<string, number>();

  for (const item of items) {
    const urls = unique([item.originalUrl, ...item.extractedUrls].filter((value): value is string => Boolean(value)));
    const text = `${item.title} ${item.summary} ${item.rawText}`;
    for (const hashtag of extractHashtags(text)) {
      hashtagCounts.set(hashtag, (hashtagCounts.get(hashtag) ?? 0) + 1);
    }

    for (const url of urls) {
      const parsed = parsePublicUrl(url);
      if (!parsed) continue;
      const host = parsed.hostname.replace(/^www\./u, "").toLowerCase();
      const sampleTitle = item.title;

      if (host === "x.com" || host === "twitter.com") {
        const handle = firstPathSegment(parsed.pathname) ?? cleanHandle(item.authorName);
        if (handle) addRecommendation(xAccounts, handle.toLowerCase(), {
          kind: "x_account",
          label: `@${handle}`,
          url: `https://x.com/${handle}`,
          sampleUrl: url,
          sampleTitle,
        });
        continue;
      }

      if (host === "instagram.com" || host === "instagr.am") {
        const handle = instagramHandleFromUrl(parsed) ?? cleanHandle(item.authorName);
        if (handle) addRecommendation(instagramProfiles, handle.toLowerCase(), {
          kind: "instagram_profile",
          label: `@${handle}`,
          url: `https://instagram.com/${handle}`,
          sampleUrl: url,
          sampleTitle,
        });
        continue;
      }

      if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
        const handle = tiktokHandleFromUrl(parsed) ?? cleanHandle(item.authorName);
        if (handle) addRecommendation(tiktokProfiles, handle.toLowerCase(), {
          kind: "tiktok_profile",
          label: `@${handle}`,
          url: `https://www.tiktok.com/@${handle}`,
          sampleUrl: url,
          sampleTitle,
        });
        continue;
      }

      if (socialHosts.has(host)) continue;
      addRecommendation(news, host, {
        kind: "news",
        label: sourceLabelFromHost(host, item.sourceName),
        url: parsed.origin,
        sampleUrl: url,
        sampleTitle,
      });
    }
  }

  const hashtags = [...hashtagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag)
    .slice(0, 12);

  const tiktokQueries = unique([...requiredTerms, ...hashtags].filter(Boolean)).slice(0, 10).map((query, index) => ({
    id: `tiktok-query-${index + 1}`,
    kind: "tiktok_query" as const,
    label: query,
    query,
    count: hashtagCounts.get(query) ?? items.filter((item) => `${item.title} ${item.summary}`.toLowerCase().includes(query.toLowerCase())).length,
    sampleUrls: [],
    sampleTitles: [],
  }));

  const newsSources = topRecommendations(news, 20);
  const xAccountList = topRecommendations(xAccounts, 25);
  const instagramProfileList = topRecommendations(instagramProfiles, 20);
  const tiktokProfileList = topRecommendations(tiktokProfiles, 20);

  return {
    summary: {
      reports: dataset.uniqueReportCount,
      items: dataset.uniqueExtractedItems,
      newsSources: newsSources.length,
      xAccounts: xAccountList.length,
      instagramProfiles: instagramProfileList.length,
      tiktokProfiles: tiktokProfileList.length,
    },
    keywords: {
      requiredTerms,
      optionalTerms: unique([...optionalTerms, ...hashtags]).slice(0, 40),
      excludeTerms,
      hashtags,
    },
    newsSources,
    xAccounts: xAccountList,
    instagramProfiles: instagramProfileList,
    tiktokProfiles: tiktokProfileList,
    tiktokQueries,
  };
}

function addRecommendation(
  map: Map<string, LegacySourceRecommendation>,
  key: string,
  input: {
    kind: LegacySourceRecommendation["kind"];
    label: string;
    url?: string;
    query?: string;
    sampleUrl: string;
    sampleTitle: string;
  },
) {
  const current = map.get(key) ?? {
    id: key,
    kind: input.kind,
    label: input.label,
    url: input.url,
    query: input.query,
    count: 0,
    sampleUrls: [],
    sampleTitles: [],
  };
  current.count += 1;
  if (input.sampleUrl && current.sampleUrls.length < 3 && !current.sampleUrls.includes(input.sampleUrl)) {
    current.sampleUrls.push(input.sampleUrl);
  }
  if (input.sampleTitle && current.sampleTitles.length < 3 && !current.sampleTitles.includes(input.sampleTitle)) {
    current.sampleTitles.push(input.sampleTitle);
  }
  map.set(key, current);
}

function topRecommendations(map: Map<string, LegacySourceRecommendation>, limit: number) {
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function extractHashtags(value: string) {
  const matches = value.match(/#[\p{L}\p{N}_-]+/gu) ?? [];
  return unique(matches.map((match) => match.trim()).filter((match) => match.length > 1));
}

function parsePublicUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function firstPathSegment(pathname: string) {
  return pathname.split("/").filter(Boolean)[0]?.replace(/^@/u, "");
}

function instagramHandleFromUrl(url: URL) {
  const segment = firstPathSegment(url.pathname);
  if (!segment || ["p", "reel", "reels", "tv", "stories", "explore"].includes(segment.toLowerCase())) return null;
  return segment;
}

function tiktokHandleFromUrl(url: URL) {
  const segment = url.pathname.split("/").filter(Boolean)[0];
  if (!segment?.startsWith("@")) return null;
  return segment.slice(1);
}

function cleanHandle(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim().replace(/^@/u, "");
  return /^[A-Za-z0-9._-]{2,40}$/u.test(trimmed) ? trimmed : null;
}

function sourceLabelFromHost(host: string, fallback: string) {
  if (cleanHandle(fallback)) return host.replace(/^www\./u, "");
  if (fallback && fallback !== "مصدر غير محدد" && !/^https?:/u.test(fallback)) return fallback;
  return host.replace(/^www\./u, "");
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
