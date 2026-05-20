import { formatGregorian, formatHijri } from "@/lib/dates";
import { LEGACY_ORGANIZATION_ID } from "@/lib/auth-config";
import { getImportedReportsDataset, type ImportConfidence, type ImportedReportItem } from "@/lib/imported-reports";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/server/supabase-admin";

export type ClientReportItem = ImportedReportItem & {
  reportLabel: string;
  platformLabel: string;
  sentimentLabel: string;
  confidenceLabel: string;
  contentUrl: string | null;
  linkStatus: "openable" | "content_link_only" | "malformed" | "legacy_evidence_only";
  screenshotStatus: "available" | "missing";
  clientStatusLabel: string;
  publishDateIso: string | null;
  publishDateLabel: string;
  captureDateIso: string | null;
  captureDateLabel: string;
};

export type ClientReportData = {
  generatedAt: string;
  summary: {
    reports: number;
    items: number;
    lowConfidence: number;
    warnings: number;
    dateFrom: string | null;
    dateTo: string | null;
  };
  reports: { issue: number | null; label: string; sourcePdf: string; count: number }[];
  items: ClientReportItem[];
  filters: {
    platforms: string[];
    sources: string[];
    confidenceLevels: string[];
    sentiments: string[];
    linkStatuses: ClientReportItem["linkStatus"][];
    screenshotStatuses: ClientReportItem["screenshotStatus"][];
    dates: { iso: string; label: string; count: number }[];
  };
  dailyDistribution: { date: string; label: string; count: number }[];
  platformDistribution: { platform: string; label: string; count: number; percent: number }[];
  sentimentDistribution: { sentiment: string; label: string; count: number; percent: number }[];
  topPublishers: { name: string; count: number; platform: string }[];
};

type DbReportItemRow = {
  report_id: string;
  monitoring_item_id: string;
  display_order: number;
  warning: string | null;
};

type DbReportRow = {
  id: string;
  version: number;
  title: string;
  period_start: string | null;
  period_end: string | null;
};

type DbMonitoringItemRow = {
  id: string;
  source_id: string | null;
  external_id: string | null;
  source_type: string;
  title: string | null;
  original_url: string;
  original_url_extracted: string | null;
  original_url_status: string | null;
  original_url_source: string | null;
  evidence_image_path: string | null;
  source_item_id: string | null;
  author_name: string | null;
  published_at: string | null;
  summary: string | null;
  summary_source_text: string | null;
  sentiment: string | null;
  sentiment_confidence: number | null;
  raw_response: unknown;
  warning: string | null;
};

type DbCaptureRow = {
  monitoring_item_id: string;
  asset_url: string | null;
  captured_at: string | null;
};

type DbSourceRow = {
  id: string;
  name: string | null;
};

const monthNumbers: Record<string, number> = {
  يناير: 1,
  فبراير: 2,
  مارس: 3,
  ابريل: 4,
  أبريل: 4,
  مايو: 5,
  يونيو: 6,
  يوليو: 7,
  أغسطس: 8,
  اغسطس: 8,
  سبتمبر: 9,
  أكتوبر: 10,
  اكتوبر: 10,
  نوفمبر: 11,
  ديسمبر: 12,
};

const platformLabels: Record<string, string> = {
  X: "منصة X",
  Official: "موقع رسمي",
  TikTok: "TikTok",
  YouTube: "YouTube",
  Website: "موقع ويب",
  News: "خبر",
  Unknown: "غير محدد",
};

const sentimentLabels: Record<string, string> = {
  positive: "إيجابي",
  neutral: "محايد",
  negative: "سلبي",
};

const confidenceLabels: Record<string, string> = {
  high: "ثقة عالية",
  medium: "ثقة متوسطة",
  low: "ثقة منخفضة",
};

const confidenceLevels: ImportConfidence[] = ["high", "medium", "low"];
const hidayathonReportOrganizationIds = [LEGACY_ORGANIZATION_ID];

export function getHidayathonClientReportData(): ClientReportData {
  const dataset = getImportedReportsDataset();
  const items = dataset.items.map(enrichClientReportItem);
  const reportSummaries = dataset.reports
    .filter((report) => !report.duplicateOf && report.extractedItemCount > 0)
    .map((report) => ({
      issue: report.issue,
      label: report.issue ? `الإصدار ${report.issue}` : "تقرير غير مرقم",
      sourcePdf: report.sourcePdf,
      count: report.extractedItemCount,
    }));

  return buildClientReportData(items, reportSummaries);
}

export async function getPreferredHidayathonClientReportData(): Promise<ClientReportData> {
  if (!isSupabaseAdminConfigured()) {
    if (allowsLocalClientReportFallback()) return getHidayathonClientReportData();
    throw new Error("client_report_supabase_not_configured");
  }

  try {
    const report = await getSupabaseHidayathonClientReportData();
    if (report.items.length || !allowsLocalClientReportFallback()) return report;
  } catch (error) {
    if (!allowsLocalClientReportFallback()) throw error;
  }

  return getHidayathonClientReportData();
}

async function getSupabaseHidayathonClientReportData(): Promise<ClientReportData> {
  const supabase = getSupabaseAdmin();
  const { data: reportItems, error: reportItemsError } = await supabase
    .from("report_items")
    .select("report_id, monitoring_item_id, display_order, warning")
    .in("organization_id", hidayathonReportOrganizationIds)
    .order("display_order", { ascending: true });

  if (reportItemsError) throw reportItemsError;

  const reportItemRows = (reportItems ?? []) as DbReportItemRow[];
  const reportIds = unique(reportItemRows.map((row) => row.report_id));
  const itemIds = unique(reportItemRows.map((row) => row.monitoring_item_id));

  if (!reportItemRows.length || !reportIds.length || !itemIds.length) {
    return buildClientReportData([], []);
  }

  const [reportsResult, itemsResult, capturesResult] = await Promise.all([
    supabase.from("reports").select("id, version, title, period_start, period_end").in("id", reportIds),
    supabase
      .from("monitoring_items")
      .select(
        "id, source_id, external_id, source_type, title, original_url, original_url_extracted, original_url_status, original_url_source, evidence_image_path, source_item_id, author_name, published_at, summary, summary_source_text, sentiment, sentiment_confidence, raw_response, warning",
      )
      .in("id", itemIds),
    supabase
      .from("captures")
      .select("monitoring_item_id, asset_url, captured_at")
      .in("monitoring_item_id", itemIds)
      .eq("kind", "report_grade")
      .eq("status", "success"),
  ]);

  if (reportsResult.error) throw reportsResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (capturesResult.error) throw capturesResult.error;

  const itemRows = (itemsResult.data ?? []) as DbMonitoringItemRow[];
  const sourceIds = unique(itemRows.map((row) => row.source_id).filter((id): id is string => Boolean(id)));
  const sources = new Map<string, string>();

  if (sourceIds.length) {
    const { data, error } = await supabase.from("sources").select("id, name").in("id", sourceIds);
    if (error) throw error;
    for (const row of (data ?? []) as DbSourceRow[]) {
      if (row.name) sources.set(row.id, row.name);
    }
  }

  const reportsById = new Map(((reportsResult.data ?? []) as DbReportRow[]).map((row) => [row.id, row]));
  const itemsById = new Map(itemRows.map((row) => [row.id, row]));
  const captureByItemId = new Map(((capturesResult.data ?? []) as DbCaptureRow[]).map((row) => [row.monitoring_item_id, row]));
  const clientItems = reportItemRows
    .map((link) => {
      const item = itemsById.get(link.monitoring_item_id);
      if (!item) return null;
      return toClientReportItemFromDb(item, reportsById.get(link.report_id), captureByItemId.get(item.id), sources, link);
    })
    .filter((item): item is ClientReportItem => Boolean(item));
  const firstSourcePdfByReportId = new Map<string, string>();

  for (const link of reportItemRows) {
    const item = itemsById.get(link.monitoring_item_id);
    const sourcePdf = item ? rawString(item.raw_response, "sourcePdf") : null;
    if (sourcePdf && !firstSourcePdfByReportId.has(link.report_id)) {
      firstSourcePdfByReportId.set(link.report_id, sourcePdf);
    }
  }

  const reportSummaries = [...reportsById.values()]
    .sort((a, b) => a.version - b.version)
    .map((report) => ({
      issue: report.version,
      label: report.version ? `الإصدار ${report.version}` : report.title,
      sourcePdf: firstSourcePdfByReportId.get(report.id) ?? report.id,
      count: reportItemRows.filter((link) => link.report_id === report.id).length,
    }));

  return buildClientReportData(clientItems, reportSummaries);
}

function buildClientReportData(
  items: ClientReportItem[],
  reportSummaries: { issue: number | null; label: string; sourcePdf: string; count: number }[],
): ClientReportData {
  const datedItems = items.filter((item) => item.publishDateIso);
  const dateValues = datedItems.map((item) => item.publishDateIso as string).sort();

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      reports: reportSummaries.length,
      items: items.length,
      lowConfidence: items.filter((item) => item.confidence === "low").length,
      warnings: items.filter((item) => item.warnings.length > 0).length,
      dateFrom: dateValues[0] ?? null,
      dateTo: dateValues.at(-1) ?? null,
    },
    reports: reportSummaries,
    items,
    filters: {
      platforms: unique(items.map((item) => item.platform)),
      sources: unique(items.map((item) => item.sourceName)),
      confidenceLevels,
      sentiments: unique(items.map((item) => item.sentiment)),
      linkStatuses: unique(items.map((item) => item.linkStatus)),
      screenshotStatuses: unique(items.map((item) => item.screenshotStatus)),
      dates: groupBy(items, (item) => item.publishDateIso)
        .filter((entry): entry is { key: string; count: number } => Boolean(entry.key))
        .map((entry) => ({
          iso: entry.key,
          label: shortDateLabel(entry.key),
          count: entry.count,
        })),
    },
    dailyDistribution: groupBy(items, (item) => item.publishDateIso)
      .filter((entry): entry is { key: string; count: number } => Boolean(entry.key))
      .map((entry) => ({
        date: entry.key,
        label: shortDateLabel(entry.key),
        count: entry.count,
      })),
    platformDistribution: withPercent(
      groupBy(items, (item) => item.platform).map((entry) => ({
        platform: entry.key ?? "Unknown",
        label: platformLabels[entry.key ?? "Unknown"] ?? entry.key ?? "غير محدد",
        count: entry.count,
      })),
      "count",
    ),
    sentimentDistribution: withPercent(
      groupBy(items, (item) => item.sentiment).map((entry) => ({
        sentiment: entry.key ?? "neutral",
        label: sentimentLabels[entry.key ?? "neutral"] ?? entry.key ?? "محايد",
        count: entry.count,
      })),
      "count",
    ),
    topPublishers: groupBy(items, (item) => item.authorName || item.sourceName)
      .map((entry) => {
        const sample = items.find((item) => (item.authorName || item.sourceName) === entry.key);
        return {
          name: entry.key ?? "غير محدد",
          count: entry.count,
          platform: sample?.platformLabel ?? "غير محدد",
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  };
}

function toClientReportItemFromDb(
  row: DbMonitoringItemRow,
  report: DbReportRow | undefined,
  capture: DbCaptureRow | undefined,
  sources: Map<string, string>,
  link: DbReportItemRow,
) {
  const sourcePdf = rawString(row.raw_response, "sourcePdf") ?? report?.title ?? "supabase";
  const reportIssue = rawNumber(row.raw_response, "reportIssue") ?? report?.version ?? null;
  const platform = rawString(row.raw_response, "platform") ?? platformFromDbRow(row);
  const contentImagePath =
    rawContentCropString(row.raw_response, "contentImagePath") ??
    openableAssetUrl(capture?.asset_url) ??
    openableAssetUrl(row.evidence_image_path);
  const sourceEvidenceImagePath =
    rawContentCropString(row.raw_response, "sourceEvidenceImagePath") ??
    rawString(row.raw_response, "sourceEvidenceImagePath") ??
    openableAssetUrl(row.evidence_image_path);
  const publisherProfileImagePath = rawContentCropString(row.raw_response, "publisherProfileImagePath");
  const evidenceImagePath = contentImagePath ?? sourceEvidenceImagePath;
  const originalUrl = row.original_url_status === "openable" ? openableHttpUrl(row.original_url) : null;
  const extractedOriginalUrl = row.original_url_extracted ?? rawString(row.raw_response, "extractedOriginalUrl");
  const warnings = unique([row.warning, link.warning].filter((warning): warning is string => Boolean(warning)));

  return enrichClientReportItem({
    id: row.external_id ?? row.source_item_id ?? row.id,
    sourcePdf,
    reportIssue,
    page: rawNumber(row.raw_response, "page") ?? link.display_order,
    platform,
    sourceName: sources.get(row.source_id ?? "") ?? row.author_name ?? platformLabels[platform] ?? platform,
    authorName: row.author_name ?? "غير محدد",
    title: row.title ?? row.original_url,
    summary: row.summary ?? row.summary_source_text ?? row.original_url,
    sentiment: row.sentiment ?? "neutral",
    publishedDateText: rawString(row.raw_response, "publishedDateText") ?? row.published_at ?? "غير محدد",
    capturedAtText: rawString(row.raw_response, "capturedAtText") ?? capture?.captured_at ?? "غير محدد",
    originalUrl,
    extractedOriginalUrl,
    originalUrlSource: row.original_url_source === "override" ? "override" : originalUrl ? "pdf" : null,
    originalUrlOverride: null,
    extractedUrls: rawStringArray(row.raw_response, "extractedUrls"),
    evidenceImagePath,
    contentImagePath,
    publisherProfileImagePath,
    sourceEvidenceImagePath,
    rawText: row.summary_source_text ?? row.summary ?? "لا يوجد نص خام.",
    imageCount: evidenceImagePath ? 1 : 0,
    confidence: confidenceFromScore(row.sentiment_confidence, rawString(row.raw_response, "confidence")),
    warnings,
    initialState: "approved",
  });
}

export function enrichClientReportItem(item: ImportedReportItem): ClientReportItem {
  const publishDateIso = extractLegacyPublishDateIso(item);
  const captureDateIso = extractLegacyCaptureDateIso(item.capturedAtText);
  const originalUrl = getClientOriginalUrl(item);
  const contentUrl = getClientContentUrl(item);
  const linkStatus = getClientLinkStatus({ ...item, originalUrl, contentUrl });
  const screenshotStatus = item.evidenceImagePath ? "available" : "missing";

  return {
    ...item,
    originalUrl,
    contentUrl,
    reportLabel: item.reportIssue ? `الإصدار ${item.reportIssue}` : "تقرير غير مرقم",
    platformLabel: platformLabels[item.platform] ?? item.platform,
    sentimentLabel: sentimentLabels[item.sentiment] ?? item.sentiment,
    confidenceLabel: confidenceLabels[item.confidence] ?? item.confidence,
    linkStatus,
    screenshotStatus,
    clientStatusLabel: getClientStatusLabel(linkStatus, screenshotStatus),
    publishDateIso,
    publishDateLabel: publishDateIso ? longDateLabel(publishDateIso) : item.publishedDateText,
    captureDateIso,
    captureDateLabel: captureDateIso ? longDateLabel(captureDateIso) : item.capturedAtText,
  };
}

export function extractLegacyPublishDateIso(item: Pick<ImportedReportItem, "rawText" | "publishedDateText">) {
  const text = normalizeDateText(`${item.publishedDateText}\n${item.rawText}`);
  const isoDate = extractIsoDate(text);
  if (isoDate) return isoDate;

  const monthPattern = Object.keys(monthNumbers).join("|");
  const match = text.match(new RegExp(`(\\d{1,2})\\s*(${monthPattern})`, "u"));
  if (!match) return null;

  return toIsoDate(inferYear(Number(match[1]), match[2]), monthNumbers[match[2]], Number(match[1]));
}

export function extractLegacyCaptureDateIso(value: string) {
  const text = normalizeDateText(value);
  const isoDate = extractIsoDate(text);
  if (isoDate) return isoDate;

  const monthPattern = Object.keys(monthNumbers).join("|");
  const match = text.match(new RegExp(`(20\\d{2})\\s*(${monthPattern})\\s*(\\d{1,2})`, "u"));
  if (!match) return null;

  return toIsoDate(Number(match[1]), monthNumbers[match[2]], Number(match[3]));
}

function normalizeDateText(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/ـ/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function inferYear(_day: number, month: string) {
  return monthNumbers[month] === 12 ? 2025 : 2026;
}

function toIsoDate(year: number, month: number, day: number) {
  if (!month || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractIsoDate(value: string) {
  const match = value.match(/(^|[^\d])(20\d{2})-(\d{2})-(\d{2})(?=$|[^\d])/);
  if (!match) return null;

  return toIsoDate(Number(match[2]), Number(match[3]), Number(match[4]));
}

function longDateLabel(iso: string) {
  return `${formatGregorian(iso)} · ${formatHijri(iso)}`;
}

function shortDateLabel(iso: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    calendar: "gregory",
  }).format(new Date(iso));
}

function unique<T>(values: T[]) {
  return [...new Set(values)].sort();
}

function groupBy<T>(items: T[], getKey: (item: T) => string | null | undefined) {
  const groups = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item) ?? "";
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }

  return [...groups.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function withPercent<T extends Record<K, number>, K extends keyof T>(items: T[], valueKey: K) {
  const total = items.reduce((sum, item) => sum + item[valueKey], 0);
  return items
    .map((item) => ({
      ...item,
      percent: total ? Math.round((item[valueKey] / total) * 100) : 0,
    }))
    .sort((a, b) => b[valueKey] - a[valueKey]);
}

function allowsLocalClientReportFallback() {
  return process.env.NODE_ENV !== "production" || process.env.RASD_CLIENT_REPORT_FALLBACK === "local";
}

function getClientLinkStatus(item: ImportedReportItem & { contentUrl?: string | null }): ClientReportItem["linkStatus"] {
  if (item.originalUrl) return "openable";
  if (item.contentUrl) return "content_link_only";
  if (item.extractedOriginalUrl) return "malformed";
  return "legacy_evidence_only";
}

function getClientStatusLabel(
  linkStatus: ClientReportItem["linkStatus"],
  screenshotStatus: ClientReportItem["screenshotStatus"],
) {
  if (linkStatus === "openable" && screenshotStatus === "available") return "رابط ولقطة متاحة";
  if (linkStatus === "openable") return "رابط أصلي متاح";
  if (linkStatus === "content_link_only" && screenshotStatus === "available") return "رابط مذكور ولقطة متاحة";
  if (linkStatus === "content_link_only") return "رابط مذكور داخل المحتوى";
  if (linkStatus === "malformed") return "رابط يحتاج تصحيح";
  return "دليل من التقرير القديم";
}

function getClientOriginalUrl(item: ImportedReportItem) {
  if (!item.originalUrl) return null;
  if (item.platform === "X" && !isXPostUrl(item.originalUrl)) return null;
  return item.originalUrl;
}

function getClientContentUrl(item: ImportedReportItem) {
  if (!item.originalUrl) return null;
  if (item.platform === "X" && !isXPostUrl(item.originalUrl)) return item.originalUrl;
  return null;
}

function rawRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rawString(value: unknown, key: string) {
  const entry = rawRecord(value)[key];
  return typeof entry === "string" && entry.trim() ? entry.trim() : null;
}

function rawNumber(value: unknown, key: string) {
  const entry = rawRecord(value)[key];
  return typeof entry === "number" && Number.isFinite(entry) ? entry : null;
}

function rawStringArray(value: unknown, key: string) {
  const entry = rawRecord(value)[key];
  return Array.isArray(entry) ? entry.filter((item): item is string => typeof item === "string") : [];
}

function rawContentCropString(value: unknown, key: string) {
  const contentCrop = rawRecord(rawRecord(value).contentCrop);
  const entry = contentCrop[key];
  return typeof entry === "string" && entry.trim() ? entry.trim() : null;
}

function openableHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  return value.startsWith("http://") || value.startsWith("https://") ? value : null;
}

function isXPostUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    return (host === "x.com" || host === "twitter.com") && /\/status\/\d+/.test(url.pathname);
  } catch {
    return false;
  }
}

function openableAssetUrl(value: string | null | undefined) {
  if (!value || value.startsWith("legacy://")) return null;
  return value;
}

function platformFromDbRow(row: Pick<DbMonitoringItemRow, "source_type" | "original_url">) {
  if (row.source_type === "manual_url") return platformFromOriginalUrl(row.original_url);
  return platformFromSourceType(row.source_type);
}

function platformFromOriginalUrl(value: string) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    if (host === "x.com" || host === "twitter.com") return "X";
    if (host.endsWith("x.com") || host.endsWith("twitter.com")) return "X";
  } catch {
    return "Unknown";
  }

  return "Website";
}

function platformFromSourceType(sourceType: string) {
  if (sourceType.startsWith("x_")) return "X";
  if (sourceType === "rss") return "News";
  if (sourceType === "web_page") return "Website";
  if (sourceType === "manual_url") return "Website";
  return "Unknown";
}

function confidenceFromScore(score: number | null, rawConfidence: string | null): ImportConfidence {
  if (rawConfidence === "high" || rawConfidence === "medium" || rawConfidence === "low") return rawConfidence;
  if (typeof score !== "number") return "medium";
  if (score >= 90) return "high";
  if (score >= 75) return "medium";
  return "low";
}
