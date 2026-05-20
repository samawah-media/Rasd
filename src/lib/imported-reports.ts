import importData from "../../data/imports/hidayathon_reports.json";
import { getLegacyContentCropForItemId } from "@/lib/legacy-content-crops";
import {
  getLegacyLinkOverrides,
  getLegacyLinkOverrideForItemIdFromOverrides,
  getOpenableOverrideUrlFromOverrides,
  isOpenableHttpUrl,
  type LinkOverridesFile,
  type LegacyLinkOverride,
} from "@/lib/legacy-link-overrides";

type RawImportData = typeof importData;
type RawReport = RawImportData["reports"][number];
type RawItem = NonNullable<RawReport["items"]>[number];

export type ImportConfidence = "high" | "medium" | "low";
export type ImportReviewState = "ready" | "needs_cleaning" | "approved";

export type ImportedReportSummary = {
  sourcePdf: string;
  duplicateOf: string | null;
  issue: number | null;
  version: number | null;
  pages: number;
  extractedItemCount: number;
  itemCountClaim: number | null;
};

export type ImportedReportItem = {
  id: string;
  sourcePdf: string;
  reportIssue: number | null;
  page: number;
  platform: string;
  sourceName: string;
  authorName: string;
  title: string;
  summary: string;
  sentiment: string;
  publishedDateText: string;
  capturedAtText: string;
  originalUrl: string | null;
  extractedOriginalUrl: string | null;
  originalUrlSource: "pdf" | "override" | null;
  originalUrlOverride: LegacyLinkOverride | null;
  extractedUrls: string[];
  evidenceImagePath: string | null;
  contentImagePath: string | null;
  publisherProfileImagePath: string | null;
  sourceEvidenceImagePath: string | null;
  rawText: string;
  imageCount: number;
  confidence: ImportConfidence;
  warnings: string[];
  initialState: ImportReviewState;
};

export type ImportedReportsDataset = {
  sourceDir: string;
  reportCount: number;
  uniqueReportCount: number;
  duplicateReportCount: number;
  duplicateItemCount: number;
  totalExtractedItems: number;
  uniqueExtractedItems: number;
  lowConfidenceItems: number;
  warningItems: number;
  reports: ImportedReportSummary[];
  items: ImportedReportItem[];
  platforms: string[];
  confidenceLevels: ImportConfidence[];
  pages: number[];
};

const confidenceLevels: ImportConfidence[] = ["high", "medium", "low"];

export function getImportedReportsDataset(overrides: LinkOverridesFile = getLegacyLinkOverrides()): ImportedReportsDataset {
  const allReports = importData.reports as RawReport[];
  const uniqueReports = allReports.filter((report) => !report.duplicate_of);
  const duplicateReports = allReports.filter((report) => report.duplicate_of);

  const reports = allReports.map((report) => ({
    sourcePdf: report.source_pdf,
    duplicateOf: report.duplicate_of,
    issue: report.issue,
    version: report.version,
    pages: report.pages,
    extractedItemCount: report.extracted_item_count,
    itemCountClaim: report.item_count_claim,
  }));

  const items = uniqueReports.flatMap((report) =>
    (report.items ?? []).map((item, index) => normalizeItem(report, item, index, overrides)),
  );

  const duplicateItemCount = duplicateReports.reduce(
    (total, report) => total + (report.items?.length ?? 0),
    0,
  );

  return {
    sourceDir: importData.source_dir,
    reportCount: importData.report_count,
    uniqueReportCount: importData.unique_report_count,
    duplicateReportCount: duplicateReports.length,
    duplicateItemCount,
    totalExtractedItems: importData.total_extracted_items,
    uniqueExtractedItems: items.length,
    lowConfidenceItems: items.filter((item) => item.confidence === "low").length,
    warningItems: items.filter((item) => item.warnings.length > 0).length,
    reports,
    items,
    platforms: uniqueSorted(items.map((item) => item.platform)),
    confidenceLevels,
    pages: uniqueSorted(items.map((item) => item.page), (a, b) => a - b),
  };
}

function normalizeItem(report: RawReport, item: RawItem, index: number, overrides: LinkOverridesFile): ImportedReportItem {
  const warnings = item.warnings ?? [];
  const confidence = asConfidence(item.confidence);
  const id = [
    report.source_pdf,
    report.issue ?? "dashboard",
    item.page,
    item.platform,
    item.author_name ?? "unknown",
    index,
  ].join("::");
  const rawItem = item as RawItem & { link_annotation_urls?: string[] };
  const annotationUrl = (rawItem.link_annotation_urls ?? []).find(isOpenableHttpUrl) ?? null;
  const extractedOriginalUrl = cleanText(item.original_url) || null;
  const overrideUrl = annotationUrl ? null : getOpenableOverrideUrlFromOverrides(overrides, id);
  const pdfUrl = annotationUrl ?? (isOpenableHttpUrl(extractedOriginalUrl) ? extractedOriginalUrl : null);
  const originalUrl = pdfUrl ?? overrideUrl;
  const sourceEvidenceImagePath = cleanText(item.evidence_image_path) || null;
  const contentCrop = getLegacyContentCropForItemId(id);
  const contentImagePath = contentCrop?.contentImagePath ?? null;

  return {
    id,
    sourcePdf: report.source_pdf,
    reportIssue: report.issue,
    page: item.page,
    platform: item.platform || "Unknown",
    sourceName: item.source_name || item.author_name || "مصدر غير محدد",
    authorName: item.author_name || "غير محدد",
    title: cleanText(item.title) || "بدون عنوان واضح",
    summary: cleanText(item.summary) || "لا يوجد ملخص مستخرج لهذه المادة.",
    sentiment: item.sentiment || "neutral",
    publishedDateText: cleanText(item.published_date_text) || "غير محدد",
    capturedAtText: cleanText(item.captured_at_text) || "غير محدد",
    originalUrl,
    extractedOriginalUrl,
    originalUrlSource: overrideUrl ? "override" : pdfUrl ? "pdf" : null,
    originalUrlOverride: getLegacyLinkOverrideForItemIdFromOverrides(overrides, id),
    extractedUrls: item.extracted_urls ?? [],
    evidenceImagePath: contentImagePath ?? sourceEvidenceImagePath,
    contentImagePath,
    publisherProfileImagePath: contentCrop?.publisherProfileImagePath ?? null,
    sourceEvidenceImagePath,
    rawText: cleanText(item.raw_text) || "لا يوجد نص خام.",
    imageCount: item.image_count ?? 0,
    confidence,
    warnings,
    initialState: "approved",
  };
}

function cleanText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function asConfidence(value: string): ImportConfidence {
  return confidenceLevels.includes(value as ImportConfidence)
    ? (value as ImportConfidence)
    : "low";
}

function uniqueSorted<T>(values: T[], compare?: (a: T, b: T) => number) {
  return [...new Set(values)].sort(compare);
}
