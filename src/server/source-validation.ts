import type { SourceCredibility, SourceType } from "@/lib/types";
import { isSafePublicHttpUrl } from "@/server/url-metadata";

export type SourceCreateInput = {
  name?: string;
  type?: SourceType;
  url?: string;
  feedUrl?: string;
  credibility?: SourceCredibility;
  isActive?: boolean;
  pollIntervalMinutes?: number;
};

export type NormalizedSourceCreateInput = Required<Pick<SourceCreateInput, "type" | "url" | "credibility" | "isActive" | "pollIntervalMinutes">> &
  Pick<SourceCreateInput, "name" | "feedUrl">;

export class SourceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceValidationError";
  }
}

const sourceTypes = new Set<SourceType>([
  "manual_url",
  "rss",
  "web_page",
  "x_oembed",
  "x_recent_search",
  "x_filtered_stream",
]);

const credibilityLevels = new Set<SourceCredibility>(["official", "media", "influencer", "public"]);
const defaultRssPollIntervalMinutes = 4320;

export function normalizeSourceCreateInput(input: SourceCreateInput): NormalizedSourceCreateInput {
  const type = input.type ?? "manual_url";
  if (!sourceTypes.has(type)) throw new SourceValidationError("type must be a supported source type");

  const credibility = input.credibility ?? "public";
  if (!credibilityLevels.has(credibility)) throw new SourceValidationError("credibility must be supported");

  const pollIntervalMinutes = input.pollIntervalMinutes ?? (type === "rss" ? defaultRssPollIntervalMinutes : 1440);
  if (!Number.isInteger(pollIntervalMinutes) || pollIntervalMinutes < 15 || pollIntervalMinutes > 10080) {
    throw new SourceValidationError("poll_interval_minutes must be between 15 and 10080");
  }

  const feedUrl = normalizeFeedUrl(input.feedUrl ?? (type === "rss" ? input.url : undefined), type);
  const url = input.url ?? (type === "manual_url" ? "manual://intake" : feedUrl ?? "");
  if (!url) throw new SourceValidationError("url is required");

  return {
    name: input.name,
    type,
    url,
    feedUrl,
    credibility,
    isActive: input.isActive ?? true,
    pollIntervalMinutes,
  };
}

function normalizeFeedUrl(value: string | undefined, type: SourceType) {
  if (typeof value !== "string" || !value.trim()) {
    if (type === "rss") throw new SourceValidationError("feed_url is required for RSS sources");
    return undefined;
  }

  const feedUrl = value.trim();
  if (!isSafePublicHttpUrl(feedUrl)) {
    throw new SourceValidationError("feed_url must be a public http or https URL");
  }
  return feedUrl;
}
