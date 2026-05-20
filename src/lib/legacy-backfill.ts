import { getImportedReportsDataset, type ImportedReportItem } from "@/lib/imported-reports";
import {
  getLegacyLinkOverrides,
  getOpenableOverrideUrlFromOverrides,
  isOpenableHttpUrl,
  type LinkOverridesFile,
  type LegacyLinkOverride,
} from "@/lib/legacy-link-overrides";

export type LegacyBackfillPriority = "high" | "medium" | "low";
export type LegacyBackfillStatus = "has_url" | "missing_url" | "invalid_url" | "override_ready";

export type LegacyBackfillItem = ImportedReportItem & {
  hasOriginalUrl: boolean;
  hasExtractedOriginalUrl: boolean;
  effectiveOriginalUrl: string | null;
  originalUrlSource: "pdf" | "override" | null;
  override: LegacyLinkOverride | null;
  backfillStatus: LegacyBackfillStatus;
  backfillPriority: LegacyBackfillPriority;
  backfillReason: string;
  searchQuery: string;
  xSearchUrl: string;
  webSearchUrl: string;
  overrideTemplate: string;
};

export type LegacyBackfillDataset = {
  totalItems: number;
  itemsWithOriginalUrl: number;
  itemsWithExtractedOriginalUrl: number;
  itemsMissingOriginalUrl: number;
  itemsWithoutOpenableOriginalUrl: number;
  invalidOriginalUrlItems: number;
  overrideReadyItems: number;
  xItemsMissingOriginalUrl: number;
  reports: { sourcePdf: string; issue: number | null; count: number; missing: number }[];
  items: LegacyBackfillItem[];
};

export function getLegacyBackfillDataset(overrides: LinkOverridesFile = getLegacyLinkOverrides()): LegacyBackfillDataset {
  const dataset = getImportedReportsDataset(overrides);
  const items = dataset.items.map((item) => toBackfillItem(item, overrides));
  const reportCounts = new Map<string, { sourcePdf: string; issue: number | null; count: number; missing: number }>();

  for (const item of items) {
    const current =
      reportCounts.get(item.sourcePdf) ??
      { sourcePdf: item.sourcePdf, issue: item.reportIssue, count: 0, missing: 0 };
    current.count += 1;
    if (!item.hasOriginalUrl) current.missing += 1;
    reportCounts.set(item.sourcePdf, current);
  }

  return {
    totalItems: items.length,
    itemsWithOriginalUrl: items.filter((item) => item.hasOriginalUrl).length,
    itemsWithExtractedOriginalUrl: items.filter((item) => item.hasExtractedOriginalUrl).length,
    itemsMissingOriginalUrl: items.filter((item) => !item.hasExtractedOriginalUrl).length,
    itemsWithoutOpenableOriginalUrl: items.filter((item) => !item.hasOriginalUrl).length,
    invalidOriginalUrlItems: items.filter((item) => item.backfillStatus === "invalid_url").length,
    overrideReadyItems: items.filter((item) => item.backfillStatus === "override_ready").length,
    xItemsMissingOriginalUrl: items.filter((item) => item.platform === "X" && !item.hasOriginalUrl).length,
    reports: [...reportCounts.values()].sort((a, b) => (a.issue ?? 0) - (b.issue ?? 0)),
    items,
  };
}

export function buildLegacySearchQuery(item: Pick<ImportedReportItem, "authorName" | "title" | "summary" | "platform">) {
  const terms = [
    item.authorName && item.authorName !== "غير محدد" ? item.authorName : "",
    item.title,
    item.summary,
    "هداية",
    item.platform === "X" ? "X" : "",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return terms.length > 180 ? terms.slice(0, 180).trim() : terms;
}

function toBackfillItem(item: ImportedReportItem, overrides: LinkOverridesFile): LegacyBackfillItem {
  const override = overrides.items[item.id] ?? null;
  const overrideUrl = getOpenableOverrideUrlFromOverrides(overrides, item.id);
  const hasExtractedOriginalUrl = Boolean(item.extractedOriginalUrl);
  const hasInvalidExtractedOriginalUrl = Boolean(
    item.extractedOriginalUrl && !isOpenableHttpUrl(item.extractedOriginalUrl),
  );
  const pdfUrl = isOpenableHttpUrl(item.extractedOriginalUrl) ? item.extractedOriginalUrl : null;
  const effectiveOriginalUrl = item.originalUrl ?? overrideUrl ?? pdfUrl;
  const originalUrlSource = item.originalUrlSource ?? (overrideUrl ? "override" : pdfUrl ? "pdf" : null);
  const hasOriginalUrl = Boolean(effectiveOriginalUrl);
  const backfillStatus: LegacyBackfillStatus = item.originalUrl
    ? "has_url"
    : overrideUrl
      ? "override_ready"
      : hasOriginalUrl
      ? "has_url"
      : hasInvalidExtractedOriginalUrl
        ? "invalid_url"
        : "missing_url";
  const searchQuery = buildLegacySearchQuery(item);

  return {
    ...item,
    hasOriginalUrl,
    hasExtractedOriginalUrl,
    effectiveOriginalUrl,
    originalUrlSource,
    override,
    backfillStatus,
    backfillPriority: getBackfillPriority(item, hasOriginalUrl),
    backfillReason: getBackfillReason(item, hasOriginalUrl, originalUrlSource),
    searchQuery,
    xSearchUrl: `https://x.com/search?q=${encodeURIComponent(searchQuery)}&src=typed_query&f=live`,
    webSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
    overrideTemplate: JSON.stringify(
      {
        [item.id]: {
          originalUrl: "https://x.com/account/status/123",
          status: "verified",
          note: `Matched from ${item.sourcePdf} page ${item.page}`,
          verifiedAt: new Date().toISOString(),
          verifiedBy: "admin",
        } satisfies LegacyLinkOverride,
      },
      null,
      2,
    ),
  };
}

function getBackfillPriority(item: ImportedReportItem, hasOriginalUrl: boolean): LegacyBackfillPriority {
  if (hasOriginalUrl) return "low";
  if (item.platform === "X") return "high";
  if (item.confidence === "high") return "medium";
  return "low";
}

function getBackfillReason(
  item: ImportedReportItem,
  hasOriginalUrl: boolean,
  originalUrlSource: LegacyBackfillItem["originalUrlSource"],
) {
  if (originalUrlSource === "override") return "تم توفير رابط أصلي عبر ملف override المحلي.";
  if (hasOriginalUrl) return "الرابط الأصلي موجود داخل نص PDF القديم.";
  if (item.extractedOriginalUrl) return "تم استخراج نص يشبه الرابط من PDF لكنه غير قابل للفتح، لذلك يحتاج تصحيحًا يدويًا.";
  if (item.platform === "X") return "مادة من X بلا رابط منشور أصلي؛ تحتاج مطابقة يدوية أو X API لاحقًا.";
  return "لا يوجد رابط أصلي داخل PDF؛ صورة صفحة التقرير هي الدليل الحالي.";
}
