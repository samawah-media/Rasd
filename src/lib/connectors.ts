import type {
  ConnectorHealth,
  KeywordRule,
  MonitoringItem,
  SourceType,
} from "./types";

export type Cursor = {
  sinceId?: string;
  lastFetchedAt?: string;
};

export type SourceRule = {
  id: string;
  type: SourceType;
  url?: string;
  query?: string;
  keywordRule: KeywordRule;
};

export type IngestedItem = {
  sourceItemId?: string;
  url: string;
  title: string;
  text: string;
  authorName?: string;
  authorHandle?: string;
  publishedAt: string;
  raw: unknown;
};

export interface Connector {
  testConnection(): Promise<ConnectorHealth>;
  fetch(rule: SourceRule, cursor?: Cursor): Promise<IngestedItem[]>;
  normalize(raw: IngestedItem): MonitoringItem;
}

export function makeDedupeKey(item: IngestedItem, sourceType: SourceType) {
  const sourceId = item.sourceItemId?.trim();
  if (sourceId) return `${sourceType}:${sourceId}`;
  return `${sourceType}:${canonicalizeUrl(item.url)}`;
}

export function canonicalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (
      (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com")) &&
      /\/status\/\d+/u.test(parsed.pathname)
    ) {
      parsed.protocol = "https:";
      parsed.hostname = "x.com";
      parsed.search = "";
      parsed.hash = "";
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
      return parsed.toString().replace(/\/$/, "");
    }

    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) =>
      parsed.searchParams.delete(key),
    );
    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

export function explainKeywordMatch(text: string, rule: KeywordRule) {
  const normalized = text.toLowerCase();
  const matchedRequired = rule.requiredTerms.filter((term) =>
    normalized.includes(term.toLowerCase()),
  );
  const matchedOptional = rule.optionalTerms.filter((term) =>
    normalized.includes(term.toLowerCase()),
  );
  const excluded = rule.excludeTerms.some((term) =>
    normalized.includes(term.toLowerCase()),
  );
  const score = excluded
    ? 0
    : Math.min(100, matchedRequired.length * 35 + matchedOptional.length * 15);

  return {
    score,
    matchedTerms: [...matchedRequired, ...matchedOptional],
    reason:
      score === 0
        ? "لم تطابق المادة القواعد المطلوبة أو احتوت كلمة مستبعدة."
        : `طابقت ${matchedRequired.length} كلمة إلزامية و${matchedOptional.length} كلمة اختيارية.`,
  };
}
