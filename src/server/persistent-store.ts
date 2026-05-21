import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalizeUrl, explainKeywordMatch, makeDedupeKey } from "@/lib/connectors";
import { checkBudget, type UsageSnapshot } from "@/lib/guardrails";
import { keywordRules, usageLimit } from "@/lib/mock-data";
import type {
  Capture,
  CaptureKind,
  HealthMetric,
  ItemState,
  MonitoringItem,
  ReportVersion,
  Source,
  SourceCredibility,
  SourceType,
} from "@/lib/types";
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
import { isSafePublicHttpUrl } from "@/server/url-metadata";

type ReviewAction = "approve" | "reject";
type DbRow = Record<string, unknown>;

type DbSourceRow = {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  handle: string | null;
  country: string | null;
  credibility: SourceCredibility;
  is_verified_source: boolean;
  logo_url: string | null;
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
    handle: row.handle ?? undefined,
    country: row.country ?? "السعودية",
    credibility: row.credibility,
    isVerifiedSource: row.is_verified_source,
    logoUrl: row.logo_url ?? undefined,
  };
}

function platformFromUrl(value: string) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com")) {
      return "X";
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

  return rows.map((row) => ({
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
  }));
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
  if (row.canonical_url_hash !== canonicalHash) {
    patch.canonical_url_hash = canonicalHash;
    patch.source_item_id = canonicalHash;
  }

  const title = String(patch.title ?? row.title ?? "");
  const summary = String(patch.summary ?? row.summary ?? "");
  const rule = keywordRules[0];
  const match = explainKeywordMatch(`${title} ${summary} ${canonicalUrl}`, rule);
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
    manual: true,
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
          source_name: input.authorName ?? row.author_name ?? sourceLabel(row.source_type),
          screenshot_url: screenshotUrl,
          content_image_url: screenshotUrl,
        },
      })
      .eq("id", reportItem.id);
    if (reportItemError) throw reportItemError;
  }

  await audit(supabase, "item.metadata_refreshed", "monitoring_item", row.id, {
    sourceType: "manual_url",
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

export const persistentStore = {
  async health() {
    if (!shouldUseSupabase()) return store.health();

    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const [items, usage] = await Promise.all([this.listItems(), getUsageSnapshot(supabase)]);
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
        x_recent_search: "not_configured",
      },
      usage,
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

  async createSource(input: { name?: string; type?: SourceType; url?: string; credibility?: SourceCredibility }) {
    if (!shouldUseSupabase()) return store.createSource(input);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);
    const type = input.type ?? "manual_url";
    const { data, error } = await supabase
      .from("sources")
      .insert({
        organization_id: DEFAULT_ORGANIZATION_ID,
        name: input.name ?? sourceLabel(type),
        type,
        url: input.url ?? "manual://intake",
        country: "السعودية",
        credibility: input.credibility ?? "public",
        is_verified_source: false,
      })
      .select("*")
      .single();
    if (error) throw error;
    await audit(supabase, "source.created", "source", (data as DbSourceRow).id, { type });
    return toSource(data as DbSourceRow);
  },

  async ingestManualUrl(input: ManualUrlInput) {
    if (!shouldUseSupabase()) return store.ingestManualUrl(input);
    const supabase = getSupabaseAdmin();
    await ensureDefaultWorkspace(supabase);

    const canonicalUrl = canonicalizeUrl(input.url);
    const publishedAt = input.publishedAt ?? now();
    const platform = platformFromUrl(canonicalUrl);
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
      "manual_url",
    );
    const canonicalHash = `manual:${await sha256(dedupeKey)}`;
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
        .eq("source_type", "manual_url")
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
        source_id: DEFAULT_MANUAL_SOURCE_ID,
        source_type: "manual_url",
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
        raw_response: {
          manual: true,
          platform,
          sourcePdf: "live-hidayathon",
          publishedDateText: publishedAt,
          extractedUrls: [canonicalUrl],
          input,
        },
      })
      .select("*, sources(name)")
      .single();
    if (error) throw error;

    const insertedRow = row as DbItemRow;
    let screenshotUrl = evidenceCardUrl(insertedRow.id);
    if (insertedRow.original_url && isSafePublicHttpUrl(insertedRow.original_url)) {
      screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(insertedRow.original_url)}&screenshot=true&embed=screenshot.url`;
    }
    const { data: hydratedRow, error: hydrationError } = await supabase
      .from("monitoring_items")
      .update({
        evidence_image_path: screenshotUrl,
        raw_response: {
          ...rawObject(insertedRow.raw_response),
          contentImagePath: screenshotUrl,
          sourceEvidenceImagePath: screenshotUrl,
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
        organization_id: DEFAULT_ORGANIZATION_ID,
        monitoring_item_id: item.id,
        kind: "evidence_lite",
        status: "success",
        captured_at: now(),
        asset_url: screenshotUrl,
      })
      .select("*")
      .single();
    if (captureError) throw captureError;
    const evidence = toCapture(captureRow as DbCaptureRow);
    await audit(supabase, "item.ingested", "monitoring_item", item.id, {
      sourceType: "manual_url",
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
    if (!shouldFail && item.originalUrl && isSafePublicHttpUrl(item.originalUrl)) {
      screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(item.originalUrl)}&screenshot=true&embed=screenshot.url`;
    }

    const captureInput: DbRow = shouldFail
      ? {
          organization_id: DEFAULT_ORGANIZATION_ID,
          monitoring_item_id: id,
          kind,
          status: "failed",
          failure_reason: "تعذر التقاط الصفحة في البيئة التجريبية.",
          captured_at: null,
          asset_url: null,
        }
      : {
          organization_id: DEFAULT_ORGANIZATION_ID,
          monitoring_item_id: id,
          kind,
          status: "success",
          captured_at: now(),
          asset_url: screenshotUrl,
          failure_reason: null,
        };
    const { data: captureRow, error: captureError } = await supabase.from("captures").insert(captureInput).select("*").single();
    if (captureError) throw captureError;

    const capture = toCapture(captureRow as DbCaptureRow);
    const nextPatch =
      capture.status === "success" && kind === "report_grade"
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
        organization_id: DEFAULT_ORGANIZATION_ID,
        topic_id: DEFAULT_TOPIC_ID,
        event_type: "screenshot",
        units: 1,
        metadata: { itemId: id, captureId: capture.id, kind },
      },
      {
        organization_id: DEFAULT_ORGANIZATION_ID,
        topic_id: DEFAULT_TOPIC_ID,
        event_type: "storage_mb",
        units: 2,
        metadata: { itemId: id, captureId: capture.id, kind },
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
};
