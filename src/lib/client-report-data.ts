import { formatGregorian, formatHijri } from "@/lib/dates";
import { getImportedReportsDataset, type ImportedReportItem } from "@/lib/imported-reports";

export type ClientReportItem = ImportedReportItem & {
  reportLabel: string;
  platformLabel: string;
  sentimentLabel: string;
  confidenceLabel: string;
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
    confidenceLevels: string[];
    sentiments: string[];
    dates: { iso: string; label: string; count: number }[];
  };
  dailyDistribution: { date: string; label: string; count: number }[];
  platformDistribution: { platform: string; label: string; count: number; percent: number }[];
  sentimentDistribution: { sentiment: string; label: string; count: number; percent: number }[];
  topPublishers: { name: string; count: number; platform: string }[];
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

export function getHidayathonClientReportData(): ClientReportData {
  const dataset = getImportedReportsDataset();
  const items = dataset.items.map(enrichClientReportItem);
  const datedItems = items.filter((item) => item.publishDateIso);
  const dateValues = datedItems.map((item) => item.publishDateIso as string).sort();
  const reportSummaries = dataset.reports
    .filter((report) => !report.duplicateOf && report.extractedItemCount > 0)
    .map((report) => ({
      issue: report.issue,
      label: report.issue ? `الإصدار ${report.issue}` : "تقرير غير مرقم",
      sourcePdf: report.sourcePdf,
      count: report.extractedItemCount,
    }));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      reports: reportSummaries.length,
      items: dataset.uniqueExtractedItems,
      lowConfidence: dataset.lowConfidenceItems,
      warnings: dataset.warningItems,
      dateFrom: dateValues[0] ?? null,
      dateTo: dateValues.at(-1) ?? null,
    },
    reports: reportSummaries,
    items,
    filters: {
      platforms: unique(items.map((item) => item.platform)),
      confidenceLevels: dataset.confidenceLevels,
      sentiments: unique(items.map((item) => item.sentiment)),
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

export function enrichClientReportItem(item: ImportedReportItem): ClientReportItem {
  const publishDateIso = extractLegacyPublishDateIso(item);
  const captureDateIso = extractLegacyCaptureDateIso(item.capturedAtText);

  return {
    ...item,
    reportLabel: item.reportIssue ? `الإصدار ${item.reportIssue}` : "تقرير غير مرقم",
    platformLabel: platformLabels[item.platform] ?? item.platform,
    sentimentLabel: sentimentLabels[item.sentiment] ?? item.sentiment,
    confidenceLabel: confidenceLabels[item.confidence] ?? item.confidence,
    publishDateIso,
    publishDateLabel: publishDateIso ? longDateLabel(publishDateIso) : item.publishedDateText,
    captureDateIso,
    captureDateLabel: captureDateIso ? longDateLabel(captureDateIso) : item.capturedAtText,
  };
}

export function extractLegacyPublishDateIso(item: Pick<ImportedReportItem, "rawText" | "publishedDateText">) {
  const text = normalizeDateText(`${item.publishedDateText}\n${item.rawText}`);
  const monthPattern = Object.keys(monthNumbers).join("|");
  const match = text.match(new RegExp(`(\\d{1,2})\\s*(${monthPattern})`, "u"));
  if (!match) return null;

  return toIsoDate(inferYear(Number(match[1]), match[2]), monthNumbers[match[2]], Number(match[1]));
}

export function extractLegacyCaptureDateIso(value: string) {
  const text = normalizeDateText(value);
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
