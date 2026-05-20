import type { SupabaseClient } from "@supabase/supabase-js";
import { getImportedReportsDataset, type ImportedReportItem } from "@/lib/imported-reports";
import { getLegacyLinkOverrides, isOpenableHttpUrl, type LinkOverridesFile } from "@/lib/legacy-link-overrides";
import type { ReportItemCard, Sentiment, SourceType } from "@/lib/types";
import {
  LEGACY_ORGANIZATION_ID,
  LEGACY_ORGANIZATION_NAME,
  LEGACY_ORGANIZATION_SLUG,
} from "@/lib/auth-config";
import { getMergedLegacyLinkOverrides } from "@/server/legacy-link-overrides-store";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/server/supabase-admin";

type DbRow = Record<string, unknown>;

type LegacyUpsertTable =
  | "organizations"
  | "plans"
  | "topics"
  | "sources"
  | "usage_limits"
  | "report_templates"
  | "reports"
  | "monitoring_items"
  | "legacy_link_overrides"
  | "captures"
  | "report_items";

type LegacyUpsertBatch = {
  table: LegacyUpsertTable;
  onConflict: string;
  rows: DbRow[];
};

export type LegacySupabaseUpsertPlan = {
  organizationId: string;
  topicId: string;
  templateId: string;
  batches: LegacyUpsertBatch[];
  summary: {
    reports: number;
    monitoringItems: number;
    reportItems: number;
    captures: number;
    sources: number;
    openableOriginalUrls: number;
    missingOriginalUrls: number;
    invalidOriginalUrls: number;
    legacyLinkOverrides: number;
  };
};

export type LegacySupabaseUpsertResult = {
  ok: boolean;
  mode: "memory" | "supabase";
  dryRun: boolean;
  message: string;
  summary: LegacySupabaseUpsertPlan["summary"];
  batches: Array<{
    table: LegacyUpsertTable;
    rows: number;
    onConflict: string;
  }>;
};

const LEGACY_TOPIC_ID = stableUuid("legacy:hidayathon:topic");
const LEGACY_TEMPLATE_ID = stableUuid("legacy:hidayathon:report-template");
const LEGACY_PLAN_ID = stableUuid("legacy:hidayathon:plan");
const LEGACY_USAGE_LIMIT_ID = stableUuid("legacy:hidayathon:usage-limit");

const REPORT_PERIOD_START = "2025-12-08";
const REPORT_PERIOD_END = "2026-03-15";

export function buildLegacySupabaseUpsertPlan(
  overrides: LinkOverridesFile = getLegacyLinkOverrides(),
): LegacySupabaseUpsertPlan {
  const dataset = getImportedReportsDataset(overrides);
  const uniqueReports = dataset.reports.filter((report) => !report.duplicateOf && report.extractedItemCount > 0);
  const sources = buildSourceRows(dataset.items);
  const reportRows = uniqueReports.map((report) => ({
    id: legacyReportUuid(report.issue),
    organization_id: LEGACY_ORGANIZATION_ID,
    topic_id: LEGACY_TOPIC_ID,
    template_id: LEGACY_TEMPLATE_ID,
    title: `تقرير رصد هاكاثون هداية - الإصدار ${report.issue ?? "-"}`,
    version: report.issue ?? 1,
    status: "published",
    period_start: REPORT_PERIOD_START,
    period_end: REPORT_PERIOD_END,
    published_at: "2026-03-15T00:00:00.000Z",
  }));

  const monitoringRows = dataset.items.map((item) => monitoringItemRow(item));
  const legacyLinkOverrideRows = legacyLinkOverrideRowsFromOverrides(overrides);
  const captureRows = dataset.items.map((item) => captureRow(item));
  const reportItemRows = dataset.items.map((item, index) => reportItemRow(item, index));

  const batches: LegacyUpsertBatch[] = [
    {
      table: "organizations",
      onConflict: "id",
      rows: [
        {
          id: LEGACY_ORGANIZATION_ID,
          name: LEGACY_ORGANIZATION_NAME,
          slug: LEGACY_ORGANIZATION_SLUG,
        },
      ],
    },
    {
      table: "plans",
      onConflict: "id",
      rows: [
        {
          id: LEGACY_PLAN_ID,
          organization_id: LEGACY_ORGANIZATION_ID,
          name: "legacy-pilot",
          entitlements: {
            legacyImport: true,
            importedReports: uniqueReports.length,
            importedItems: dataset.uniqueExtractedItems,
          },
          active: true,
        },
      ],
    },
    {
      table: "topics",
      onConflict: "id",
      rows: [
        {
          id: LEGACY_TOPIC_ID,
          organization_id: LEGACY_ORGANIZATION_ID,
          name: "رصد هاكاثون هداية",
          description: "بيانات تاريخية معتمدة مستخرجة من تقارير الرصد القديمة.",
          period_start: REPORT_PERIOD_START,
          period_end: REPORT_PERIOD_END,
          status: "active",
        },
      ],
    },
    {
      table: "sources",
      onConflict: "id",
      rows: sources,
    },
    {
      table: "usage_limits",
      onConflict: "id",
      rows: [
        {
          id: LEGACY_USAGE_LIMIT_ID,
          organization_id: LEGACY_ORGANIZATION_ID,
          topic_id: LEGACY_TOPIC_ID,
          max_x_reads_per_day: 0,
          max_x_reads_per_month: 0,
          max_ai_tokens_per_month: 0,
          max_screenshots_per_month: dataset.uniqueExtractedItems,
          max_storage_mb: 2048,
          hard_stop_enabled: true,
          warning_threshold_percent: 70,
        },
      ],
    },
    {
      table: "report_templates",
      onConflict: "id",
      rows: [
        {
          id: LEGACY_TEMPLATE_ID,
          organization_id: LEGACY_ORGANIZATION_ID,
          key: "HidayathonMediaMonitoringTemplate",
          name: "قالب تقرير رصد هاكاثون هداية",
          sections: [
            "cover_page",
            "time_range_page",
            "stats_page",
            "daily_distribution_page",
            "platform_distribution_page",
            "top_publishers_page",
            "item_card_pages",
            "thank_you_page",
          ],
          active: true,
        },
      ],
    },
    {
      table: "reports",
      onConflict: "id",
      rows: reportRows,
    },
    {
      table: "monitoring_items",
      onConflict: "id",
      rows: monitoringRows,
    },
    {
      table: "legacy_link_overrides",
      onConflict: "organization_id,external_id",
      rows: legacyLinkOverrideRows,
    },
    {
      table: "captures",
      onConflict: "id",
      rows: captureRows,
    },
    {
      table: "report_items",
      onConflict: "id",
      rows: reportItemRows,
    },
  ];

  return {
    organizationId: LEGACY_ORGANIZATION_ID,
    topicId: LEGACY_TOPIC_ID,
    templateId: LEGACY_TEMPLATE_ID,
    batches,
    summary: {
      reports: reportRows.length,
      monitoringItems: monitoringRows.length,
      reportItems: reportItemRows.length,
      captures: captureRows.length,
      sources: sources.length,
      openableOriginalUrls: dataset.items.filter((item) => item.originalUrl).length,
      missingOriginalUrls: dataset.items.filter((item) => !item.extractedOriginalUrl).length,
      invalidOriginalUrls: dataset.items.filter((item) => item.extractedOriginalUrl && !item.originalUrl).length,
      legacyLinkOverrides: legacyLinkOverrideRows.length,
    },
  };
}

export async function upsertLegacyReportsToSupabase(input: { dryRun?: boolean } = {}) {
  const plan = buildLegacySupabaseUpsertPlan(await getMergedLegacyLinkOverrides());
  const dryRun = input.dryRun !== false;
  const batchSummary = plan.batches.map((batch) => ({
    table: batch.table,
    rows: batch.rows.length,
    onConflict: batch.onConflict,
  }));

  if (dryRun || !isSupabaseAdminConfigured()) {
    return {
      ok: true,
      mode: isSupabaseAdminConfigured() ? "supabase" : "memory",
      dryRun: true,
      message: isSupabaseAdminConfigured()
        ? "Dry run only; no Supabase rows were written."
        : "Supabase server credentials are not configured; returning the idempotent upsert plan only.",
      summary: plan.summary,
      batches: batchSummary,
    } satisfies LegacySupabaseUpsertResult;
  }

  const supabase = getSupabaseAdmin();
  for (const batch of plan.batches) {
    await upsertBatch(supabase, batch);
  }

  return {
    ok: true,
    mode: "supabase",
    dryRun: false,
    message: "Legacy Hidayathon reports were upserted to Supabase.",
    summary: plan.summary,
    batches: batchSummary,
  } satisfies LegacySupabaseUpsertResult;
}

export async function buildPersistentLegacySupabaseUpsertPlan() {
  return buildLegacySupabaseUpsertPlan(await getMergedLegacyLinkOverrides());
}

async function upsertBatch(supabase: SupabaseClient, batch: LegacyUpsertBatch) {
  for (const rows of chunks(batch.rows, 200)) {
    const { error } = await supabase.from(batch.table).upsert(rows, {
      onConflict: batch.onConflict,
      ignoreDuplicates: false,
    });

    if (error) {
      throw new Error(`legacy_supabase_upsert_failed:${batch.table}:${error.message}`);
    }
  }
}

function buildSourceRows(items: ImportedReportItem[]) {
  const sourceTypes = [...new Set(items.map((item) => mapLegacyPlatformToSourceType(item.platform)))];
  return sourceTypes.map((sourceType) => ({
    id: legacySourceUuid(sourceType),
    organization_id: LEGACY_ORGANIZATION_ID,
    name: sourceType === "x_oembed" ? "منصة X - بيانات تاريخية" : "مصادر ويب/صحف - بيانات تاريخية",
    type: sourceType,
    url: sourceType === "x_oembed" ? "https://x.com" : "legacy://hidayathon/web-sources",
    country: "السعودية",
    credibility: sourceType === "x_oembed" ? "public" : "media",
    is_verified_source: false,
  }));
}

function monitoringItemRow(item: ImportedReportItem): DbRow {
  const sourceType = mapLegacyPlatformToSourceType(item.platform);
  const originalUrlStatus = getOriginalUrlStatus(item);
  const legacyEvidenceUrl = legacyEvidenceUrlForItem(item);
  const storedOriginalUrl = item.originalUrl ?? legacyEvidenceUrl;
  const evidenceImagePath = item.contentImagePath ?? item.evidenceImagePath;

  return {
    id: legacyItemUuid(item),
    organization_id: LEGACY_ORGANIZATION_ID,
    topic_id: LEGACY_TOPIC_ID,
    source_id: legacySourceUuid(sourceType),
    external_id: item.id,
    source_type: sourceType,
    state: "published",
    title: item.title,
    original_url: storedOriginalUrl,
    original_url_extracted: item.extractedOriginalUrl,
    original_url_status: originalUrlStatus,
    original_url_source: item.originalUrlSource ?? "legacy_evidence",
    evidence_image_path: evidenceImagePath,
    canonical_url_hash: stableFingerprint(`${item.originalUrl ?? legacyEvidenceUrl}:${item.id}`),
    source_item_id: item.id,
    normalized_text_hash: stableFingerprint(item.rawText),
    author_name: item.authorName,
    published_at: null,
    summary: item.summary,
    summary_source_text: item.rawText,
    sentiment: normalizeSentiment(item.sentiment),
    sentiment_confidence: mapLegacyConfidence(item.confidence),
    relevance_score: 100,
    relevance_reason: "مادة تاريخية معتمدة من تقارير رصد هداية المنشورة سابقا.",
    matched_terms: ["هداية", "هاكاثون"],
    raw_response: {
      legacy: true,
      sourcePdf: item.sourcePdf,
      reportIssue: item.reportIssue,
      page: item.page,
      platform: item.platform,
      extractedUrls: item.extractedUrls,
      extractedOriginalUrl: item.extractedOriginalUrl,
      originalUrlStatus,
      originalUrlSource: item.originalUrlSource,
      sourceEvidenceImagePath: item.sourceEvidenceImagePath,
      contentCrop: item.contentImagePath
        ? {
            contentImagePath: item.contentImagePath,
            publisherProfileImagePath: item.publisherProfileImagePath,
            sourceEvidenceImagePath: item.sourceEvidenceImagePath,
          }
        : null,
      imageCount: item.imageCount,
      confidence: item.confidence,
      capturedAtText: item.capturedAtText,
      publishedDateText: item.publishedDateText,
    },
    warning: item.warnings.length ? item.warnings.join("، ") : legacyWarning(item),
  };
}

function legacyLinkOverrideRowsFromOverrides(overrides: LinkOverridesFile): DbRow[] {
  return Object.entries(overrides.items)
    .filter((entry): entry is [string, NonNullable<LinkOverridesFile["items"][string]>] =>
      isOpenableHttpUrl(entry[1]?.originalUrl),
    )
    .map(([externalId, override]) => {
      const verifiedAt = override.verifiedAt ?? new Date().toISOString();

      return {
        id: stableUuid(`legacy:hidayathon:link-override:${externalId}`),
        organization_id: LEGACY_ORGANIZATION_ID,
        external_id: externalId,
        original_url: override.originalUrl?.trim(),
        status: override.status === "needs_review" ? "needs_review" : "verified",
        note: override.note ?? null,
        verified_at: verifiedAt,
        verified_by: override.verifiedBy ?? "legacy-import",
        updated_at: verifiedAt,
      };
    });
}

function captureRow(item: ImportedReportItem): DbRow {
  return {
    id: legacyCaptureUuid(item),
    organization_id: LEGACY_ORGANIZATION_ID,
    monitoring_item_id: legacyItemUuid(item),
    kind: "report_grade",
    status: "success",
    asset_url: item.contentImagePath ?? item.evidenceImagePath ?? legacyEvidenceUrlForItem(item),
    html_archive_url: null,
    failure_reason: null,
    captured_at: null,
  };
}

function reportItemRow(item: ImportedReportItem, index: number): DbRow {
  const reportId = legacyReportUuid(item.reportIssue);
  const itemId = legacyItemUuid(item);
  const warning = legacyWarning(item);

  return {
    id: stableUuid(`legacy:report-item:${reportId}:${itemId}`),
    organization_id: LEGACY_ORGANIZATION_ID,
    report_id: reportId,
    monitoring_item_id: itemId,
    display_order: index + 1,
    card_data: buildReportItemCard(item, warning),
    warning,
  };
}

function buildReportItemCard(item: ImportedReportItem, warning?: string): ReportItemCard {
  return {
    platform: normalizePlatform(item.platform),
    source_name: item.sourceName,
    author_name: item.authorName,
    title: item.title,
    summary: item.summary,
    sentiment: normalizeSentiment(item.sentiment),
    gregorian_date: item.publishedDateText,
    hijri_date: item.publishedDateText,
    captured_at: item.capturedAtText,
    screenshot_url: item.contentImagePath ?? item.evidenceImagePath ?? undefined,
    content_image_url: item.contentImagePath ?? undefined,
    publisher_profile_image_url: item.publisherProfileImagePath ?? undefined,
    source_evidence_image_url: item.sourceEvidenceImagePath ?? undefined,
    original_url: item.originalUrl ?? legacyEvidenceUrlForItem(item),
    source_icon: item.platform,
    warning,
  };
}

function getOriginalUrlStatus(item: ImportedReportItem) {
  if (item.originalUrl) return "openable";
  if (item.extractedOriginalUrl) return "invalid";
  return "missing";
}

function legacyWarning(item: ImportedReportItem) {
  if (item.originalUrl) return undefined;
  if (item.extractedOriginalUrl) return "الرابط المستخرج من التقرير القديم غير قابل للفتح ويحتاج تصحيحا يدويا.";
  return "لا يوجد رابط أصلي داخل التقرير القديم؛ الدليل المتاح هو صورة صفحة التقرير.";
}

function mapLegacyPlatformToSourceType(platform: string): SourceType {
  if (platform === "X") return "x_oembed";
  return "web_page";
}

function normalizePlatform(platform: string): ReportItemCard["platform"] {
  if (platform === "X") return "X";
  if (platform === "Official") return "Official";
  if (platform === "News") return "News";
  return "Website";
}

function normalizeSentiment(sentiment: string): Sentiment {
  if (sentiment === "positive" || sentiment === "negative" || sentiment === "neutral") {
    return sentiment;
  }
  return "neutral";
}

function mapLegacyConfidence(confidence: ImportedReportItem["confidence"]) {
  if (confidence === "high") return 95;
  if (confidence === "medium") return 82;
  return 70;
}

function legacyEvidenceUrlForItem(item: ImportedReportItem) {
  return `legacy://hidayathon/${encodeURIComponent(item.sourcePdf)}#page=${item.page}`;
}

function legacyReportUuid(issue: number | null) {
  return stableUuid(`legacy:hidayathon:report:${issue ?? "unassigned"}`);
}

function legacyItemUuid(item: ImportedReportItem) {
  return stableUuid(`legacy:hidayathon:item:${item.id}`);
}

function legacyCaptureUuid(item: ImportedReportItem) {
  return stableUuid(`legacy:hidayathon:capture:${item.id}`);
}

function legacySourceUuid(sourceType: SourceType) {
  return stableUuid(`legacy:hidayathon:source:${sourceType}`);
}

function stableUuid(value: string) {
  const hex = stableFingerprint(value);

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function stableFingerprint(value: string) {
  return `${stableHash(`${value}:0`)}${stableHash(`${value}:1`)}${stableHash(`${value}:2`)}${stableHash(
    `${value}:3`,
  )}`.slice(0, 32);
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function chunks<T>(rows: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    result.push(rows.slice(index, index + size));
  }
  return result;
}
