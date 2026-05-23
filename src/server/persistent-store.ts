import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalizeUrl, explainKeywordMatch, makeDedupeKey, type IngestedItem } from "@/lib/connectors";
import { checkBudget, type UsageSnapshot } from "@/lib/guardrails";
import { keywordRules, usageLimit } from "@/lib/mock-data";
import type {
  Capture,
  CaptureKind,
  HealthMetric,
  ItemState,
  KeywordRule,
  MonitoringItem,
  ReportVersion,
  Source,
  SourceCredibility,
  SourceType,
  SourceRule,
  Job,
  ConnectorRun,
} from "@/lib/types";
import { TikTokResearchConnector } from "@/lib/connectors/tiktok/research";
import { InstagramPublicProfileConnector } from "@/lib/connectors/instagram/public-profile";
import {
  DEFAULT_MANUAL_SOURCE_ID,
  DEFAULT_ORGANIZATION_ID,
  DEFAULT_ORGANIZATION_NAME,
  DEFAULT_ORGANIZATION_SLUG,
  DEFAULT_REPORT_ID,
  DEFAULT_TEMPLATE_ID,
  DEFAULT_TOPIC_ID,
  DEFAULT_USAGE_LIMIT_ID,
} from "@/lib/auth-config";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/server/supabase-admin";
import { store } from "@/server/store";
import { evidenceCardUrl } from "@/server/evidence-card";
import {
  evidenceStorageReference,
  parseEvidenceStorageReference,
  persistEvidenceAsset,
} from "@/server/evidence-storage";
import { isSafePublicHttpUrl } from "@/server/url-metadata";
import { getMediaMetadataHealth } from "@/server/media-metadata-extractor";
import {
  normalizeSourceCreateInput,
  SourceValidationError,
  type SourceCreateInput,
} from "@/server/source-validation";
import {
  buildRssIngestionItem,
  evaluateRssEntryRelevance,
  fetchRssFeed,
  type RssIngestionItem,
} from "@/server/rss-ingestion";

type ReviewAction = "approve" | "reject";
type DbRow = Record<string, unknown>;

type DbSourceRow = {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  feed_url: string | null;
  handle: string | null;
  country: string | null;
  credibility: SourceCredibility;
  is_verified_source: boolean;
  is_active: boolean;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  poll_interval_minutes: number | null;
  logo_url: string | null;
};

type DbKeywordRuleRow = {
  id: string;
  required_terms: string[] | null;
  optional_terms: string[] | null;
  exclude_terms: string[] | null;
  language: "ar" | "en" | "mixed" | null;
  source_type: SourceType | null;
  priority: number | null;
  active_from: string | null;
  active_to: string | null;
  version: number | null;
};

type DbSourceRuleRow = {
  id: string;
  organization_id: string;
  topic_id: string;
  source_id: string | null;
  type: SourceType;
  query: string | null;
  url: string | null;
  cursor: Record<string, unknown> | null;
  active: boolean;
  poll_interval_minutes: number | null;
  created_at: string;
};

type DbJobRow = {
  id: string;
  organization_id: string;
  job_type: string;
  status: "queued" | "running" | "succeeded" | "failed" | "dead_letter";
  idempotency_key: string;
  attempts: number;
  payload: Record<string, unknown>;
  failure_reason: string | null;
  available_at: string;
  created_at: string;
};

type DbConnectorRunRow = {
  id: string;
  organization_id: string;
  source_rule_id: string;
  status: string;
  cursor_before: Record<string, unknown> | null;
  cursor_after: Record<string, unknown> | null;
  fetched_count: number;
  failure_reason: string | null;
  started_at: string;
  finished_at: string | null;
};

type DbItemRow = {
  id: string;
  source_id: string | null;
  source_type: SourceType;
  state: ItemState;
  title: string | null;
  original_url: string;
  author_name: string | null;
  author_handle: string | null;
  published_at: string | null;
  summary: string | null;
  summary_source_text: string | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  sentiment_confidence: number | null;
  relevance_score: number | null;
  relevance_reason: string | null;
  matched_terms: string[] | null;
  canonical_url_hash: string | null;
  source_item_id: string | null;
  raw_response?: unknown;
  warning: string | null;
  created_at: string;
  sources?: { name: string | null } | null;
  organization_id?: string;
  topic_id?: string;
};

type DbReportRow = {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  title: string;
  period_start: string | null;
  period_end: string | null;
  published_at: string | null;
};

type DbCaptureRow = {
  id: string;
  monitoring_item_id: string;
  kind: CaptureKind;
  status: "pending" | "success" | "failed" | "retrying";
  captured_at: string | null;
  asset_url: string | null;
  html_archive_url: string | null;
  failure_reason: string | null;
};

type DbReportItemRow = {
  id: string;
  report_id: string;
  monitoring_item_id: string;
  warning: string | null;
  created_at: string;
};

type ManualUrlInput = {
  url: string;
  title?: string;
  text?: string;
  authorName?: string;
  authorHandle?: string;
  publishedAt?: string;
  extraction?: Record<string, unknown>;
  sourceType?: "manual_url" | "x_recent_search";
  sourceName?: string;
  discoveryMethod?: MonitoringItem["discoveryMethod"];
};

type ItemCorrectionInput = {
  title?: string;
  summary?: string;
  authorName?: string;
  authorHandle?: string;
  publishedAt?: string;
  originalUrl?: string;
};

export type StoredCaptureAsset = {
  body: Uint8Array;
  contentType: string;
};

type RssIngestOptions = {
  fetcher?: typeof fetch;
};

function shouldUseSupabase() {
  return isSupabaseAdminConfigured() && process.env.NODE_ENV !== "test";
}

function now() {
  return new Date().toISOString();
}

function sourceLabel(type: SourceType) {
  if (type === "rss") return "مصدر RSS";
  if (type === "web_page") return "موقع ويب";
  if (type.startsWith("x_")) return "منصة X";
  return "إدخال يدوي";
}

function estimateSentiment(score: number) {
  if (score <= 30) return "negative";
  if (score < 40) return "neutral";
  return "positive";
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toSource(row: DbSourceRow): Source {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    url: row.url,
    feedUrl: row.feed_url ?? undefined,
    handle: row.handle ?? undefined,
    country: row.country ?? "السعودية",
    credibility: row.credibility,
    isVerifiedSource: row.is_verified_source,
    isActive: row.is_active ?? true,
    lastCheckedAt: row.last_checked_at ?? undefined,
    lastSuccessAt: row.last_success_at ?? undefined,
    lastError: row.last_error ?? undefined,
    pollIntervalMinutes: row.poll_interval_minutes ?? 1440,
    logoUrl: row.logo_url ?? undefined,
  };
}

function toKeywordRule(row: DbKeywordRuleRow): KeywordRule {
  return {
    id: row.id,
    requiredTerms: row.required_terms ?? [],
    optionalTerms: row.optional_terms ?? [],
    excludeTerms: row.exclude_terms ?? [],
    language: row.language ?? "mixed",
    sourceType: row.source_type ?? undefined,
    priority: row.priority ?? 0,
    activeFrom: row.active_from ?? "2026-02-01",
    activeTo: row.active_to ?? undefined,
    version: row.version ?? 1,
  };
}

function toSourceRule(row: DbSourceRuleRow): SourceRule {
  return {
    id: row.id,
    organizationId: row.organization_id,
    topicId: row.topic_id,
    sourceId: row.source_id,
    type: row.type,
    query: row.query,
    url: row.url,
    cursor: row.cursor,
    active: row.active ?? true,
    pollIntervalMinutes: row.poll_interval_minutes ?? 1440,
    createdAt: row.created_at,
  };
}

function toJob(row: DbJobRow): Job {
  return {
    id: row.id,
    organizationId: row.organization_id,
    jobType: row.job_type,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    attempts: row.attempts,
    payload: row.payload,
    failureReason: row.failure_reason,
    availableAt: row.available_at,
    createdAt: row.created_at,
  };
}

function toConnectorRun(row: DbConnectorRunRow): ConnectorRun {
  return {
    id: row.id,
    organizationId: row.organization_id,
    sourceRuleId: row.source_rule_id,
    status: row.status,
    cursorBefore: row.cursor_before,
    cursorAfter: row.cursor_after,
    fetchedCount: row.fetched_count,
    failureReason: row.failure_reason,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

async function buildAutomationHealth(input: {
  listSourceRules: () => Promise<SourceRule[]>;
  listConnectorRuns: () => Promise<ConnectorRun[]>;
  listJobs: () => Promise<Job[]>;
}) {
  const base = {
    schemaReady: true,
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
    connectorCronPath: "/api/cron/run-connectors",
    connectorCronScheduleUtc: "15 5 * * *",
    mocksEnabled:
      process.env.NODE_ENV !== "production" &&
      (process.env.RASD_CONNECTOR_MOCKS === "true" || process.env.CONNECTOR_MOCK_MODE === "true"),
  };

  try {
    const [sourceRules, connectorRuns, jobs, tiktokHealth, instagramHealth, mediaMetadataExtractor] = await Promise.all([
      input.listSourceRules(),
      input.listConnectorRuns(),
      input.listJobs(),
      new TikTokResearchConnector().testConnection(),
      new InstagramPublicProfileConnector().testConnection(),
      getMediaMetadataHealth(),
    ]);
    const failedJobs = jobs.filter((job) => job.status === "failed" || job.status === "dead_letter");
    const activeRules = sourceRules.filter((rule) => rule.active);
    return {
      ...base,
      sourceRulesCount: sourceRules.length,
      activeSourceRulesCount: activeRules.length,
      queuedJobsCount: jobs.filter((job) => job.status === "queued" || job.status === "running").length,
      failedJobsCount: failedJobs.length,
      latestRun: connectorRuns[0] ?? null,
      latestFailedJob: failedJobs[0] ?? null,
      mediaMetadataExtractor,
      tiktok: {
        status: tiktokHealth.status,
        message: tiktokHealth.message,
        enabled: process.env.TIKTOK_RESEARCH_ENABLED === "true",
        credentialsConfigured: Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),
        activeRulesCount: activeRules.filter((rule) => rule.type === "tiktok_research").length,
      },
      instagram: {
        status: instagramHealth.status,
        message: instagramHealth.message,
        enabled: process.env.INSTAGRAM_WATCHLIST_ENABLED === "true",
        extractorConfigured: instagramHealth.status === "healthy",
        activeRulesCount: activeRules.filter((rule) => rule.type === "instagram_public_profile").length,
      },
    };
  } catch (error) {
    return {
      ...base,
      schemaReady: false,
      schemaError: error instanceof Error ? error.message : String(error),
      sourceRulesCount: 0,
      activeSourceRulesCount: 0,
      queuedJobsCount: 0,
      failedJobsCount: 0,
      latestRun: null,
      latestFailedJob: null,
      mediaMetadataExtractor: await getMediaMetadataHealth().catch(() => ({
        enabled: false,
        mode: "auto" as const,
        ytDlpAvailable: false,
        cookiesConfigured: Boolean(process.env.YTDLP_COOKIES_TXT || process.env.YTDLP_COOKIES_PATH),
        proxyConfigured: Boolean(process.env.YTDLP_PROXY_URL),
        status: "degraded" as const,
        message: "Media metadata extractor health is unavailable.",
      })),
      tiktok: {
        status: "not_configured",
        message: "Source-rule health is unavailable until migrations are applied.",
        enabled: process.env.TIKTOK_RESEARCH_ENABLED === "true",
        credentialsConfigured: Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),
        activeRulesCount: 0,
      },
      instagram: {
        status: "not_configured",
        message: "Source-rule health is unavailable until migrations are applied.",
        enabled: process.env.INSTAGRAM_WATCHLIST_ENABLED === "true",
        extractorConfigured: false,
        activeRulesCount: 0,
      },
    };
  }
}

function normalizeTerms(terms: string[] | undefined) {
  return Array.from(new Set((terms ?? []).map((term) => term.trim()).filter(Boolean)));
}

function isUuid(value: string | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value));
}

function platformFromUrl(value: string) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com")) {
      return "X";
    }
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      return "TikTok";
    }
    if (host === "instagram.com" || host === "instagr.am" || host.endsWith(".instagram.com")) {
      return "Instagram";
    }
    return "Website";
  } catch {
    return "Unknown";
  }
}

function xStatusIdFromUrl(value: string) {
  try {
    return new URL(value).pathname.match(/\/status\/(\d+)/u)?.[1] ?? null;
  } catch {
    return null;
  }
}

function isWeakManualTitle(row: DbItemRow) {
  const title = row.title ?? "";
  return title === row.original_url || title.startsWith("http") || title.includes("رابط يدوي");
}

function isWeakManualSummary(row: DbItemRow) {
  const summary = row.summary ?? "";
  return summary === row.original_url || summary.startsWith("تم حفظ الرابط");
}

function rawObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toReport(row: DbReportRow): ReportVersion {
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    title: row.title,
    periodStart: row.period_start ?? "2026-02-14",
    periodEnd: row.period_end ?? row.period_start ?? "2026-02-14",
    publishedAt: row.published_at ?? undefined,
    secureUrl: `/reports/${row.id}`,
  };
}

function toCapture(row: DbCaptureRow): Capture {
  return {
    id: row.id,
    itemId: row.monitoring_item_id,
    kind: row.kind,
    status: row.status,
    capturedAt: row.captured_at ?? undefined,
    assetUrl: row.asset_url ?? undefined,
    failureReason: row.failure_reason ?? undefined,
  };
}

function toReportItem(row: DbReportItemRow) {
  return {
    id: row.id,
    reportId: row.report_id,
    itemId: row.monitoring_item_id,
    warningAccepted: Boolean(row.warning),
    addedAt: row.created_at,
  };
}

async function toItems(supabase: SupabaseClient, rows: DbItemRow[]): Promise<MonitoringItem[]> {
  const ids = rows.map((row) => row.id);
  const captureIds = new Set<string>();

  if (ids.length) {
    const { data, error } = await supabase
      .from("captures")
      .select("monitoring_item_id")
      .in("monitoring_item_id", ids)
      .eq("kind", "report_grade")
      .eq("status", "success");

    if (error) throw error;
    for (const row of (data ?? []) as Array<{ monitoring_item_id: string }>) {
      captureIds.add(row.monitoring_item_id);
    }
  }

  return rows.map((row) => {
    const raw = rawObject(row.raw_response);
    const rawDiscoveryMethod = raw.discoveryMethod;
    const discoveryMethod =
      rawDiscoveryMethod === "manual" || rawDiscoveryMethod === "rss" || rawDiscoveryMethod === "auto_search"
        ? rawDiscoveryMethod
        : row.source_type === "x_recent_search"
          ? "auto_search"
          : row.source_type === "rss"
            ? "rss"
            : undefined;

    return {
      id: row.id,
      sourceId: row.source_id ?? "",
      sourceName: row.sources?.name ?? sourceLabel(row.source_type),
      sourceType: row.source_type,
      state: row.state,
      title: row.title ?? row.original_url,
      originalUrl: row.original_url,
      authorName: row.author_name ?? undefined,
      authorHandle: row.author_handle ?? undefined,
      publishedAt: row.published_at ?? row.created_at,
      summary: row.summary ?? "",
      summarySourceText: row.summary_source_text ?? row.summary ?? row.original_url,
      sentiment: row.sentiment ?? "neutral",
      sentimentConfidence: row.sentiment_confidence ?? 50,
      relevanceScore: row.relevance_score ?? 0,
      relevanceReason: row.relevance_reason ?? "",
      matchedTerms: row.matched_terms ?? [],
      dedupeKey: row.canonical_url_hash ?? row.source_item_id ?? row.id,
      hasReportGradeCapture: captureIds.has(row.id),
      warning: row.warning ?? undefined,
      sourceItemId: row.source_item_id ?? undefined,
      discoveryMethod,
      organizationId: row.organization_id,
      topicId: row.topic_id,
    };
  });
}

async function ensureDefaultWorkspace(supabase: SupabaseClient) {
  const { error } = await supabase.from("organizations").upsert(
    {
      id: DEFAULT_ORGANIZATION_ID,
      name: DEFAULT_ORGANIZATION_NAME,
      slug: DEFAULT_ORGANIZATION_SLUG,
    },
    { onConflict: "id" },
  );
  if (error) throw error;

  const batches: Array<{ table: string; rows: DbRow[]; onConflict: string }> = [
    {
      table: "topics",
      onConflict: "id",
      rows: [
        {
          id: DEFAULT_TOPIC_ID,
          organization_id: DEFAULT_ORGANIZATION_ID,
          name: "رصد هاكثون هداية",
          description: "مساحة العمل الافتراضية لحفظ مواد الرصد والمراجعات والتقارير.",
          period_start: "2026-02-14",
          period_end: "2026-02-18",
          status: "active",
        },
      ],
    },
    {
      table: "sources",
      onConflict: "id",
      rows: [
        {
          id: DEFAULT_MANUAL_SOURCE_ID,
          organization_id: DEFAULT_ORGANIZATION_ID,
          name: "إدخال يدوي",
          type: "manual_url",
          url: "manual://intake",
          country: "السعودية",
          credibility: "public",
          is_verified_source: false,
        },
      ],
    },
    {
      table: "usage_limits",
      onConflict: "id",
      rows: [
        {
          id: DEFAULT_USAGE_LIMIT_ID,
          organization_id: DEFAULT_ORGANIZATION_ID,
          topic_id: DEFAULT_TOPIC_ID,
          max_x_reads_per_day: usageLimit.maxXReadsPerDay,
          max_x_reads_per_month: usageLimit.maxXReadsPerMonth,
          max_ai_tokens_per_month: usageLimit.maxAiTokensPerMonth,
          max_screenshots_per_month: usageLimit.maxScreenshotsPerMonth,
          max_storage_mb: usageLimit.maxStorageMb,
          hard_stop_enabled: usageLimit.hardStopEnabled,
          warning_threshold_percent: usageLimit.warningThresholdPercent,
        },
      ],
    },
    {
      table: "report_templates",
      onConflict: "id",
      rows: [
        {
          id: DEFAULT_TEMPLATE_ID,
          organization_id: DEFAULT_ORGANIZATION_ID,
          key: "HidayathonMediaMonitoringTemplate",
          name: "قالب تقرير رصد هاكثون هداية",
          sections: ["cover_page", "stats_page", "item_card_pages", "thank_you_page"],
          active: true,
        },
      ],
    },
    {
      table: "reports",
      onConflict: "id",
      rows: [
        {
          id: DEFAULT_REPORT_ID,
          organization_id: DEFAULT_ORGANIZATION_ID,
          topic_id: DEFAULT_TOPIC_ID,
          template_id: DEFAULT_TEMPLATE_ID,
          title: "تقرير رصد هاكثون هداية",
          version: 1,
          status: "draft",
          period_start: "2026-02-14",
          period_end: "2026-02-18",
        },
      ],
    },
  ];

  for (const batch of batches) {
    const { error: batchError } = await supabase.from(batch.table).upsert(batch.rows, {
      onConflict: batch.onConflict,
    });
    if (batchError) throw batchError;
  }
}

async function audit(
  supabase: SupabaseClient,
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
) {
  const row = {
    organization_id: DEFAULT_ORGANIZATION_ID,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    metadata: metadata ?? {},
  };
  const { data, error } = await supabase.from("audit_logs").insert(row).select("*").single();
  if (error) throw error;
  return {
    id: (data as { id: string }).id,
    action,
    entityId: entityId ?? "",
    actorRole: "editor" as const,
    metadata,
    createdAt: (data as { created_at: string }).created_at,
  };
}

async function refreshSupabaseManualDuplicate(
  supabase: SupabaseClient,
  row: DbItemRow,
  input: ManualUrlInput,
  canonicalUrl: string,
  canonicalHash: string,
  platform: string,
) {
  const patch: DbRow = {};
  const sourceType = row.source_type;
  const discoveryMethod = input.discoveryMethod ?? (sourceType === "x_recent_search" ? "auto_search" : "manual");
  let screenshotUrl = evidenceCardUrl(row.id);
  const targetUrl = canonicalUrl || row.original_url;
  if (targetUrl && isSafePublicHttpUrl(targetUrl)) {
    screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}&screenshot=true&embed=screenshot.url`;
  }

  if (input.title && (isWeakManualTitle(row) || input.title.length > (row.title ?? "").length)) {
    patch.title = input.title;
  }
  if (input.text && (isWeakManualSummary(row) || input.text.length > (row.summary ?? "").length)) {
    patch.summary = input.text;
    patch.summary_source_text = input.text;
    patch.normalized_text_hash = await sha256(input.text);
  }
  if (input.authorName && (!row.author_name || row.author_name === "غير محدد")) {
    patch.author_name = input.authorName;
  }
  if (input.authorHandle && !row.author_handle) {
    patch.author_handle = input.authorHandle;
  }
  if (input.publishedAt) {
    patch.published_at = input.publishedAt;
  }

  const existingStatusId = xStatusIdFromUrl(row.original_url);
  const incomingStatusId = xStatusIdFromUrl(canonicalUrl);
  if (row.original_url !== canonicalUrl && existingStatusId && existingStatusId === incomingStatusId) {
    patch.original_url = canonicalUrl;
  }
  if (row.source_type === (input.sourceType ?? row.source_type) && row.canonical_url_hash !== canonicalHash) {
    patch.canonical_url_hash = canonicalHash;
    patch.source_item_id = canonicalHash;
  }

  const title = String(patch.title ?? row.title ?? "");
  const summary = String(patch.summary ?? row.summary ?? "");
  const rule = keywordRules[0];
  const match = explainKeywordMatch(`${title} ${summary} ${canonicalUrl}`, rule);
  if (row.state === "archived" || row.state === "rejected") {
    patch.state = match.score > 0 ? "needs_review" : "candidate";
  }
  if (match.score > (row.relevance_score ?? 0)) {
    patch.relevance_score = match.score;
    patch.relevance_reason = match.reason;
    patch.matched_terms = match.matchedTerms;
    patch.sentiment = estimateSentiment(match.score);
    patch.sentiment_confidence = Math.max(50, Math.min(95, match.score));
    if (row.state === "candidate") patch.state = "needs_review";
  }

  patch.evidence_image_path = screenshotUrl;
  patch.raw_response = {
    ...rawObject(row.raw_response),
    manual: sourceType === "manual_url",
    discoveryMethod,
    platform,
    sourcePdf: "live-hidayathon",
    publishedDateText: String(patch.published_at ?? row.published_at ?? now()),
    extractedUrls: Array.from(new Set([canonicalUrl, row.original_url].filter(Boolean))),
    input: {
      ...rawObject(rawObject(row.raw_response).input),
      ...input,
    },
    contentImagePath: screenshotUrl,
    sourceEvidenceImagePath: screenshotUrl,
  };

  const { data, error } = await supabase
    .from("monitoring_items")
    .update(patch)
    .eq("id", row.id)
    .select("*, sources(name)")
    .single();
  if (error) throw error;

  const { data: staleCaptures, error: staleCaptureError } = await supabase
    .from("captures")
    .select("id, asset_url")
    .eq("monitoring_item_id", row.id)
    .eq("status", "success");
  if (staleCaptureError) throw staleCaptureError;

  const staleCaptureIds = ((staleCaptures ?? []) as Array<{ id: string; asset_url: string | null }>)
    .filter((capture) => !capture.asset_url || capture.asset_url === "/window.svg" || capture.asset_url.includes("evidence-card.svg"))
    .map((capture) => capture.id);

  if (staleCaptureIds.length) {
    const { error: captureUpdateError } = await supabase
      .from("captures")
      .update({ asset_url: screenshotUrl })
      .in("id", staleCaptureIds);
    if (captureUpdateError) throw captureUpdateError;
  }

  const { data: reportItems, error: reportItemsError } = await supabase
    .from("report_items")
    .select("id, card_data")
    .eq("monitoring_item_id", row.id);
  if (reportItemsError) throw reportItemsError;

  for (const reportItem of (reportItems ?? []) as Array<{ id: string; card_data: Record<string, unknown> | null }>) {
    const { error: reportItemError } = await supabase
      .from("report_items")
      .update({
        card_data: {
          ...(reportItem.card_data ?? {}),
          title: patch.title ?? row.title,
          summary: patch.summary ?? row.summary,
          original_url: patch.original_url ?? row.original_url,
          source_name: input.sourceName ?? input.authorName ?? row.author_name ?? sourceLabel(row.source_type),
          screenshot_url: screenshotUrl,
          content_image_url: screenshotUrl,
        },
      })
      .eq("id", reportItem.id);
    if (reportItemError) throw reportItemError;
  }

  await audit(supabase, "item.metadata_refreshed", "monitoring_item", row.id, {
    sourceType,
    metadataSource: platform,
  });

  return (await toItems(supabase, [data as DbItemRow]))[0];
}

async function getUsageSnapshot(supabase: SupabaseClient): Promise<UsageSnapshot> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("usage_events")
    .select("event_type, units, created_at")
    .eq("organization_id", DEFAULT_ORGANIZATION_ID)
    .gte("created_at", monthStart.toISOString());

  if (error) throw error;

  const snapshot: UsageSnapshot = {
    xReadsToday: 0,
    xReadsThisMonth: 0,
    aiTokensThisMonth: 0,
    screenshotsThisMonth: 0,
    storageMb: 0,
  };

  for (const event of (data ?? []) as Array<{ event_type: string; units: number; created_at: string }>) {
    if (event.event_type === "x_read") {
      snapshot.xReadsThisMonth += event.units;
      if (new Date(event.created_at) >= dayStart) snapshot.xReadsToday += event.units;
    }
    if (event.event_type === "ai_tokens") snapshot.aiTokensThisMonth += event.units;
    if (event.event_type === "screenshot") snapshot.screenshotsThisMonth += event.units;
    if (event.event_type === "storage_mb") snapshot.storageMb += event.units;
  }

  return snapshot;
}

async function getItemOrThrow(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("monitoring_items")
    .select("*, sources(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("item_not_found");
  return (await toItems(supabase, [data as DbItemRow]))[0];
}

async function getRssSourceOrThrow(supabase: SupabaseClient, sourceId: string) {
  const { data, error } = await supabase.from("sources").select("*").eq("id", sourceId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("source_not_found");
  const source = toSource(data as DbSourceRow);
  if (source.type !== "rss" || !source.feedUrl) throw new Error("source_not_rss");
  return source;
}

async function findSupabaseRssDuplicate(supabase: SupabaseClient, ingested: RssIngestionItem) {
  const canonicalHash = `rss:url:${await sha256(ingested.canonicalUrlHashInput)}`;
  const sourceItemId = `rss:item:${await sha256(ingested.sourceItemKeyInput)}`;
  const { data, error } = await supabase
    .from("monitoring_items")
    .select("id")
    .eq("organization_id", DEFAULT_ORGANIZATION_ID)
    .or(`canonical_url_hash.eq.${canonicalHash},source_item_id.eq.${sourceItemId}`)
    .limit(1);
  if (error) throw error;

  return {
    canonicalHash,
    sourceItemId,
    duplicate: Boolean((data ?? [])[0]),
  };
}

export const persistentStore = {
  async health() {
    if (!shouldUseSupabase()) return store.health();

    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const [items, usage, automation] = await Promise.all([
      this.listItems(),
      getUsageSnapshot(supabase),
      buildAutomationHealth({
        listSourceRules: () => this.listSourceRules(DEFAULT_ORGANIZATION_ID),
        listConnectorRuns: () => this.listConnectorRuns(DEFAULT_ORGANIZATION_ID),
        listJobs: () => this.listJobs(DEFAULT_ORGANIZATION_ID),
      }),
    ]);
    const auditLogs = await this.listAuditLogs();
    const dynamicHealth: HealthMetric[] = [
      {
        label: "Database workflow",
        value: `${items.length} مواد / ${auditLogs.length} أحداث تدقيق`,
        status: "good",
      },
      { label: "Persistence", value: "Supabase configured", status: "good" },
    ];

    return {
      status: "ok",
      metrics: dynamicHealth,
      connectors: {
        manual_url: "healthy",
        rss: "healthy",
        web_page: "degraded",
        x_oembed: "not_configured",
        x_recent_search: "ready",
        tiktok_research: automation.tiktok.status,
        instagram_public_profile: automation.instagram.status,
      },
      usage,
      mediaMetadataExtractor: automation.mediaMetadataExtractor,
      automation,
    };
  },

  async listItems() {
    if (!shouldUseSupabase()) return store.listItems();
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const { data, error } = await supabase
      .from("monitoring_items")
      .select("*, sources(name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return toItems(supabase, (data ?? []) as DbItemRow[]);
  },

  async listSources() {
    if (!shouldUseSupabase()) return store.listSources();
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const { data, error } = await supabase.from("sources").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as DbSourceRow[]).map(toSource);
  },

  async listSourceRules(organizationId: string) {
    if (!shouldUseSupabase()) return store.listSourceRules(organizationId);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const { data, error } = await supabase
      .from("source_rules")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as DbSourceRuleRow[]).map(toSourceRule);
  },

  async upsertSourceRule(input: Partial<SourceRule> & { organizationId: string; topicId: string; type: SourceType }) {
    if (!shouldUseSupabase()) return store.upsertSourceRule(input);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const id = input.id ?? crypto.randomUUID();
    const { data, error } = await supabase
      .from("source_rules")
      .upsert({
        id,
        organization_id: input.organizationId,
        topic_id: input.topicId,
        source_id: input.sourceId ?? null,
        type: input.type,
        query: input.query ?? null,
        url: input.url ?? null,
        cursor: input.cursor ?? null,
        active: input.active ?? true,
        poll_interval_minutes: input.pollIntervalMinutes ?? 1440,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toSourceRule(data as DbSourceRuleRow);
  },

  async deleteSourceRule(id: string) {
    if (!shouldUseSupabase()) return store.deleteSourceRule(id);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const { data, error } = await supabase
      .from("source_rules")
      .delete()
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  },

  async listKeywordRules() {
    if (!shouldUseSupabase()) return store.listKeywordRules();
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const { data, error } = await supabase
      .from("keyword_rules")
      .select("*")
      .eq("organization_id", DEFAULT_ORGANIZATION_ID)
      .eq("topic_id", DEFAULT_TOPIC_ID)
      .order("priority", { ascending: false })
      .order("version", { ascending: false });
    if (error) throw error;
    const rules = ((data ?? []) as DbKeywordRuleRow[]).map(toKeywordRule).filter((rule) => !rule.activeTo || new Date(rule.activeTo).getTime() >= Date.now());
    return rules.length ? rules : store.listKeywordRules();
  },

  async upsertKeywordRule(input: Partial<KeywordRule>) {
    if (!shouldUseSupabase()) return store.upsertKeywordRule(input);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const current = (await this.listKeywordRules())[0] ?? keywordRules[0];
    const next: KeywordRule = {
      ...current,
      ...input,
      id: isUuid(input.id) ? input.id! : isUuid(current.id) ? current.id : crypto.randomUUID(),
      requiredTerms: normalizeTerms(input.requiredTerms ?? current.requiredTerms),
      optionalTerms: normalizeTerms(input.optionalTerms ?? current.optionalTerms),
      excludeTerms: normalizeTerms(input.excludeTerms ?? current.excludeTerms),
      language: input.language ?? current.language,
      priority: Number.isInteger(input.priority) ? input.priority! : current.priority,
      activeFrom: input.activeFrom ?? current.activeFrom,
      activeTo: input.activeTo,
      version: (current.version ?? 1) + 1,
    };
    const { data, error } = await supabase
      .from("keyword_rules")
      .upsert({
        id: next.id,
        organization_id: DEFAULT_ORGANIZATION_ID,
        topic_id: DEFAULT_TOPIC_ID,
        required_terms: next.requiredTerms,
        optional_terms: next.optionalTerms,
        exclude_terms: next.excludeTerms,
        language: next.language,
        source_type: next.sourceType ?? null,
        priority: next.priority,
        active_from: next.activeFrom,
        active_to: next.activeTo ?? null,
        version: next.version,
      })
      .select("*")
      .single();
    if (error) throw error;
    const rule = toKeywordRule(data as DbKeywordRuleRow);
    await audit(supabase, "keyword_rule.updated", "keyword_rule", rule.id, {
      requiredTerms: rule.requiredTerms.length,
      optionalTerms: rule.optionalTerms.length,
      excludeTerms: rule.excludeTerms.length,
    });
    return rule;
  },

  async listReports() {
    if (!shouldUseSupabase()) return store.listReports();
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const { data, error } = await supabase.from("reports").select("*").order("version", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as DbReportRow[]).map(toReport);
  },

  async getHidayathonLiveReport() {
    if (!shouldUseSupabase()) return store.getHidayathonLiveReport();
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const { data, error } = await supabase.from("reports").select("*").eq("id", DEFAULT_REPORT_ID).single();
    if (error) throw error;
    return toReport(data as DbReportRow);
  },

  async listAuditLogs() {
    if (!shouldUseSupabase()) return store.listAuditLogs();
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      entityId: row.entity_id ?? "",
      actorRole: "editor" as const,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));
  },

  async listCaptures(itemId?: string) {
    if (!shouldUseSupabase()) return store.listCaptures(itemId);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    let query = supabase.from("captures").select("*").order("created_at", { ascending: false });
    if (itemId) query = query.eq("monitoring_item_id", itemId);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as DbCaptureRow[]).map(toCapture);
  },

  async getCaptureAsset(captureId: string): Promise<StoredCaptureAsset> {
    if (!shouldUseSupabase()) throw new Error("capture_asset_not_in_storage");
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);

    const { data, error } = await supabase.from("captures").select("*").eq("id", captureId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("capture_not_found");

    const capture = data as DbCaptureRow;
    const reference = parseEvidenceStorageReference(capture.html_archive_url);
    if (!reference) throw new Error("capture_asset_not_in_storage");

    const { data: blob, error: downloadError } = await supabase.storage.from(reference.bucket).download(reference.path);
    if (downloadError) throw downloadError;

    return {
      body: new Uint8Array(await blob.arrayBuffer()),
      contentType: blob.type || "application/octet-stream",
    };
  },

  async listReportItems(reportId: string) {
    if (!shouldUseSupabase()) return store.listReportItems(reportId);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const { data, error } = await supabase
      .from("report_items")
      .select("id, report_id, monitoring_item_id, warning, created_at")
      .eq("report_id", reportId)
      .order("display_order", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as DbReportItemRow[]).map(toReportItem);
  },

  async createSource(input: SourceCreateInput) {
    if (!shouldUseSupabase()) return store.createSource(input);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const normalized = normalizeSourceCreateInput(input);
    const { data, error } = await supabase
      .from("sources")
      .insert({
        organization_id: DEFAULT_ORGANIZATION_ID,
        name: normalized.name ?? sourceLabel(normalized.type),
        type: normalized.type,
        url: normalized.url,
        feed_url: normalized.feedUrl ?? null,
        country: "السعودية",
        credibility: normalized.credibility,
        is_verified_source: false,
        is_active: normalized.isActive,
        poll_interval_minutes: normalized.pollIntervalMinutes,
      })
      .select("*")
      .single();
    if (error) throw error;
    await audit(supabase, "source.created", "source", (data as DbSourceRow).id, { type: normalized.type });
    return toSource(data as DbSourceRow);
  },

  async updateSourceSchedule(id: string, input: { isActive?: boolean; pollIntervalMinutes?: number }) {
    if (!shouldUseSupabase()) return store.updateSourceSchedule(id, input);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);

    const patch: DbRow = {};
    if (typeof input.isActive === "boolean") patch.is_active = input.isActive;
    if (typeof input.pollIntervalMinutes === "number") {
      if (!Number.isInteger(input.pollIntervalMinutes) || input.pollIntervalMinutes < 15 || input.pollIntervalMinutes > 10080) {
        throw new SourceValidationError("poll_interval_minutes must be between 15 and 10080");
      }
      patch.poll_interval_minutes = input.pollIntervalMinutes;
    }

    if (!Object.keys(patch).length) {
      const source = (await this.listSources()).find((entry) => entry.id === id);
      if (!source) throw new Error("source_not_found");
      return source;
    }

    const { data, error } = await supabase
      .from("sources")
      .update(patch)
      .eq("organization_id", DEFAULT_ORGANIZATION_ID)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("source_not_found");

    const source = toSource(data as DbSourceRow);
    await audit(supabase, "source.schedule_updated", "source", source.id, {
      isActive: source.isActive,
      pollIntervalMinutes: source.pollIntervalMinutes,
    });
    return source;
  },

  async ingestRssSource(sourceId: string, options: RssIngestOptions = {}) {
    if (!shouldUseSupabase()) return store.ingestRssSource(sourceId, options);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const source = await getRssSourceOrThrow(supabase, sourceId);
    const checkedAt = now();

    await supabase.from("sources").update({ last_checked_at: checkedAt }).eq("id", source.id);

    try {
      const feed = await fetchRssFeed(source.feedUrl!, options.fetcher);
      const rule = (await this.listKeywordRules())[0] ?? keywordRules[0];
      let created = 0;
      let duplicates = 0;
      let failed = 0;
      let skipped = 0;
      const createdItems: MonitoringItem[] = [];

      for (const entry of feed.entries) {
        try {
          if (!evaluateRssEntryRelevance(entry, rule).ok) {
            skipped += 1;
            continue;
          }

          const ingested = buildRssIngestionItem(source, entry, checkedAt, rule);
          const duplicate = await findSupabaseRssDuplicate(supabase, ingested);
          if (duplicate.duplicate) {
            duplicates += 1;
            continue;
          }

          const { data, error } = await supabase
            .from("monitoring_items")
            .insert({
              organization_id: DEFAULT_ORGANIZATION_ID,
              topic_id: DEFAULT_TOPIC_ID,
              source_id: source.id,
              source_type: "rss",
              state: ingested.item.state,
              title: ingested.item.title,
              original_url: ingested.item.originalUrl,
              canonical_url_hash: duplicate.canonicalHash,
              source_item_id: duplicate.sourceItemId,
              normalized_text_hash: await sha256(ingested.normalizedText),
              author_name: ingested.item.authorName ?? null,
              author_handle: ingested.item.authorHandle ?? null,
              published_at: ingested.item.publishedAt,
              summary: ingested.item.summary,
              summary_source_text: ingested.item.summarySourceText,
              sentiment: ingested.item.sentiment,
              sentiment_confidence: ingested.item.sentimentConfidence,
              relevance_score: ingested.item.relevanceScore,
              relevance_reason: ingested.item.relevanceReason,
              matched_terms: ingested.item.matchedTerms,
              raw_response: ingested.rawResponse,
              warning: ingested.item.warning ?? null,
            })
            .select("*, sources(name)")
            .single();
          if (error) throw error;

          const item = (await toItems(supabase, [data as DbItemRow]))[0];
          createdItems.push(item);
          created += 1;
          await audit(supabase, "item.ingested", "monitoring_item", item.id, {
            sourceType: "rss",
            sourceId: source.id,
            canonicalUrl: ingested.canonicalUrl,
          });
        } catch {
          failed += 1;
        }
      }

      const successAt = now();
      await supabase
        .from("sources")
        .update({ last_success_at: successAt, last_error: null })
        .eq("id", source.id);
      await audit(supabase, "source.rss_polled", "source", source.id, {
        fetched: feed.entries.length,
        created,
        duplicates,
        skipped,
        failed,
      });

      return {
        source: {
          ...source,
          lastCheckedAt: checkedAt,
          lastSuccessAt: successAt,
          lastError: undefined,
        },
        feed,
        fetched: feed.entries.length,
        created,
        duplicates,
        skipped,
        failed,
        items: createdItems,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "rss_ingestion_failed";
      await supabase.from("sources").update({ last_error: message }).eq("id", source.id);
      await audit(supabase, "source.rss_poll_failed", "source", source.id, { error: message });
      throw error;
    }
  },

  async ingestManualUrl(input: ManualUrlInput) {
    if (!shouldUseSupabase()) return store.ingestManualUrl(input);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);

    const canonicalUrl = canonicalizeUrl(input.url);
    const publishedAt = input.publishedAt ?? now();
    const platform = platformFromUrl(canonicalUrl);
    const sourceType = input.sourceType ?? "manual_url";
    const discoveryMethod = input.discoveryMethod ?? (sourceType === "x_recent_search" ? "auto_search" : "manual");
    const dedupeKey = makeDedupeKey(
      {
        url: canonicalUrl,
        title: input.title ?? canonicalUrl,
        text: input.text ?? input.title ?? canonicalUrl,
        authorName: input.authorName,
        authorHandle: input.authorHandle,
        publishedAt,
        raw: input,
      },
      sourceType,
    );
    const canonicalHash = `${sourceType}:${await sha256(dedupeKey)}`;
    const { data: duplicate, error: duplicateError } = await supabase
      .from("monitoring_items")
      .select("*, sources(name)")
      .eq("organization_id", DEFAULT_ORGANIZATION_ID)
      .eq("canonical_url_hash", canonicalHash)
      .maybeSingle();
    if (duplicateError) throw duplicateError;

    let duplicateType: "url" | "content" | null = null;
    let duplicateRow = duplicate as DbItemRow | null;
    if (duplicateRow) {
      duplicateType = "url";
    }

    const statusId = xStatusIdFromUrl(canonicalUrl);
    if (!duplicateRow && statusId) {
      const { data: statusMatches, error: statusMatchError } = await supabase
        .from("monitoring_items")
        .select("*, sources(name)")
        .eq("organization_id", DEFAULT_ORGANIZATION_ID)
        .in("source_type", ["manual_url", "x_recent_search"])
        .like("original_url", `%/status/${statusId}%`)
        .limit(1);
      if (statusMatchError) throw statusMatchError;
      duplicateRow = ((statusMatches ?? []) as DbItemRow[])[0] ?? null;
      if (duplicateRow) {
        duplicateType = "url";
      }
    }

    if (!duplicateRow && input.text && input.text.trim().length > 30) {
      const textHash = await sha256(input.text);
      const { data: textMatches, error: textMatchError } = await supabase
        .from("monitoring_items")
        .select("*, sources(name)")
        .eq("organization_id", DEFAULT_ORGANIZATION_ID)
        .eq("normalized_text_hash", textHash)
        .limit(1);
      if (textMatchError) throw textMatchError;
      duplicateRow = ((textMatches ?? []) as DbItemRow[])[0] ?? null;
      if (duplicateRow) {
        duplicateType = "content";
      }
    }

    if (duplicateRow) {
      const item = await refreshSupabaseManualDuplicate(supabase, duplicateRow, input, canonicalUrl, canonicalHash, platform);
      await audit(supabase, "item.duplicate_detected", "monitoring_item", item.id, { dedupeKey, duplicateType });
      return { item, duplicate: true, duplicateType };
    }

    const rule = keywordRules[0];
    const match = explainKeywordMatch(`${input.title ?? ""} ${input.text ?? ""} ${canonicalUrl}`, rule);
    const { data: row, error } = await supabase
      .from("monitoring_items")
      .insert({
        organization_id: DEFAULT_ORGANIZATION_ID,
        topic_id: DEFAULT_TOPIC_ID,
        source_id: sourceType === "manual_url" ? DEFAULT_MANUAL_SOURCE_ID : null,
        source_type: sourceType,
        state: match.score > 0 ? "needs_review" : "candidate",
        title: input.title ?? "مادة مرصودة من رابط يدوي",
        original_url: canonicalUrl,
        canonical_url_hash: canonicalHash,
        source_item_id: canonicalHash,
        normalized_text_hash: await sha256(input.text ?? canonicalUrl),
        author_name: input.authorName ?? "غير محدد",
        author_handle: input.authorHandle ?? null,
        published_at: publishedAt,
        summary: input.text ?? "تم حفظ الرابط كدليل خفيف بانتظار مراجعة المحرر.",
        summary_source_text: input.text ?? canonicalUrl,
        sentiment: estimateSentiment(match.score),
        sentiment_confidence: Math.max(50, Math.min(95, match.score)),
        relevance_score: match.score,
        relevance_reason: match.reason,
        matched_terms: match.matchedTerms,
        warning: (input.extraction?.warning as string | undefined) ?? null,
        raw_response: {
          manual: sourceType === "manual_url",
          discoveryMethod,
          platform,
          sourcePdf: "live-hidayathon",
          publishedDateText: publishedAt,
          extractedUrls: [canonicalUrl],
          input,
          warning: input.extraction?.warning,
          warningDetail: input.extraction?.warningDetail,
        },
      })
      .select("*, sources(name)")
      .single();
    if (error) throw error;

    const insertedRow = row as DbItemRow;
    const initialItem = (await toItems(supabase, [insertedRow]))[0];
    const captureId = crypto.randomUUID();

    let screenshotUrl = evidenceCardUrl(insertedRow.id);
    let captureKind: CaptureKind = "evidence_lite";

    if (platform === "TikTok" || platform === "Instagram") {
      const metadataImageUrl = input.extraction?.imageUrl as string | undefined;
      if (metadataImageUrl && isSafePublicHttpUrl(metadataImageUrl)) {
        screenshotUrl = metadataImageUrl;
        captureKind = "preview";
      }
    } else if (insertedRow.original_url && isSafePublicHttpUrl(insertedRow.original_url)) {
      screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(insertedRow.original_url)}&screenshot=true&embed=screenshot.url`;
    }

    const storedEvidence = await persistEvidenceAsset({
      supabase,
      item: initialItem,
      captureId,
      kind: captureKind,
      sourceUrl: screenshotUrl,
      organizationId: insertedRow.organization_id,
      topicId: insertedRow.topic_id,
    });
    const { data: hydratedRow, error: hydrationError } = await supabase
      .from("monitoring_items")
      .update({
        evidence_image_path: storedEvidence.assetUrl,
        raw_response: {
          ...rawObject(insertedRow.raw_response),
          contentImagePath: storedEvidence.assetUrl,
          sourceEvidenceImagePath: storedEvidence.assetUrl,
          evidenceStorage: {
            persisted: storedEvidence.persisted,
            bucket: storedEvidence.bucket,
            path: storedEvidence.storagePath,
            contentType: storedEvidence.contentType,
            sizeBytes: storedEvidence.sizeBytes,
            failureReason: storedEvidence.failureReason,
          },
        },
      })
      .eq("id", insertedRow.id)
      .select("*, sources(name)")
      .single();
    if (hydrationError) throw hydrationError;

    const item = (await toItems(supabase, [hydratedRow as DbItemRow]))[0];
    const { data: captureRow, error: captureError } = await supabase
      .from("captures")
      .insert({
        id: captureId,
        organization_id: DEFAULT_ORGANIZATION_ID,
        monitoring_item_id: item.id,
        kind: captureKind,
        status: "success",
        captured_at: now(),
        asset_url: storedEvidence.assetUrl,
        html_archive_url:
          storedEvidence.persisted && storedEvidence.bucket && storedEvidence.storagePath
            ? evidenceStorageReference(storedEvidence.bucket, storedEvidence.storagePath)
            : null,
      })
      .select("*")
      .single();
    if (captureError) throw captureError;
    const evidence = toCapture(captureRow as DbCaptureRow);
    await audit(supabase, sourceType === "x_recent_search" ? "item.auto_discovered" : "item.ingested", "monitoring_item", item.id, {
      sourceType,
      evidenceId: evidence.id,
    });
    return { item, duplicate: false, duplicateType: null, evidence };
  },

  async reviewItem(id: string, action: ReviewAction, reviewNotes?: string) {
    if (!shouldUseSupabase()) return store.reviewItem(id, action, reviewNotes);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const current = await getItemOrThrow(supabase, id);
    const nextState: ItemState =
      action === "reject" ? "rejected" : current.hasReportGradeCapture ? "report_ready" : "approved_pending_capture";
    const { data, error } = await supabase
      .from("monitoring_items")
      .update({ state: nextState })
      .eq("id", id)
      .select("*, sources(name)")
      .single();
    if (error) throw error;
    const item = (await toItems(supabase, [data as DbItemRow]))[0];
    const auditLog = await audit(supabase, `item.${action}`, "monitoring_item", item.id, {
      reviewNotes: reviewNotes ?? null,
      nextState,
    });
    return { item, auditLog };
  },

  async updateItem(id: string, input: ItemCorrectionInput) {
    if (!shouldUseSupabase()) return store.updateItem(id, input);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);

    const { data: currentRow, error: currentError } = await supabase
      .from("monitoring_items")
      .select("*, sources(name)")
      .eq("organization_id", DEFAULT_ORGANIZATION_ID)
      .eq("id", id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!currentRow) throw new Error("item_not_found");

    const row = currentRow as DbItemRow;
    const previous = {
      title: row.title,
      summary: row.summary,
      authorName: row.author_name,
      authorHandle: row.author_handle,
      publishedAt: row.published_at,
      originalUrl: row.original_url,
    };
    const patch: DbRow = {};
    const changed: string[] = [];

    if (typeof input.title === "string" && input.title.trim() && input.title.trim() !== row.title) {
      patch.title = input.title.trim();
      changed.push("title");
    }
    if (typeof input.summary === "string" && input.summary.trim() && input.summary.trim() !== row.summary) {
      patch.summary = input.summary.trim();
      patch.summary_source_text = input.summary.trim();
      patch.normalized_text_hash = await sha256(input.summary.trim());
      changed.push("summary");
    }
    if (typeof input.authorName === "string" && input.authorName.trim() && input.authorName.trim() !== row.author_name) {
      patch.author_name = input.authorName.trim();
      changed.push("authorName");
    }
    if (typeof input.authorHandle === "string") {
      const nextHandle = input.authorHandle.trim() || null;
      if (nextHandle !== row.author_handle) {
        patch.author_handle = nextHandle;
        changed.push("authorHandle");
      }
    }
    if (typeof input.publishedAt === "string" && input.publishedAt.trim()) {
      const timestamp = Date.parse(input.publishedAt);
      if (Number.isNaN(timestamp)) throw new Error("published_at_invalid");
      const nextPublishedAt = new Date(timestamp).toISOString();
      if (nextPublishedAt !== row.published_at) {
        patch.published_at = nextPublishedAt;
        changed.push("publishedAt");
      }
    }
    if (typeof input.originalUrl === "string" && input.originalUrl.trim()) {
      const canonicalUrl = canonicalizeUrl(input.originalUrl.trim());
      if (!isSafePublicHttpUrl(canonicalUrl)) throw new Error("original_url_not_public");
      if (canonicalUrl !== row.original_url) {
        patch.original_url = canonicalUrl;
        patch.canonical_url_hash = `${row.source_type}:editor:${await sha256(canonicalUrl)}`;
        patch.source_item_id = patch.canonical_url_hash;
        changed.push("originalUrl");
      }
    }

    const nextTitle = String(patch.title ?? row.title ?? "");
    const nextSummary = String(patch.summary ?? row.summary ?? "");
    const nextUrl = String(patch.original_url ?? row.original_url);
    if (changed.length) {
      const match = explainKeywordMatch(`${nextTitle} ${nextSummary} ${nextUrl}`, keywordRules[0]);
      patch.relevance_score = match.score;
      patch.relevance_reason = match.reason;
      patch.matched_terms = match.matchedTerms;
      patch.sentiment = estimateSentiment(match.score);
      patch.sentiment_confidence = Math.max(50, Math.min(95, match.score));
      patch.raw_response = {
        ...rawObject(row.raw_response),
        sourcePdf: rawObject(row.raw_response).sourcePdf ?? "live-hidayathon",
        platform: rawObject(row.raw_response).platform ?? platformFromUrl(nextUrl),
        publishedDateText: String(patch.published_at ?? row.published_at ?? now()),
        extractedUrls: Array.from(new Set([nextUrl, row.original_url].filter(Boolean))),
        editorCorrections: [
          ...((rawObject(row.raw_response).editorCorrections as unknown[]) ?? []),
          {
            correctedAt: now(),
            changed,
            previous,
            next: {
              title: patch.title ?? row.title,
              summary: patch.summary ?? row.summary,
              authorName: patch.author_name ?? row.author_name,
              authorHandle: patch.author_handle ?? row.author_handle,
              publishedAt: patch.published_at ?? row.published_at,
              originalUrl: patch.original_url ?? row.original_url,
            },
          },
        ],
      };
    }

    if (!changed.length) {
      const item = (await toItems(supabase, [row]))[0];
      const auditLog = await audit(supabase, "item.corrected", "monitoring_item", item.id, { changed });
      return { item, auditLog, changed };
    }

    const { data, error } = await supabase
      .from("monitoring_items")
      .update(patch)
      .eq("organization_id", DEFAULT_ORGANIZATION_ID)
      .eq("id", id)
      .select("*, sources(name)")
      .single();
    if (error) throw error;

    const item = (await toItems(supabase, [data as DbItemRow]))[0];
    const { data: reportRows, error: reportRowsError } = await supabase
      .from("report_items")
      .select("id, card_data")
      .eq("monitoring_item_id", id);
    if (reportRowsError) throw reportRowsError;

    for (const reportItem of (reportRows ?? []) as Array<{ id: string; card_data: Record<string, unknown> | null }>) {
      const { error: reportUpdateError } = await supabase
        .from("report_items")
        .update({
          card_data: {
            ...(reportItem.card_data ?? {}),
            title: item.title,
            summary: item.summary,
            sentiment: item.sentiment,
            original_url: item.originalUrl,
            source_name: item.authorName ?? item.sourceName,
          },
        })
        .eq("id", reportItem.id);
      if (reportUpdateError) throw reportUpdateError;
    }

    const auditLog = await audit(supabase, "item.corrected", "monitoring_item", item.id, {
      changed,
      previous,
    });
    return { item, auditLog, changed };
  },

  async mergeItem(id: string, targetId?: string) {
    if (!shouldUseSupabase()) return store.mergeItem(id, targetId);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const warning = targetId ? `تم دمج المادة مع ${targetId}` : "تم تعليم المادة كمكررة.";
    const { data, error } = await supabase
      .from("monitoring_items")
      .update({ state: "deduped", warning })
      .eq("id", id)
      .select("*, sources(name)")
      .single();
    if (error) throw error;
    const item = (await toItems(supabase, [data as DbItemRow]))[0];
    const auditLog = await audit(supabase, "item.merged", "monitoring_item", item.id, { targetId });
    return { item, auditLog };
  },

  async archiveItem(id: string, reason?: string) {
    if (!shouldUseSupabase()) return store.archiveItem(id, reason);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    await getItemOrThrow(supabase, id);

    const { count, error: reportDeleteError } = await supabase
      .from("report_items")
      .delete({ count: "exact" })
      .eq("monitoring_item_id", id);
    if (reportDeleteError) throw reportDeleteError;

    const archiveReason = reason ?? "تمت أرشفة المادة من صفحة التشغيل.";
    const { data, error } = await supabase
      .from("monitoring_items")
      .update({ state: "archived", warning: archiveReason })
      .eq("id", id)
      .select("*, sources(name)")
      .single();
    if (error) throw error;

    const item = (await toItems(supabase, [data as DbItemRow]))[0];
    const auditLog = await audit(supabase, "item.archived", "monitoring_item", item.id, {
      reason: reason ?? null,
      removedReportItems: count ?? 0,
    });
    return { item, auditLog, removedReportItems: count ?? 0 };
  },

  async archiveWorkflowItems(input?: { ids?: string[]; limit?: number; reason?: string }) {
    if (!shouldUseSupabase()) return store.archiveWorkflowItems(input);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);

    const explicitIds = Array.from(new Set((input?.ids ?? []).filter(Boolean)));
    const limit = Math.max(1, Math.min(48, Math.trunc(input?.limit ?? 48)));

    let query = supabase
      .from("monitoring_items")
      .select("id")
      .eq("organization_id", DEFAULT_ORGANIZATION_ID)
      .in("source_type", ["manual_url", "rss", "x_recent_search"])
      .neq("state", "archived")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (explicitIds.length) {
      query = supabase
        .from("monitoring_items")
        .select("id")
        .eq("organization_id", DEFAULT_ORGANIZATION_ID)
        .in("id", explicitIds)
        .in("source_type", ["manual_url", "rss", "x_recent_search"])
        .neq("state", "archived")
        .limit(48);
    }

    const { data, error } = await query;
    if (error) throw error;

    const itemIds = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (!itemIds.length) {
      const auditLog = await audit(supabase, "items.workflow_archived", "monitoring_item", undefined, {
        requested: explicitIds.length || limit,
        archived: 0,
        removedReportItems: 0,
      });
      return {
        archived: 0,
        requested: explicitIds.length || limit,
        removedReportItems: 0,
        itemIds,
        auditLog,
      };
    }

    const { count, error: reportDeleteError } = await supabase
      .from("report_items")
      .delete({ count: "exact" })
      .in("monitoring_item_id", itemIds);
    if (reportDeleteError) throw reportDeleteError;

    const reason = input?.reason ?? "تنظيف مواد التشغيل الظاهرة من صفحة إضافة ومراجعة المحتوى.";
    const { error: archiveError } = await supabase
      .from("monitoring_items")
      .update({ state: "archived", warning: reason })
      .in("id", itemIds);
    if (archiveError) throw archiveError;

    const auditLog = await audit(supabase, "items.workflow_archived", "monitoring_item", undefined, {
      requested: explicitIds.length || limit,
      archived: itemIds.length,
      removedReportItems: count ?? 0,
    });

    return {
      archived: itemIds.length,
      requested: explicitIds.length || limit,
      removedReportItems: count ?? 0,
      itemIds,
      auditLog,
    };
  },

  async requestCapture(id: string, kind: Exclude<CaptureKind, "evidence_lite">, shouldFail = false) {
    if (!shouldUseSupabase()) return store.requestCapture(id, kind, shouldFail);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    await getItemOrThrow(supabase, id);
    const usage = await getUsageSnapshot(supabase);
    const budget = checkBudget(usageLimit, usage, { type: "screenshot", units: 1 });
    if (!budget.allowed) return { allowed: false as const, budget };

    await supabase.from("monitoring_items").update({ state: "capture_pending" }).eq("id", id);
    let screenshotUrl = evidenceCardUrl(id);
    const item = await getItemOrThrow(supabase, id);
    
    let captureKind = kind;
    const platform = platformFromUrl(item.originalUrl);
    if (platform === "TikTok" || platform === "Instagram") {
      const raw = item.raw_response && typeof item.raw_response === "object"
        ? (item.raw_response as { input?: { extraction?: { imageUrl?: string } }; extraction?: { imageUrl?: string } })
        : {};
      const metadataImageUrl = raw.input?.extraction?.imageUrl || raw.extraction?.imageUrl;
      if (metadataImageUrl && isSafePublicHttpUrl(metadataImageUrl)) {
        screenshotUrl = metadataImageUrl;
        captureKind = "preview";
      }
    } else if (!shouldFail && item.originalUrl && isSafePublicHttpUrl(item.originalUrl)) {
      screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(item.originalUrl)}&screenshot=true&embed=screenshot.url`;
    }

    const captureId = crypto.randomUUID();
    const storedEvidence = shouldFail
      ? null
      : await persistEvidenceAsset({
          supabase,
          item,
          captureId,
          kind: captureKind,
          sourceUrl: screenshotUrl,
          organizationId: item.organizationId,
          topicId: item.topicId,
        });

    const captureInput: DbRow = shouldFail
      ? {
          id: captureId,
          organization_id: item.organizationId ?? DEFAULT_ORGANIZATION_ID,
          monitoring_item_id: id,
          kind: captureKind,
          status: "failed",
          failure_reason: "تعذر التقاط الصفحة في البيئة التجريبية.",
          captured_at: null,
          asset_url: null,
        }
      : {
          id: captureId,
          organization_id: item.organizationId ?? DEFAULT_ORGANIZATION_ID,
          monitoring_item_id: id,
          kind: captureKind,
          status: "success",
          captured_at: now(),
          asset_url: storedEvidence?.assetUrl ?? screenshotUrl,
          html_archive_url:
            storedEvidence?.persisted && storedEvidence.bucket && storedEvidence.storagePath
              ? evidenceStorageReference(storedEvidence.bucket, storedEvidence.storagePath)
              : null,
          failure_reason: null,
        };
    const { data: captureRow, error: captureError } = await supabase.from("captures").insert(captureInput).select("*").single();
    if (captureError) throw captureError;

    const capture = toCapture(captureRow as DbCaptureRow);
    const nextPatch =
      capture.status === "success" && (captureKind === "report_grade" || captureKind === "preview")
        ? { state: "report_ready", warning: null, evidence_image_path: capture.assetUrl ?? screenshotUrl }
        : capture.status === "failed"
          ? { state: "capture_failed", warning: "فشل الالتقاط. يمكن إعادة المحاولة أو رفع لقطة يدويًا." }
          : {};
    const { data: row, error } = await supabase
      .from("monitoring_items")
      .update(nextPatch)
      .eq("id", id)
      .select("*, sources(name)")
      .single();
    if (error) throw error;

    await supabase.from("usage_events").insert([
      {
        organization_id: item.organizationId ?? DEFAULT_ORGANIZATION_ID,
        topic_id: item.topicId ?? DEFAULT_TOPIC_ID,
        event_type: "screenshot",
        units: 1,
        metadata: { itemId: id, captureId: capture.id, kind: captureKind },
      },
      {
        organization_id: item.organizationId ?? DEFAULT_ORGANIZATION_ID,
        topic_id: item.topicId ?? DEFAULT_TOPIC_ID,
        event_type: "storage_mb",
        units: storedEvidence?.sizeBytes ? Math.max(1, Math.ceil(storedEvidence.sizeBytes / (1024 * 1024))) : 2,
        metadata: {
          itemId: id,
          captureId: capture.id,
          kind: captureKind,
          persisted: storedEvidence?.persisted ?? false,
          bucket: storedEvidence?.bucket,
          path: storedEvidence?.storagePath,
          failureReason: storedEvidence?.failureReason,
        },
      },
    ]);
    const auditLog = await audit(supabase, "capture.requested", "capture", capture.id, {
      itemId: id,
      kind,
      status: capture.status,
    });
    return {
      allowed: true as const,
      item: (await toItems(supabase, [row as DbItemRow]))[0],
      capture,
      auditLog,
      usage: await getUsageSnapshot(supabase),
    };
  },

  async addReportItem(reportId: string, itemId: string, warningAccepted = false) {
    if (!shouldUseSupabase()) return store.addReportItem(reportId, itemId, warningAccepted);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);

    const { data: report, error: reportError } = await supabase.from("reports").select("id").eq("id", reportId).maybeSingle();
    if (reportError) throw reportError;
    if (!report) return { ok: false as const, error: "report_not_found" };

    const item = await getItemOrThrow(supabase, itemId);
    if (item.state !== "report_ready" && !(warningAccepted && item.state === "capture_failed")) {
      return {
        ok: false as const,
        error: "item_not_report_ready",
        warning: "لا تدخل المادة التقرير إلا بعد capture أو موافقة صريحة بتحذير.",
      };
    }

    const { data: existing, error: existingError } = await supabase
      .from("report_items")
      .select("id, report_id, monitoring_item_id, warning, created_at")
      .eq("report_id", reportId)
      .eq("monitoring_item_id", itemId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return { ok: true as const, reportItem: toReportItem(existing as DbReportItemRow), duplicate: true };

    let screenshotUrl: string | undefined = undefined;
    if (item.hasReportGradeCapture) {
      const { data: captures, error: captureQueryError } = await supabase
        .from("captures")
        .select("asset_url")
        .eq("monitoring_item_id", itemId)
        .eq("kind", "report_grade")
        .eq("status", "success")
        .limit(1);
      if (captureQueryError) throw captureQueryError;
      screenshotUrl = ((captures ?? []) as Array<{ asset_url: string | null }>)[0]?.asset_url ?? evidenceCardUrl(item.id);
    }

    const { data, error } = await supabase
      .from("report_items")
      .insert({
        organization_id: DEFAULT_ORGANIZATION_ID,
        report_id: reportId,
        monitoring_item_id: itemId,
        card_data: {
          title: item.title,
          summary: item.summary,
          sentiment: item.sentiment,
          original_url: item.originalUrl,
          source_name: item.sourceName,
          screenshot_url: screenshotUrl,
          content_image_url: screenshotUrl,
          warning: warningAccepted ? item.warning : undefined,
        },
        warning: warningAccepted ? item.warning ?? "تمت الموافقة مع التحذير." : null,
      })
      .select("id, report_id, monitoring_item_id, warning, created_at")
      .single();
    if (error) throw error;
    await supabase.from("monitoring_items").update({ state: "added_to_report" }).eq("id", itemId);
    await audit(supabase, "report.item_added", "report_item", (data as DbReportItemRow).id, {
      reportId,
      itemId,
      warningAccepted,
    });
    return { ok: true as const, reportItem: toReportItem(data as DbReportItemRow), duplicate: false };
  },

  async createReport(input: { title?: unknown }) {
    if (!shouldUseSupabase()) {
      return {
        id: crypto.randomUUID(),
        template: "HidayathonMediaMonitoringTemplate",
        title: input.title ?? "تقرير رصد هاكثون هداية",
        status: "draft",
      };
    }

    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const { data: latest, error: latestError } = await supabase
      .from("reports")
      .select("version")
      .eq("organization_id", DEFAULT_ORGANIZATION_ID)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;

    const version = ((latest as { version?: number } | null)?.version ?? 0) + 1;
    const { data, error } = await supabase
      .from("reports")
      .insert({
        organization_id: DEFAULT_ORGANIZATION_ID,
        topic_id: DEFAULT_TOPIC_ID,
        template_id: DEFAULT_TEMPLATE_ID,
        title: typeof input.title === "string" ? input.title : "تقرير رصد هاكثون هداية",
        version,
        status: "draft",
        period_start: "2026-02-14",
        period_end: "2026-02-18",
      })
      .select("*")
      .single();
    if (error) throw error;
    await audit(supabase, "report.created", "report", (data as DbReportRow).id, { version });
    return {
      ...toReport(data as DbReportRow),
      template: "HidayathonMediaMonitoringTemplate",
    };
  },

  async publishReport(reportId: string) {
    if (!shouldUseSupabase()) return store.publishReport(reportId);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const { data, error } = await supabase
      .from("reports")
      .update({ status: "published", published_at: now() })
      .eq("id", reportId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false as const, error: "report_not_found" };
    await audit(supabase, "report.published", "report", reportId);
    return { ok: true as const, report: toReport(data as DbReportRow) };
  },

  async runConnector(type: SourceType) {
    if (!shouldUseSupabase()) return store.runConnector(type);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const usage = await getUsageSnapshot(supabase);
    const budget = checkBudget(
      usageLimit,
      usage,
      type === "x_recent_search" ? { type: "x_read", units: 100 } : { type: "storage_mb", units: 1 },
    );
    if (!budget.allowed) return { ok: false as const, budget };
    if (type === "x_recent_search" || type === "x_filtered_stream") {
      return {
        ok: true as const,
        run: {
          id: crypto.randomUUID(),
          connector: type,
          status: "not_configured" as const,
          startedAt: now(),
          finishedAt: now(),
        },
        budget,
      };
    }
    await audit(supabase, "connector.run_queued", "connector_run", undefined, { connector: type });
    return {
      ok: true as const,
      run: {
        id: crypto.randomUUID(),
        connector: type,
        status: "queued" as const,
        cursor: { lastFetchedAt: now() },
        startedAt: now(),
      },
      budget,
    };
  },

  async listJobs(organizationId?: string) {
    if (!shouldUseSupabase()) return store.listJobs(organizationId);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    let query = supabase.from("jobs").select("*").order("created_at", { ascending: false });
    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as DbJobRow[]).map(toJob);
  },

  async listConnectorRuns(organizationId?: string) {
    if (!shouldUseSupabase()) return store.listConnectorRuns(organizationId);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    let query = supabase.from("connector_runs").select("*").order("started_at", { ascending: false });
    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as DbConnectorRunRow[]).map(toConnectorRun);
  },

  async findDueSourceRules(organizationId?: string, nowStr?: string) {
    if (!shouldUseSupabase()) return store.findDueSourceRules(organizationId, nowStr);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const referenceTime = nowStr ? new Date(nowStr) : new Date();

    let queryRules = supabase.from("source_rules").select("*, sources(*)").eq("active", true);
    if (organizationId) {
      queryRules = queryRules.eq("organization_id", organizationId);
    }
    const { data: dbRules, error: rulesError } = await queryRules;
    if (rulesError) throw rulesError;

    const dueRules: SourceRule[] = [];
    for (const row of (dbRules ?? [])) {
      const { data: runs, error: runsError } = await supabase
        .from("connector_runs")
        .select("*")
        .eq("source_rule_id", row.id)
        .not("finished_at", "is", null)
        .order("finished_at", { ascending: false })
        .limit(1);
      if (runsError) throw runsError;

      const latestRun = runs?.[0];
      const pollIntervalMinutes = row.poll_interval_minutes ?? row.sources?.poll_interval_minutes ?? 1440;

      if (!latestRun) {
        dueRules.push(toSourceRule(row as DbSourceRuleRow));
      } else {
        const elapsedMs = referenceTime.getTime() - new Date(latestRun.finished_at).getTime();
        if (elapsedMs >= pollIntervalMinutes * 60 * 1000) {
          dueRules.push(toSourceRule(row as DbSourceRuleRow));
        }
      }
    }
    return dueRules;
  },

  async enqueueConnectorJob(rule: SourceRule, nowStr?: string) {
    if (!shouldUseSupabase()) return store.enqueueConnectorJob(rule, nowStr);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);

    const time = nowStr ? new Date(nowStr) : new Date();
    const year = time.getUTCFullYear();
    const month = String(time.getUTCMonth() + 1).padStart(2, "0");
    const day = String(time.getUTCDate()).padStart(2, "0");
    const hour = String(time.getUTCHours()).padStart(2, "0");
    const idempotencyKey = `rule:${rule.id}:${year}-${month}-${day}-${hour}`;

    const { data: existingJob, error: checkError } = await supabase
      .from("jobs")
      .select("*")
      .eq("organization_id", rule.organizationId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (checkError) throw checkError;
    if (existingJob) {
      return toJob(existingJob as DbJobRow);
    }

    const jobId = crypto.randomUUID();
    const availableAt = nowStr || now();
    const createdAt = nowStr || now();

    try {
      const { data: jobData, error: jobInsertError } = await supabase
        .from("jobs")
        .insert({
          id: jobId,
          organization_id: rule.organizationId,
          job_type: "connector_poll",
          status: "queued",
          idempotency_key: idempotencyKey,
          attempts: 0,
          payload: { ruleId: rule.id },
          failure_reason: null,
          available_at: availableAt,
          created_at: createdAt,
        })
        .select("*")
        .single();

      if (jobInsertError) {
        if (jobInsertError.code === "23505") {
          const { data: retryJob, error: retryCheckError } = await supabase
            .from("jobs")
            .select("*")
            .eq("organization_id", rule.organizationId)
            .eq("idempotency_key", idempotencyKey)
            .single();
          if (retryCheckError) throw retryCheckError;
          return toJob(retryJob as DbJobRow);
        }
        throw jobInsertError;
      }

      const runId = crypto.randomUUID();
      const { error: runInsertError } = await supabase
        .from("connector_runs")
        .insert({
          id: runId,
          organization_id: rule.organizationId,
          source_rule_id: rule.id,
          status: "queued",
          cursor_before: rule.cursor,
          cursor_after: null,
          fetched_count: 0,
          failure_reason: null,
          started_at: nowStr || now(),
          finished_at: null,
        });
      if (runInsertError) throw runInsertError;

      return toJob(jobData as DbJobRow);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "23505") {
        const { data: retryJob, error: retryCheckError } = await supabase
          .from("jobs")
          .select("*")
          .eq("organization_id", rule.organizationId)
          .eq("idempotency_key", idempotencyKey)
          .single();
        if (retryCheckError) throw retryCheckError;
        return toJob(retryJob as DbJobRow);
      }
      throw err;
    }
  },

  async runConnectorJob(jobId: string, nowStr?: string) {
    if (!shouldUseSupabase()) return store.runConnectorJob(jobId, nowStr);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);

    const { data: job, error: jobGetError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (jobGetError) throw jobGetError;
    if (!job) throw new Error("job_not_found");
    if (job.status !== "queued" && job.status !== "failed") {
      return toJob(job as DbJobRow);
    }

    const { data: claimedJobs, error: claimError } = await supabase
      .from("jobs")
      .update({
        status: "running",
        attempts: job.attempts + 1,
      })
      .eq("id", jobId)
      .eq("status", job.status)
      .select("*");
    if (claimError) throw claimError;
    if (!claimedJobs || claimedJobs.length === 0) {
      return toJob(job as DbJobRow);
    }
    const claimedJobRow = claimedJobs[0] as DbJobRow;

    const ruleId = claimedJobRow.payload.ruleId as string;
    const { data: dbRule, error: ruleError } = await supabase
      .from("source_rules")
      .select("*")
      .eq("id", ruleId)
      .maybeSingle();
    if (ruleError) throw ruleError;
    if (!dbRule) {
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          failure_reason: "source_rule_not_found",
        })
        .eq("id", jobId);
      return { ...toJob(claimedJobRow), status: "failed" as const, failureReason: "source_rule_not_found" };
    }
    const rule = toSourceRule(dbRule as DbSourceRuleRow);

    const { data: runs, error: runsError } = await supabase
      .from("connector_runs")
      .select("*")
      .eq("source_rule_id", ruleId)
      .eq("status", "queued")
      .limit(1);
    if (runsError) throw runsError;

    let runRow = runs?.[0] as DbConnectorRunRow | undefined;
    if (!runRow) {
      const runId = crypto.randomUUID();
      const { data: newRun, error: newRunError } = await supabase
        .from("connector_runs")
        .insert({
          id: runId,
          organization_id: rule.organizationId,
          source_rule_id: ruleId,
          status: "running",
          cursor_before: rule.cursor,
          cursor_after: null,
          fetched_count: 0,
          failure_reason: null,
          started_at: nowStr || now(),
          finished_at: null,
        })
        .select("*")
        .single();
      if (newRunError) throw newRunError;
      runRow = newRun as DbConnectorRunRow;
    } else {
      const { data: updatedRun, error: updateRunError } = await supabase
        .from("connector_runs")
        .update({
          status: "running",
          started_at: nowStr || now(),
        })
        .eq("id", runRow.id)
        .select("*")
        .single();
      if (updateRunError) throw updateRunError;
      runRow = updatedRun as DbConnectorRunRow;
    }

    try {
      let fetched: IngestedItem[] = [];
      if (rule.type === "tiktok_research") {
        const connector = new TikTokResearchConnector();
        fetched = await connector.fetch(rule, rule.cursor);
      } else if (rule.type === "instagram_public_profile") {
        const connector = new InstagramPublicProfileConnector();
        fetched = await connector.fetch(rule, rule.cursor);
      } else {
        throw new Error(`unsupported_connector_type:${rule.type}`);
      }

      const activeRules = await this.listKeywordRules();
      const activeRule = activeRules[0] || keywordRules[0];

      let insertedCount = 0;

      for (const rawItem of fetched) {
        const relevance = explainKeywordMatch(`${rawItem.title} ${rawItem.text} ${rawItem.url}`, activeRule);
        if (relevance.score < 35) {
          continue;
        }

        const dedupeKey = makeDedupeKey(rawItem, rule.type);
        const canonicalHash = `${rule.type}:${await sha256(dedupeKey)}`;

        const { data: duplicateItem, error: duplicateCheckError } = await supabase
          .from("monitoring_items")
          .select("id")
          .eq("organization_id", rule.organizationId)
          .or(`canonical_url_hash.eq.${canonicalHash},original_url.eq.${rawItem.url}`)
          .limit(1)
          .maybeSingle();

        if (duplicateCheckError) throw duplicateCheckError;
        if (duplicateItem) {
          continue;
        }

        const newItemId = crypto.randomUUID();
        const { data: insertedItemData, error: insertItemError } = await supabase
          .from("monitoring_items")
          .insert({
            id: newItemId,
            organization_id: rule.organizationId,
            topic_id: rule.topicId,
            source_id: rule.sourceId || null,
            source_type: rule.type,
            state: "needs_review",
            title: rawItem.title,
            original_url: rawItem.url,
            canonical_url_hash: canonicalHash,
            source_item_id: rawItem.sourceItemId || canonicalHash,
            normalized_text_hash: await sha256(rawItem.text || rawItem.url),
            author_name: rawItem.authorName ?? "غير محدد",
            author_handle: rawItem.authorHandle ?? null,
            published_at: rawItem.publishedAt,
            summary: rawItem.text,
            summary_source_text: rawItem.text,
            sentiment: estimateSentiment(relevance.score),
            sentiment_confidence: Math.max(50, Math.min(95, relevance.score)),
            relevance_score: relevance.score,
            relevance_reason: relevance.reason,
            matched_terms: relevance.matchedTerms,
            raw_response: rawItem.raw ?? {},
            warning: null,
            discovery_method: "auto_search",
          })
          .select("*, sources(name)")
          .single();

        if (insertItemError) {
          if (insertItemError.code === "23505") continue;
          throw insertItemError;
        }

        const initialItem = (await toItems(supabase, [insertedItemData as DbItemRow]))[0];
        const captureId = crypto.randomUUID();
        let screenshotUrl = evidenceCardUrl(newItemId);
        if (rawItem.url && isSafePublicHttpUrl(rawItem.url)) {
          screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(rawItem.url)}&screenshot=true&embed=screenshot.url`;
        }

        const storedEvidence = await persistEvidenceAsset({
          supabase,
          item: initialItem,
          captureId,
          kind: "evidence_lite",
          sourceUrl: screenshotUrl,
          organizationId: rule.organizationId,
          topicId: rule.topicId,
        });

        await supabase
          .from("monitoring_items")
          .update({
            evidence_image_path: storedEvidence.assetUrl,
            raw_response: {
              ...(rawItem.raw ?? {}),
              contentImagePath: storedEvidence.assetUrl,
              sourceEvidenceImagePath: storedEvidence.assetUrl,
              evidenceStorage: {
                persisted: storedEvidence.persisted,
                bucket: storedEvidence.bucket,
                path: storedEvidence.storagePath,
                contentType: storedEvidence.contentType,
                sizeBytes: storedEvidence.sizeBytes,
                failureReason: storedEvidence.failureReason,
              },
            },
          })
          .eq("id", newItemId);

        await supabase
          .from("captures")
          .insert({
            id: captureId,
            organization_id: rule.organizationId,
            monitoring_item_id: newItemId,
            kind: "evidence_lite",
            status: "success",
            captured_at: now(),
            asset_url: storedEvidence.assetUrl,
            html_archive_url:
              storedEvidence.persisted && storedEvidence.bucket && storedEvidence.storagePath
                ? evidenceStorageReference(storedEvidence.bucket, storedEvidence.storagePath)
                : null,
          });

        insertedCount += 1;
        await audit(supabase, "item.ingested", "monitoring_item", newItemId, {
          sourceType: rule.type,
          sourceId: rule.sourceId,
          canonicalUrl: rawItem.url,
        });
      }

      let nextCursor = rule.cursor;
      if (fetched.length > 0) {
        const sorted = [...fetched].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
        const latest = sorted[0];
        if (rule.type === "tiktok_research") {
          nextCursor = { search_id: latest.sourceItemId };
        } else if (rule.type === "instagram_public_profile") {
          nextCursor = { lastPublishedAt: latest.publishedAt };
        }
      }

      const { error: ruleUpdateError } = await supabase
        .from("source_rules")
        .update({ cursor: nextCursor })
        .eq("id", rule.id);
      if (ruleUpdateError) throw ruleUpdateError;

      const { error: jobUpdateError } = await supabase
        .from("jobs")
        .update({ status: "succeeded" })
        .eq("id", jobId);
      if (jobUpdateError) throw jobUpdateError;

      const { error: runUpdateError } = await supabase
        .from("connector_runs")
        .update({
          status: "success",
          cursor_after: nextCursor,
          fetched_count: insertedCount,
          finished_at: nowStr || now(),
        })
        .eq("id", runRow.id);
      if (runUpdateError) throw runUpdateError;
      return { ...toJob(claimedJobRow), status: "succeeded" as const, failureReason: null };

    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          failure_reason: errorMsg,
        })
        .eq("id", jobId);

      await supabase
        .from("connector_runs")
        .update({
          status: "failed",
          failure_reason: errorMsg,
          finished_at: nowStr || now(),
        })
        .eq("id", runRow.id);
      return { ...toJob(claimedJobRow), status: "failed" as const, failureReason: errorMsg };
    }
  },
};
