import type { MonitoringItem, SourceType } from "@/lib/types";

export const workflowSourceTypes = new Set<SourceType>([
  "manual_url",
  "rss",
  "x_recent_search",
  "tiktok_research",
  "instagram_public_profile",
]);

export function isWorkflowItem(item: MonitoringItem) {
  return workflowSourceTypes.has(item.sourceType) && item.state !== "archived";
}

export function latestWorkflowItems(items: MonitoringItem[], limit = 48, pinnedId?: string | null) {
  const candidates = items
    .filter(isWorkflowItem)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const limited = candidates.slice(0, limit);
  const pinned = pinnedId ? candidates.find((item) => item.id === pinnedId) : undefined;
  if (!pinned || limited.some((item) => item.id === pinned.id)) return limited;
  return [pinned, ...limited.slice(0, Math.max(0, limit - 1))];
}

export function isSocialWorkflowItem(item: MonitoringItem) {
  return item.sourceType === "tiktok_research" || item.sourceType === "instagram_public_profile";
}

export function isXWorkflowItem(item: MonitoringItem) {
  return item.sourceType === "x_recent_search" || item.originalUrl.includes("x.com") || item.originalUrl.includes("twitter.com");
}

export function isRssWorkflowItem(item: MonitoringItem) {
  return item.sourceType === "rss";
}
