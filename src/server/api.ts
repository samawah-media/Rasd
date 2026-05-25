import { Hono } from "hono";
import type { KeywordRule, SourceCredibility, SourceType } from "@/lib/types";
import { getPreferredHidayathonClientReportData } from "@/lib/client-report-data";
import { getLegacyBackfillDataset } from "@/lib/legacy-backfill";
import { getLegacySourceIntelligence, type LegacySourceRecommendation } from "@/lib/legacy-source-intelligence";
import type { LegacyLinkOverrideStatus } from "@/lib/legacy-link-overrides";
import {
  buildPersistentLegacySupabaseUpsertPlan,
  upsertLegacyReportsToSupabase,
} from "@/server/legacy-supabase-import";
import {
  getMergedLegacyLinkOverrides,
  upsertLegacyLinkOverride,
} from "@/server/legacy-link-overrides-store";
import { store } from "@/server/store";
import { checkSupabasePersistence } from "@/server/supabase-admin";
import {
  createReportShareLink,
  listReportShareLinks,
  resolveReportShareLink,
  revokeReportShareLink,
  revokeReportShareLinkById,
} from "@/server/share-links";
import { persistentStore } from "@/server/persistent-store";
import { fetchUrlMetadata, isSafePublicHttpUrl, type UrlMetadata } from "@/server/url-metadata";
import { searchNewsSiteSitemap, searchNewsSiteWithApifyGoogle } from "@/server/apify-extractor";
import { renderEvidenceCardSvg } from "@/server/evidence-card";
import { buildClientReportExportHtml } from "@/server/client-report-export";
import {
  createOrUpdateClientViewerAccount,
  listClientViewerAccounts,
  validateViewerAccountInput,
} from "@/server/client-access";
import { SourceValidationError } from "@/server/source-validation";
import { RssIngestionError } from "@/server/rss-ingestion";
import { DEFAULT_ORGANIZATION_ID, DEFAULT_TOPIC_ID } from "@/lib/auth-config";

type AppBindings = {
  Variables: {
    requestId: string;
  };
};

type JsonBody = Record<string, unknown>;

export const api = new Hono<AppBindings>().basePath("/api");

api.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
});

function withRequestId<T extends Record<string, unknown>>(c: { get(key: "requestId"): string }, payload: T) {
  return {
    requestId: c.get("requestId"),
    ...payload,
  };
}

async function readJson(c: { req: { json(): Promise<unknown> } }): Promise<JsonBody> {
  const body = await c.req.json().catch(() => ({}));
  return body && typeof body === "object" ? (body as JsonBody) : {};
}

function optionalString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSupportedSourceRuleType(value: unknown): value is Extract<SourceType, "tiktok_research" | "instagram_public_profile"> {
  return value === "tiktok_research" || value === "instagram_public_profile";
}

function isInstagramProfileUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./u, "").toLowerCase();
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (host !== "instagram.com" && host !== "instagr.am") return false;
    const firstSegment = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    return Boolean(firstSegment && !["p", "reel", "reels", "tv", "stories", "explore"].includes(firstSegment));
  } catch {
    return false;
  }
}

function optionalPollIntervalMinutes(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.trunc(parsed);
    }
  }
  return undefined;
}

function validateSourceRulePayload(body: JsonBody, existing?: Awaited<ReturnType<typeof persistentStore.listSourceRules>>[number]) {
  const requestedType = body.type ?? existing?.type;
  if (!isSupportedSourceRuleType(requestedType)) {
    return { ok: false as const, error: "source_rule_type_unsupported" };
  }

  const organizationId = optionalString(body.organization_id, body.organizationId, existing?.organizationId) ?? DEFAULT_ORGANIZATION_ID;
  const topicId = optionalString(body.topic_id, body.topicId, existing?.topicId) ?? DEFAULT_TOPIC_ID;
  const query = optionalString(body.query, existing?.query);
  const url = optionalString(body.url, existing?.url);
  const sourceId = optionalString(body.source_id, body.sourceId, existing?.sourceId ?? undefined) ?? null;
  const active = typeof body.active === "boolean" ? body.active : existing?.active ?? true;
  const pollIntervalMinutes =
    optionalPollIntervalMinutes(body.poll_interval_minutes, body.pollIntervalMinutes, existing?.pollIntervalMinutes) ?? 1440;

  if (!Number.isInteger(pollIntervalMinutes) || pollIntervalMinutes < 15 || pollIntervalMinutes > 10080) {
    return { ok: false as const, error: "poll_interval_minutes must be between 15 and 10080" };
  }

  if (requestedType === "tiktok_research") {
    if (!query && !url) return { ok: false as const, error: "tiktok_query_or_url_required" };
    if (url && (!isHttpUrl(url) || !isSafePublicHttpUrl(url))) {
      return { ok: false as const, error: "source_rule_url_not_public" };
    }
  }

  if (requestedType === "instagram_public_profile") {
    if (!url) return { ok: false as const, error: "instagram_profile_url_required" };
    if (!isInstagramProfileUrl(url) || !isSafePublicHttpUrl(url)) {
      return { ok: false as const, error: "instagram_profile_url_invalid" };
    }
  }

  return {
    ok: true as const,
    value: {
      id: optionalString(body.id, existing?.id),
      organizationId,
      topicId,
      sourceId,
      type: requestedType,
      query: query ?? null,
      url: url ?? null,
      cursor: existing?.cursor ?? null,
      active,
      pollIntervalMinutes,
    },
  };
}

function sourceRuleErrorStatus(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.toLowerCase();
  if (
    message.includes("source_rules") &&
    (message.includes("does not exist") ||
      message.includes("could not find") ||
      message.includes("schema cache") ||
      message.includes("42p01") ||
      message.includes("42703") ||
      message.includes("22p02"))
  ) {
    return {
      status: 500 as const,
      error: "source_rules_schema_not_ready",
      detail: "Apply the latest Supabase source_rules migrations, then redeploy or retry.",
    };
  }
  if (rawMessage === "source_rule_not_found") {
    return { status: 404 as const, error: "source_rule_not_found", detail: undefined };
  }
  if (rawMessage === "source_rule_inactive") {
    return { status: 400 as const, error: "source_rule_inactive", detail: "Activate the source rule before running it manually." };
  }
  return {
    status: 500 as const,
    error: "source_rule_request_failed",
    detail: rawMessage,
  };
}

function optionalIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return { ok: true as const, value: undefined };
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return { ok: false as const };
  return { ok: true as const, value: new Date(timestamp).toISOString() };
}

function compactExtractionMetadata(metadata: UrlMetadata | null) {
  if (!metadata) return undefined;
  return {
    source: metadata.source,
    platform: metadata.platform,
    canonicalUrl: metadata.canonicalUrl,
    imageUrl: metadata.imageUrl,
    publishedAt: metadata.publishedAt,
    publisherName: metadata.publisherName,
    siteName: metadata.siteName,
    readabilityUsed: metadata.readabilityUsed,
    warnings: metadata.warnings,
  };
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean)));
  }
  if (typeof value === "string") {
    return Array.from(new Set(value.split(/\r?\n|,/u).map((entry) => entry.trim()).filter(Boolean)));
  }
  return undefined;
}

function mergeTerms(...groups: (string[] | undefined)[]) {
  return Array.from(new Set(groups.flatMap((group) => group ?? []).map((term) => term.trim()).filter(Boolean)));
}

function requestedApplyLimit(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(20, Math.trunc(value)));
}

function sourceRuleDuplicateKey(input: { type: SourceType; query?: string | null; url?: string | null }) {
  return `${input.type}:${(input.query ?? "").trim().toLowerCase()}:${(input.url ?? "").trim().toLowerCase()}`;
}

function sourceDuplicateKey(input: { type: SourceType; url?: string | null; feedUrl?: string | null }) {
  return `${input.type}:${(input.feedUrl ?? input.url ?? "").trim().toLowerCase()}`;
}

function recommendationSampleUrl(recommendation: LegacySourceRecommendation) {
  return recommendation.sampleUrls[0] ?? recommendation.url ?? recommendation.query ?? "";
}

function positiveInteger(value: unknown, fallback: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(value)));
}

function isAuthorizedAdminImport(c: { req: { header(name: string): string | undefined } }, body: JsonBody) {
  const expectedToken = process.env.RASD_ADMIN_IMPORT_TOKEN;
  void body;
  const providedToken = c.req.header("x-rasd-admin-token");

  return Boolean(expectedToken && providedToken && providedToken === expectedToken);
}

function sourcePollPayload(result: Awaited<ReturnType<typeof persistentStore.ingestRssSource>>) {
  return {
    source: result.source,
    fetched: result.fetched,
    created: result.created,
    duplicates: result.duplicates,
    skipped: result.skipped,
    failed: result.failed,
    items: result.items,
  };
}

function sourcePollErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "source_poll_failed";
  if (message === "source_not_found") return { status: 404 as const, error: "source_not_found" };
  if (message === "source_not_rss") return { status: 400 as const, error: "source_not_rss" };
  if (error instanceof RssIngestionError) return { status: 502 as const, error: message };
  return { status: 500 as const, error: "source_poll_failed" };
}

function isCronAuthorized(c: { req: { header(name: string): string | undefined } }) {
  const expected = process.env.CRON_SECRET;
  const provided = c.req.header("authorization");
  return Boolean(expected && provided === `Bearer ${expected}`);
}

function isSourceDue(source: { isActive: boolean; feedUrl?: string; lastCheckedAt?: string; pollIntervalMinutes: number }, nowMs = Date.now()) {
  if (!source.isActive || !source.feedUrl) return false;
  if (!source.lastCheckedAt) return true;
  const lastCheckedMs = Date.parse(source.lastCheckedAt);
  if (Number.isNaN(lastCheckedMs)) return true;
  return nowMs - lastCheckedMs >= source.pollIntervalMinutes * 60 * 1000;
}

function temporaryKeywordRuleFromTerm(term: unknown, currentRule?: KeywordRule | null): KeywordRule | undefined {
  if (typeof term !== "string") return undefined;
  const cleanTerm = term.trim();
  if (cleanTerm.length < 2 || cleanTerm.length > 80) return undefined;
  return {
    ...(currentRule ?? {
      id: "temporary-rss-test",
      requiredTerms: [],
      optionalTerms: [],
      excludeTerms: [],
      language: "mixed" as const,
      priority: 100,
      activeFrom: new Date().toISOString().slice(0, 10),
      version: 1,
    }),
    id: currentRule?.id ?? "temporary-rss-test",
    requiredTerms: [cleanTerm],
    optionalTerms: [],
  };
}

async function rssPollOptionsFromBody(body: Record<string, unknown>) {
  const currentRule = (await persistentStore.listKeywordRules())[0] ?? null;
  const keywordRule = temporaryKeywordRuleFromTerm(body.test_term ?? body.testTerm, currentRule);
  return {
    keywordRule,
    testTerm: keywordRule?.requiredTerms[0],
  };
}

async function pollRssSources(sources: Awaited<ReturnType<typeof persistentStore.listSources>>, options: { keywordRule?: KeywordRule; testTerm?: string } = {}) {
  const runs: Array<Record<string, unknown>> = [];
  let fetched = 0;
  let created = 0;
  let duplicates = 0;
  let skipped = 0;
  let failed = 0;

  for (const source of sources) {
    try {
      const result = sourcePollPayload(await persistentStore.ingestRssSource(source.id, { keywordRule: options.keywordRule }));
      fetched += result.fetched;
      created += result.created;
      duplicates += result.duplicates;
      skipped += typeof result.skipped === "number" ? result.skipped : 0;
      failed += result.failed;
      runs.push({ ok: true, sourceId: source.id, sourceName: source.name, ...result });
    } catch (error) {
      const mapped = sourcePollErrorStatus(error);
      failed += 1;
      runs.push({ ok: false, sourceId: source.id, sourceName: source.name, error: mapped.error });
    }
  }

  return {
    sources: sources.length,
    fetched,
    created,
    duplicates,
    skipped,
    failed,
    runs,
    testTerm: options.testTerm,
  };
}

async function ingestNewsSearchResults(results: Array<{ title: string; url: string; description?: string }>, keywordRule?: KeywordRule) {
  const items = [];
  let created = 0;
  let duplicates = 0;
  let failed = 0;

  for (const result of results) {
    try {
      const ingested = await persistentStore.ingestManualUrl({
        url: result.url,
        title: result.title,
        text: result.description ?? result.title,
        sourceName: "بحث أخبار Apify",
        keywordRule,
        discoveryMethod: "auto_search",
      });
      items.push(ingested.item);
      if (ingested.duplicate) duplicates += 1;
      else created += 1;
    } catch {
      failed += 1;
    }
  }

  return { created, duplicates, failed, items };
}

async function runDueConnectors(organizationId?: string, options: { force?: boolean; sourceRuleId?: string } = {}) {
  const beforeItems = await persistentStore.listItems();
  const beforeItemIds = new Set(beforeItems.map((item) => item.id));
  const dueRules =
    options.force || options.sourceRuleId
      ? (await persistentStore.listSourceRules(organizationId ?? DEFAULT_ORGANIZATION_ID)).filter((rule) => {
          if (options.sourceRuleId && rule.id !== options.sourceRuleId) return false;
          if (!rule.active) return false;
          return true;
        })
      : await persistentStore.findDueSourceRules(organizationId);
  if (options.sourceRuleId && dueRules.length === 0) {
    const existing = (await persistentStore.listSourceRules(organizationId ?? DEFAULT_ORGANIZATION_ID)).find((rule) => rule.id === options.sourceRuleId);
    throw new Error(existing ? "source_rule_inactive" : "source_rule_not_found");
  }
  const jobs = [];
  for (const rule of dueRules) {
    const job = await persistentStore.enqueueConnectorJob(rule, undefined, { force: Boolean(options.force || options.sourceRuleId) });
    jobs.push(job);
  }

  const executed = [];
  const failed = [];
  for (const job of jobs) {
    try {
      const finalJob = await persistentStore.runConnectorJob(job.id);
      if (finalJob?.status === "failed" || finalJob?.status === "dead_letter") {
        failed.push({
          jobId: job.id,
          error: finalJob.failureReason ?? "connector_job_failed",
        });
      } else {
        executed.push(job.id);
      }
    } catch (error) {
      failed.push({
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const createdItems = (await persistentStore.listItems()).filter(
    (item) =>
      !beforeItemIds.has(item.id) &&
      (item.sourceType === "tiktok_research" || item.sourceType === "instagram_public_profile"),
  );

  return {
    ok: true,
    dueRulesCount: dueRules.length,
    enqueuedCount: jobs.length,
    executedCount: executed.length,
    failedCount: failed.length,
    createdCount: createdItems.length,
    createdBySourceType: {
      tiktok_research: createdItems.filter((item) => item.sourceType === "tiktok_research").length,
      instagram_public_profile: createdItems.filter((item) => item.sourceType === "instagram_public_profile").length,
    },
    newItemIds: createdItems.map((item) => item.id),
    executedJobs: executed,
    failedJobs: failed,
  };
}

api.get("/admin/health", async (c) => c.json(withRequestId(c, await persistentStore.health())));

api.get("/admin/persistence", async (c) =>
  c.json(withRequestId(c, { persistence: await checkSupabasePersistence() })),
);

api.get("/audit-logs", async (c) => c.json(withRequestId(c, { audit_logs: await persistentStore.listAuditLogs() })));

api.get("/access/client-viewers", async (c) => {
  try {
    const result = await listClientViewerAccounts();
    if (!result.ok) return c.json(withRequestId(c, result), 503);
    return c.json(withRequestId(c, result));
  } catch (error) {
    return c.json(
      withRequestId(c, {
        error: "client_viewers_list_failed",
        message: error instanceof Error ? error.message : "Unknown client viewer list failure",
      }),
      500,
    );
  }
});

api.post("/access/client-viewers", async (c) => {
  const parsed = validateViewerAccountInput(await readJson(c));
  if (!parsed.ok) return c.json(withRequestId(c, parsed), 400);

  try {
    const result = await createOrUpdateClientViewerAccount(parsed.value);
    if (!result.ok) {
      const status = result.error === "supabase_admin_not_configured" ? 503 : 409;
      return c.json(withRequestId(c, result), status);
    }
    return c.json(withRequestId(c, result), 201);
  } catch (error) {
    return c.json(
      withRequestId(c, {
        error: "client_viewer_save_failed",
        message: error instanceof Error ? error.message : "Unknown client viewer save failure",
      }),
      500,
    );
  }
});

api.get("/client-report/hidayathon", async (c) =>
  c.json(withRequestId(c, { report: await getPreferredHidayathonClientReportData() })),
);

api.get("/client-report/hidayathon/export-pdf", async (c) => {
  const report = await getPreferredHidayathonClientReportData();
  const ids = (c.req.query("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const exportResult = buildClientReportExportHtml(report, ids);

  if (!exportResult.ok) {
    return c.json(withRequestId(c, exportResult), exportResult.error === "export_no_items" ? 404 : 400);
  }

  return new Response(exportResult.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-rasd-request-id": c.get("requestId"),
    },
  });
});

api.get("/imports/legacy/status", (c) =>
  c.json(withRequestId(c, { legacy_import: store.legacyImportStatus() })),
);

api.get("/imports/legacy/backfill", async (c) =>
  c.json(withRequestId(c, { backfill: getLegacyBackfillDataset(await getMergedLegacyLinkOverrides()) })),
);

api.post("/imports/legacy/backfill/overrides", async (c) => {
  const body = await readJson(c);
  const itemId = body.item_id;
  const originalUrl = body.original_url;

  if (typeof itemId !== "string" || !itemId.trim()) {
    return c.json(withRequestId(c, { error: "item_id_required" }), 400);
  }

  if (typeof originalUrl !== "string" || !originalUrl.trim()) {
    return c.json(withRequestId(c, { error: "original_url_required" }), 400);
  }

  try {
    const result = await upsertLegacyLinkOverride({
      itemId,
      originalUrl,
      status: body.status as LegacyLinkOverrideStatus | undefined,
      note: typeof body.note === "string" ? body.note : undefined,
      verifiedBy: typeof body.verified_by === "string" ? body.verified_by : undefined,
    });

    if (!result.ok) {
      const status = result.error === "supabase_not_configured" ? 503 : 400;
      return c.json(withRequestId(c, result), status);
    }

    return c.json(withRequestId(c, result), 201);
  } catch (error) {
    return c.json(
      withRequestId(c, {
        error: "legacy_link_override_upsert_failed",
        message: error instanceof Error ? error.message : "Unknown legacy link override failure",
      }),
      500,
    );
  }
});

api.get("/imports/legacy/supabase-plan", async (c) => {
  const plan = await buildPersistentLegacySupabaseUpsertPlan();
  return c.json(
    withRequestId(c, {
      supabase_import: {
        organizationId: plan.organizationId,
        topicId: plan.topicId,
        templateId: plan.templateId,
        summary: plan.summary,
        batches: plan.batches.map((batch) => ({
          table: batch.table,
          rows: batch.rows.length,
          onConflict: batch.onConflict,
        })),
      },
    }),
  );
});

api.post("/imports/legacy", (c) =>
  c.json(withRequestId(c, { legacy_import: store.importLegacyReports() }), 201),
);

api.post("/imports/legacy/upsert-supabase", async (c) => {
  const body = await readJson(c);
  const dryRun = body.dry_run !== false;

  if (!dryRun && !isAuthorizedAdminImport(c, body)) {
    return c.json(
      withRequestId(c, {
        error: "admin_import_token_required",
        message: "Real Supabase legacy import requires a server-side RASD_ADMIN_IMPORT_TOKEN match.",
      }),
      403,
    );
  }

  try {
    const result = await upsertLegacyReportsToSupabase({ dryRun });
    return c.json(withRequestId(c, { supabase_import: result }), result.dryRun ? 200 : 201);
  } catch (error) {
    return c.json(
      withRequestId(c, {
        error: "legacy_supabase_upsert_failed",
        message: error instanceof Error ? error.message : "Unknown Supabase upsert failure",
      }),
      500,
    );
  }
});

api.post("/topics", async (c) => {
  const body = await readJson(c);
  return c.json(
    withRequestId(c, {
      id: crypto.randomUUID(),
      name: body.name ?? "مشروع رصد جديد",
      organization_id: body.organization_id ?? "demo-org",
      status: "active",
    }),
    201,
  );
});

api.post("/sources", async (c) => {
  const body = await readJson(c);
  const requestedType = (body.type as SourceType | undefined) ?? "manual_url";
  const requestedFeedUrl = optionalString(body.feed_url, body.feedUrl);

  if (requestedType === "rss" && requestedFeedUrl) {
    const duplicateSource = (await persistentStore.listSources()).find(
      (source) => source.type === "rss" && source.feedUrl === requestedFeedUrl,
    );

    if (duplicateSource) {
      return c.json(withRequestId(c, { source: duplicateSource, duplicate: true }));
    }
  }

  try {
    const source = await persistentStore.createSource({
      name: typeof body.name === "string" ? body.name : undefined,
      type: requestedType,
      url: typeof body.url === "string" ? body.url : undefined,
      feedUrl: requestedFeedUrl,
      credibility: body.credibility as SourceCredibility | undefined,
      isActive: typeof body.is_active === "boolean" ? body.is_active : undefined,
      pollIntervalMinutes:
        typeof body.poll_interval_minutes === "number"
          ? body.poll_interval_minutes
          : typeof body.pollIntervalMinutes === "number"
            ? body.pollIntervalMinutes
            : undefined,
    });
    return c.json(withRequestId(c, { source }), 201);
  } catch (error) {
    if (error instanceof SourceValidationError) {
      return c.json(withRequestId(c, { error: error.message }), 400);
    }
    throw error;
  }
});

api.patch("/sources/:id", async (c) => {
  const body = await readJson(c);
  try {
    const source = await persistentStore.updateSourceSchedule(c.req.param("id"), {
      isActive: typeof body.is_active === "boolean" ? body.is_active : typeof body.isActive === "boolean" ? body.isActive : undefined,
      pollIntervalMinutes:
        typeof body.poll_interval_minutes === "number"
          ? body.poll_interval_minutes
          : typeof body.pollIntervalMinutes === "number"
            ? body.pollIntervalMinutes
            : undefined,
    });
    return c.json(withRequestId(c, { source }));
  } catch (error) {
    if (error instanceof SourceValidationError) {
      return c.json(withRequestId(c, { error: error.message }), 400);
    }
    if (error instanceof Error && error.message === "source_not_found") {
      return c.json(withRequestId(c, { error: "source_not_found" }), 404);
    }
    throw error;
  }
});

api.post("/sources/poll-active", async (c) => {
  const body = await readJson(c);
  const requestedLimit = typeof body.limit === "number" ? Math.trunc(body.limit) : 5;
  const limit = Math.max(1, Math.min(10, requestedLimit));
  const sources = (await persistentStore.listSources())
    .filter((source) => source.type === "rss" && source.isActive && source.feedUrl)
    .slice(0, limit);
  const options = await rssPollOptionsFromBody(body);

  return c.json(
    withRequestId(c, {
      poll: await pollRssSources(sources, options),
    }),
  );
});

api.post("/sources/search-news", async (c) => {
  const body = await readJson(c);
  const testTerm = optionalString(body.test_term, body.testTerm, body.term, body.query);
  const siteUrl = optionalString(body.site_url, body.siteUrl, body.url);
  if (!testTerm) return c.json(withRequestId(c, { error: "test_term_required" }), 400);
  if (!siteUrl || !isSafePublicHttpUrl(siteUrl)) {
    return c.json(withRequestId(c, { error: "site_url_must_be_public_http_url" }), 400);
  }

  const options = await rssPollOptionsFromBody({ test_term: testTerm });
  const maxResults = typeof body.limit === "number" ? Math.trunc(body.limit) : 5;
  const search = await searchNewsSiteWithApifyGoogle(siteUrl, testTerm, { maxResults });
  const sitemapFallback = search.results.length
    ? { results: [], searched: [] as string[], error: undefined as string | undefined }
    : await searchNewsSiteSitemap(siteUrl, testTerm, { maxResults });
  const results = search.results.length ? search.results : sitemapFallback.results;
  const ingest = await ingestNewsSearchResults(results, options.keywordRule);

  return c.json(
    withRequestId(c, {
      search: {
        provider: search.results.length ? "apify_google_search" : "news_sitemap",
        query: search.query,
        fetched: results.length,
        created: ingest.created,
        duplicates: ingest.duplicates,
        failed: ingest.failed,
        testTerm,
        error: results.length ? undefined : `${search.error ?? "apify_google_search_empty"};${sitemapFallback.error ?? "news_sitemap_empty"}`,
        apifyError: search.error,
        sitemapSearched: sitemapFallback.searched,
        results,
        items: ingest.items,
      },
    }),
    results.length === 0 ? 502 : 200,
  );
});

api.get("/cron/poll-sources", async (c) => {
  if (!process.env.CRON_SECRET) {
    return c.json(withRequestId(c, { error: "cron_not_configured" }), 503);
  }
  if (!isCronAuthorized(c)) {
    return c.json(withRequestId(c, { error: "cron_unauthorized" }), 401);
  }

  const requestedLimit = c.req.query("limit") ? Number(c.req.query("limit")) : 5;
  const limit = Math.max(1, Math.min(10, Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 5));
  const nowMs = Date.now();
  const dueSources = (await persistentStore.listSources())
    .filter((source) => source.type === "rss" && isSourceDue(source, nowMs))
    .slice(0, limit);

  return c.json(
    withRequestId(c, {
      poll: {
        due: dueSources.length,
        ...(await pollRssSources(dueSources)),
      },
    }),
  );
});

api.get("/cron/run-connectors", async (c) => {
  if (!process.env.CRON_SECRET) {
    return c.json(withRequestId(c, { error: "cron_not_configured" }), 503);
  }
  if (!isCronAuthorized(c)) {
    return c.json(withRequestId(c, { error: "cron_unauthorized" }), 401);
  }

  try {
    return c.json(withRequestId(c, await runDueConnectors()));
  } catch (error) {
    return c.json(
      withRequestId(c, {
        error: "run_due_failed",
        message: error instanceof Error ? error.message : String(error),
      }),
      500,
    );
  }
});

api.post("/sources/:id/poll", async (c) => {
  try {
    const body = await readJson(c);
    const options = await rssPollOptionsFromBody(body);
    const result = sourcePollPayload(await persistentStore.ingestRssSource(c.req.param("id"), { keywordRule: options.keywordRule }));
    return c.json(withRequestId(c, { poll: { ...result, testTerm: options.testTerm } }));
  } catch (error) {
    const mapped = sourcePollErrorStatus(error);
    return c.json(withRequestId(c, { error: mapped.error }), mapped.status);
  }
});

api.get("/source-rules", async (c) => {
  try {
    const organizationId = optionalString(c.req.query("organization_id"), c.req.query("organizationId")) ?? DEFAULT_ORGANIZATION_ID;
    const [sourceRules, connectorRuns] = await Promise.all([
      persistentStore.listSourceRules(organizationId),
      persistentStore.listConnectorRuns(organizationId),
    ]);
    return c.json(withRequestId(c, { source_rules: sourceRules, connector_runs: connectorRuns }));
  } catch (error) {
    const mapped = sourceRuleErrorStatus(error);
    return c.json(withRequestId(c, { error: mapped.error, detail: mapped.detail }), mapped.status);
  }
});

api.get("/source-intelligence", async (c) => {
  const organizationId = optionalString(c.req.query("organization_id"), c.req.query("organizationId")) ?? DEFAULT_ORGANIZATION_ID;
  const intelligence = getLegacySourceIntelligence();
  const [sources, sourceRules, keywordRules] = await Promise.all([
    persistentStore.listSources(),
    persistentStore.listSourceRules(organizationId),
    persistentStore.listKeywordRules(),
  ]);
  const existingSourceKeys = new Set(sources.map((source) => sourceDuplicateKey(source)));
  const existingRuleKeys = new Set(sourceRules.map((rule) => sourceRuleDuplicateKey(rule)));

  return c.json(
    withRequestId(c, {
      intelligence,
      existing: {
        keywordRuleId: keywordRules[0]?.id ?? null,
        referenceSources: sources.filter((source) => source.type !== "rss").length,
        sourceRules: sourceRules.length,
        newsSources: intelligence.newsSources.filter((source) =>
          source.url ? existingSourceKeys.has(sourceDuplicateKey({ type: "web_page", url: source.url })) : false,
        ).length,
        xAccounts: intelligence.xAccounts.filter((source) =>
          source.url ? existingSourceKeys.has(sourceDuplicateKey({ type: "x_recent_search", url: source.url })) : false,
        ).length,
        instagramProfiles: intelligence.instagramProfiles.filter((source) =>
          source.url ? existingRuleKeys.has(sourceRuleDuplicateKey({ type: "instagram_public_profile", url: source.url })) : false,
        ).length,
        tiktokProfiles: intelligence.tiktokProfiles.filter((source) =>
          source.url ? existingRuleKeys.has(sourceRuleDuplicateKey({ type: "tiktok_research", url: source.url })) : false,
        ).length,
        tiktokQueries: intelligence.tiktokQueries.filter((source) =>
          source.query ? existingRuleKeys.has(sourceRuleDuplicateKey({ type: "tiktok_research", query: source.query })) : false,
        ).length,
      },
    }),
  );
});

api.post("/source-intelligence/apply", async (c) => {
  const body = await readJson(c);
  const action = optionalString(body.action);
  const organizationId = optionalString(body.organization_id, body.organizationId) ?? DEFAULT_ORGANIZATION_ID;
  const topicId = optionalString(body.topic_id, body.topicId) ?? DEFAULT_TOPIC_ID;
  const limit = requestedApplyLimit(body.limit, 8);
  const intelligence = getLegacySourceIntelligence();

  if (action === "apply_keywords") {
    const currentRule = (await persistentStore.listKeywordRules())[0];
    const keywordRule = await persistentStore.upsertKeywordRule({
      id: currentRule?.id,
      requiredTerms: mergeTerms(currentRule?.requiredTerms, intelligence.keywords.requiredTerms),
      optionalTerms: mergeTerms(currentRule?.optionalTerms, intelligence.keywords.optionalTerms),
      excludeTerms: mergeTerms(currentRule?.excludeTerms, intelligence.keywords.excludeTerms),
      language: currentRule?.language ?? "mixed",
      priority: currentRule?.priority ?? 100,
    });
    return c.json(withRequestId(c, { ok: true, action, keyword_rule: keywordRule }));
  }

  if (action === "apply_social_watchlists") {
    const existingRules = await persistentStore.listSourceRules(organizationId);
    const existingKeys = new Set(existingRules.map((rule) => sourceRuleDuplicateKey(rule)));
    const candidates = [
      ...intelligence.tiktokQueries.slice(0, limit).map((recommendation) => ({
        type: "tiktok_research" as const,
        query: recommendation.query ?? recommendation.label,
        url: null,
        label: recommendation.label,
      })),
      ...intelligence.tiktokProfiles.slice(0, limit).map((recommendation) => ({
        type: "tiktok_research" as const,
        query: null,
        url: recommendation.url ?? null,
        label: recommendation.label,
      })),
      ...intelligence.instagramProfiles.slice(0, limit).map((recommendation) => ({
        type: "instagram_public_profile" as const,
        query: null,
        url: recommendation.url ?? null,
        label: recommendation.label,
      })),
    ];

    const created = [];
    const skipped = [];
    for (const candidate of candidates) {
      const key = sourceRuleDuplicateKey(candidate);
      if (existingKeys.has(key)) {
        skipped.push(candidate.label);
        continue;
      }
      const sourceRule = await persistentStore.upsertSourceRule({
        organizationId,
        topicId,
        sourceId: null,
        type: candidate.type,
        query: candidate.query,
        url: candidate.url,
        active: true,
        pollIntervalMinutes: 1440,
      });
      existingKeys.add(key);
      created.push(sourceRule);
    }

    return c.json(withRequestId(c, { ok: true, action, created, skipped }));
  }

  if (action === "apply_reference_sources") {
    const existingSources = await persistentStore.listSources();
    const existingKeys = new Set(existingSources.map((source) => sourceDuplicateKey(source)));
    const candidates = [
      ...intelligence.newsSources.slice(0, limit).map((recommendation) => ({
        name: recommendation.label,
        type: "web_page" as const,
        url: recommendation.url,
        credibility: "media" as const,
        sample: recommendationSampleUrl(recommendation),
      })),
      ...intelligence.xAccounts.slice(0, limit).map((recommendation) => ({
        name: recommendation.label,
        type: "x_recent_search" as const,
        url: recommendation.url,
        credibility: "influencer" as const,
        sample: recommendationSampleUrl(recommendation),
      })),
    ].filter((candidate): candidate is typeof candidate & { url: string } => Boolean(candidate.url));

    const created = [];
    const skipped = [];
    for (const candidate of candidates) {
      const key = sourceDuplicateKey(candidate);
      if (existingKeys.has(key)) {
        skipped.push(candidate.name);
        continue;
      }
      const source = await persistentStore.createSource({
        name: candidate.name,
        type: candidate.type,
        url: candidate.url,
        credibility: candidate.credibility,
        isActive: false,
        pollIntervalMinutes: 1440,
      });
      existingKeys.add(key);
      created.push({ ...source, sampleUrl: candidate.sample });
    }

    return c.json(withRequestId(c, { ok: true, action, created, skipped }));
  }

  return c.json(withRequestId(c, { error: "source_intelligence_action_unsupported" }), 400);
});

api.post("/source-rules", async (c) => {
  try {
    const body = await readJson(c);
    const parsed = validateSourceRulePayload(body);
    if (!parsed.ok) return c.json(withRequestId(c, { error: parsed.error }), 400);

    const sourceRule = await persistentStore.upsertSourceRule(parsed.value);
    return c.json(withRequestId(c, { source_rule: sourceRule }), 201);
  } catch (error) {
    const mapped = sourceRuleErrorStatus(error);
    return c.json(withRequestId(c, { error: mapped.error, detail: mapped.detail }), mapped.status);
  }
});

api.post("/source-rules/run-due", async (c) => {
  try {
    const body = await readJson(c);
    const organizationId = optionalString(body.organization_id, body.organizationId) ?? DEFAULT_ORGANIZATION_ID;
    const force = body.force === true || body.run_now === true || body.runNow === true;
    const sourceRuleId = optionalString(body.source_rule_id, body.sourceRuleId);
    return c.json(withRequestId(c, await runDueConnectors(organizationId, { force, sourceRuleId })));
  } catch (error) {
    const mapped = sourceRuleErrorStatus(error);
    return c.json(withRequestId(c, { error: mapped.error, detail: mapped.detail }), mapped.status);
  }
});

api.patch("/source-rules/:id", async (c) => {
  try {
    const body = await readJson(c);
    const organizationId = optionalString(body.organization_id, body.organizationId) ?? DEFAULT_ORGANIZATION_ID;
    const existing = (await persistentStore.listSourceRules(organizationId)).find((rule) => rule.id === c.req.param("id"));
    if (!existing) return c.json(withRequestId(c, { error: "source_rule_not_found" }), 404);

    const parsed = validateSourceRulePayload({ ...body, id: existing.id }, existing);
    if (!parsed.ok) return c.json(withRequestId(c, { error: parsed.error }), 400);

    const sourceRule = await persistentStore.upsertSourceRule(parsed.value);
    return c.json(withRequestId(c, { source_rule: sourceRule }));
  } catch (error) {
    const mapped = sourceRuleErrorStatus(error);
    return c.json(withRequestId(c, { error: mapped.error, detail: mapped.detail }), mapped.status);
  }
});

api.delete("/source-rules/:id", async (c) => {
  try {
    const deleted = await persistentStore.deleteSourceRule(c.req.param("id"));
    if (!deleted) return c.json(withRequestId(c, { error: "source_rule_not_found" }), 404);
    return c.json(withRequestId(c, { ok: true, id: c.req.param("id") }));
  } catch (error) {
    const mapped = sourceRuleErrorStatus(error);
    return c.json(withRequestId(c, { error: mapped.error, detail: mapped.detail }), mapped.status);
  }
});

api.get("/keyword-rules", async (c) => c.json(withRequestId(c, { keyword_rules: await persistentStore.listKeywordRules() })));

api.post("/keyword-rules", async (c) => {
  const body = await readJson(c);
  const keywordRule = await persistentStore.upsertKeywordRule({
    id: typeof body.id === "string" ? body.id : undefined,
    requiredTerms: stringArray(body.requiredTerms ?? body.required_terms),
    optionalTerms: stringArray(body.optionalTerms ?? body.optional_terms),
    excludeTerms: stringArray(body.excludeTerms ?? body.exclude_terms),
    language: body.language === "ar" || body.language === "en" || body.language === "mixed" ? body.language : undefined,
    priority: typeof body.priority === "number" ? body.priority : undefined,
  });
  return c.json(withRequestId(c, { keyword_rule: keywordRule }), 201);
});

api.post("/items/manual-url", async (c) => {
  const body = await readJson(c);
  const url = body.url;

  if (!url || typeof url !== "string") {
    return c.json(withRequestId(c, { error: "url is required" }), 400);
  }

  if (!isHttpUrl(url)) {
    return c.json(withRequestId(c, { error: "url must be a valid http or https URL" }), 400);
  }
  if (!isSafePublicHttpUrl(url)) {
    return c.json(withRequestId(c, { error: "url must be a public http or https URL" }), 400);
  }

  const publishedAt = optionalIsoDate(body.publishedAt ?? body.published_at);
  if (!publishedAt.ok) {
    return c.json(withRequestId(c, { error: "published_at must be a valid date" }), 400);
  }

  const providedTitle = optionalString(body.title);
  const providedText = optionalString(body.text);
  const providedAuthorName = optionalString(body.authorName, body.author_name);
  const providedAuthorHandle = optionalString(body.authorHandle, body.author_handle);
  const keywordRule = temporaryKeywordRuleFromTerm(
    body.test_term ?? body.testTerm,
    (await persistentStore.listKeywordRules())[0] ?? null,
  );
  const metadata =
    providedTitle && providedText && providedAuthorName
      ? null
      : await fetchUrlMetadata(url);
  const intakeUrl = metadata?.canonicalUrl ?? url;

  const result = await persistentStore.ingestManualUrl({
    url: intakeUrl,
    title: providedTitle ?? metadata?.title,
    text: providedText ?? metadata?.text,
    authorName: providedAuthorName ?? metadata?.authorName,
    authorHandle: providedAuthorHandle ?? metadata?.authorHandle,
    publishedAt: publishedAt.value ?? metadata?.publishedAt,
    extraction: compactExtractionMetadata(metadata),
    keywordRule,
  });

  return c.json(
    withRequestId(c, {
      ...result,
      metadata,
      testTerm: keywordRule?.requiredTerms[0],
      next_step: result.item.state === "needs_review" ? "review" : "tune_keyword_rules",
    }),
    result.duplicate ? 200 : 201,
  );
});

api.get("/items/:id/evidence-card.svg", async (c) => {
  try {
    const item = (await persistentStore.listItems()).find((entry) => entry.id === c.req.param("id"));
    if (!item) return c.text("not_found", 404);

    return new Response(renderEvidenceCardSvg(item), {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "private, max-age=60",
      },
    });
  } catch {
    return c.json(withRequestId(c, { error: "evidence_card_render_failed" }), 500);
  }
});

api.post("/connectors/run-due", async (c) => {
  if (!process.env.CRON_SECRET) {
    return c.json(withRequestId(c, { error: "cron_not_configured" }), 503);
  }
  if (!isCronAuthorized(c)) {
    return c.json(withRequestId(c, { error: "cron_unauthorized" }), 401);
  }

  const body = await readJson(c);
  const organizationId = typeof body.organization_id === "string" ? body.organization_id : undefined;

  try {
    return c.json(withRequestId(c, await runDueConnectors(organizationId)));
  } catch (error) {
    return c.json(
      withRequestId(c, {
        error: "run_due_failed",
        message: error instanceof Error ? error.message : String(error),
      }),
      500,
    );
  }
});

api.get("/connectors/runs", async (c) => {
  const organizationId = optionalString(c.req.query("organization_id"), c.req.query("organizationId")) ?? DEFAULT_ORGANIZATION_ID;
  return c.json(withRequestId(c, { connector_runs: await persistentStore.listConnectorRuns(organizationId) }));
});

api.post("/connectors/run-job", async (c) => {
  if (!process.env.CRON_SECRET) {
    return c.json(withRequestId(c, { error: "cron_not_configured" }), 503);
  }
  if (!isCronAuthorized(c)) {
    return c.json(withRequestId(c, { error: "cron_unauthorized" }), 401);
  }

  const body = await readJson(c);
  const jobId = typeof body.jobId === "string" ? body.jobId : typeof body.job_id === "string" ? body.job_id : undefined;

  if (!jobId) {
    return c.json(withRequestId(c, { error: "job_id_required" }), 400);
  }

  try {
    const job = await persistentStore.runConnectorJob(jobId);
    if (job?.status === "failed" || job?.status === "dead_letter") {
      return c.json(
        withRequestId(c, {
          ok: false,
          jobId,
          status: job.status,
          failureReason: job.failureReason ?? "connector_job_failed",
        }),
        500,
      );
    }
    return c.json(withRequestId(c, { ok: true, jobId, status: job?.status ?? "unknown" }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "job_not_found") {
      return c.json(withRequestId(c, { error: "job_not_found" }), 404);
    }
    return c.json(withRequestId(c, { error: "run_job_failed", message }), 500);
  }
});

api.post("/connectors/:type/run", async (c) => {
  const type = c.req.param("type") as SourceType;
  const result = await persistentStore.runConnector(type);

  if (!result.ok) {
    return c.json(withRequestId(c, { error: "budget_exceeded", budget: result.budget }), 402);
  }

  return c.json(withRequestId(c, result));
});

api.post("/items/:id/review", async (c) => {
  const id = c.req.param("id");
  const body = await readJson(c);
  const action = body.action;

  if (action !== "approve" && action !== "reject") {
    return c.json(withRequestId(c, { error: "action must be approve or reject" }), 400);
  }

  try {
    const result = await persistentStore.reviewItem(id, action, typeof body.review_notes === "string" ? body.review_notes : undefined);
    return c.json(withRequestId(c, result));
  } catch {
    return c.json(withRequestId(c, { error: "item_not_found" }), 404);
  }
});

api.patch("/items/:id", async (c) => {
  const body = await readJson(c);
  const originalUrl = optionalString(body.original_url, body.originalUrl);
  if (originalUrl && !isSafePublicHttpUrl(originalUrl)) {
    return c.json(withRequestId(c, { error: "original_url_not_public" }), 400);
  }

  try {
    const result = await persistentStore.updateItem(c.req.param("id"), {
      title: optionalString(body.title),
      summary: optionalString(body.summary, body.text),
      authorName: optionalString(body.author_name, body.authorName),
      authorHandle: typeof body.author_handle === "string" ? body.author_handle : typeof body.authorHandle === "string" ? body.authorHandle : undefined,
      publishedAt: optionalString(body.published_at, body.publishedAt),
      originalUrl,
    });
    return c.json(withRequestId(c, result));
  } catch (error) {
    if (error instanceof Error && error.message === "item_not_found") {
      return c.json(withRequestId(c, { error: "item_not_found" }), 404);
    }
    if (error instanceof Error && error.message === "published_at_invalid") {
      return c.json(withRequestId(c, { error: "published_at must be a valid date" }), 400);
    }
    if (error instanceof Error && error.message === "original_url_not_public") {
      return c.json(withRequestId(c, { error: "original_url_not_public" }), 400);
    }
    throw error;
  }
});

api.post("/items/:id/merge", async (c) => {
  const body = await readJson(c);
  try {
    return c.json(
      withRequestId(c, await persistentStore.mergeItem(c.req.param("id"), typeof body.target_id === "string" ? body.target_id : undefined)),
    );
  } catch {
    return c.json(withRequestId(c, { error: "item_not_found" }), 404);
  }
});

api.post("/items/:id/archive", async (c) => {
  const body = await readJson(c);
  try {
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : undefined;
    return c.json(withRequestId(c, await persistentStore.archiveItem(c.req.param("id"), reason)));
  } catch {
    return c.json(withRequestId(c, { error: "item_not_found" }), 404);
  }
});

api.post("/items/archive-workflow", async (c) => {
  const body = await readJson(c);
  const ids = stringArray(body.ids);
  const limit = positiveInteger(body.limit, 48, 48);
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : "تنظيف مواد التشغيل الظاهرة من صفحة إضافة ومراجعة المحتوى.";

  return c.json(
    withRequestId(c, {
      cleanup: await persistentStore.archiveWorkflowItems({ ids, limit, reason }),
    }),
  );
});

api.post("/items/:id/capture-preview", async (c) => {
  const body = await readJson(c);
  try {
    const result = await persistentStore.requestCapture(c.req.param("id"), "preview", body.fail === true);
    if (!result.allowed) return c.json(withRequestId(c, { error: "budget_exceeded", budget: result.budget }), 402);
    return c.json(withRequestId(c, result));
  } catch {
    return c.json(withRequestId(c, { error: "item_not_found" }), 404);
  }
});

api.post("/items/:id/capture-report-grade", async (c) => {
  const body = await readJson(c);
  try {
    const result = await persistentStore.requestCapture(c.req.param("id"), "report_grade", body.fail === true);
    if (!result.allowed) return c.json(withRequestId(c, { error: "budget_exceeded", budget: result.budget }), 402);
    return c.json(withRequestId(c, { ...result, capture_source: "rendered_evidence_card" }));
  } catch {
    return c.json(withRequestId(c, { error: "item_not_found" }), 404);
  }
});

api.post("/reports", async (c) => {
  const body = await readJson(c);
  return c.json(withRequestId(c, await persistentStore.createReport({ title: body.title })), 201);
});

api.get("/reports/hidayathon-live", async (c) =>
  c.json(withRequestId(c, { report: await persistentStore.getHidayathonLiveReport() })),
);

api.post("/reports/:id/items", async (c) => {
  const body = await readJson(c);
  const itemId = body.item_id;
  if (!itemId || typeof itemId !== "string") {
    return c.json(withRequestId(c, { error: "item_id is required" }), 400);
  }

  try {
    const result = await persistentStore.addReportItem(c.req.param("id"), itemId, body.warning_accepted === true);
    if (!result.ok) return c.json(withRequestId(c, result), result.error === "report_not_found" ? 404 : 409);
    return c.json(withRequestId(c, result));
  } catch {
    return c.json(withRequestId(c, { error: "item_not_found" }), 404);
  }
});

api.post("/reports/:id/publish", async (c) => {
  const result = await persistentStore.publishReport(c.req.param("id"));
  if (!result.ok) return c.json(withRequestId(c, result), 404);
  return c.json(withRequestId(c, result));
});

api.post("/reports/:id/share-link", async (c) => {
  const body = await readJson(c);
  const result = await createReportShareLink(c.req.param("id"), {
    maxViews: typeof body.max_views === "number" ? body.max_views : undefined,
    expiresInDays: typeof body.expires_in_days === "number" ? body.expires_in_days : undefined,
  });
  if (!result.ok) return c.json(withRequestId(c, result), 404);
  return c.json(withRequestId(c, result), 201);
});

api.get("/reports/:id/share-links", async (c) => {
  const result = await listReportShareLinks(c.req.param("id"));
  if (!result.ok) return c.json(withRequestId(c, result), 404);
  return c.json(withRequestId(c, result));
});

api.get("/share-links/:token", async (c) => {
  const result = await resolveReportShareLink(c.req.param("token"));
  if (!result.ok) {
    const status = result.error === "share_link_not_found" ? 404 : 410;
    return c.json(withRequestId(c, result), status);
  }
  return c.json(withRequestId(c, result));
});

api.post("/share-links/:token/revoke", async (c) => {
  const result = await revokeReportShareLink(c.req.param("token"));
  if (!result.ok) return c.json(withRequestId(c, result), 404);
  return c.json(withRequestId(c, result));
});

api.post("/share-links/:id/revoke-by-id", async (c) => {
  const result = await revokeReportShareLinkById(c.req.param("id"));
  if (!result.ok) return c.json(withRequestId(c, result), 404);
  return c.json(withRequestId(c, result));
});

api.post("/reports/:id/export-pdf", (c) =>
  c.json(
    withRequestId(c, {
      report_id: c.req.param("id"),
      job_id: crypto.randomUUID(),
      source: "html_report_page",
      status: "pending",
    }),
  ),
);

api.get("/reports", async (c) => c.json(withRequestId(c, { reports: await persistentStore.listReports() })));
api.get("/reports/:id/items", async (c) =>
  c.json(withRequestId(c, { report_items: await persistentStore.listReportItems(c.req.param("id")) })),
);
api.get("/sources", async (c) => c.json(withRequestId(c, { sources: await persistentStore.listSources() })));
api.get("/items", async (c) => c.json(withRequestId(c, { items: await persistentStore.listItems() })));
api.get("/items/:id/captures", async (c) =>
  c.json(withRequestId(c, { captures: await persistentStore.listCaptures(c.req.param("id")) })),
);

api.get("/captures/:id/asset", async (c) => {
  try {
    const asset = await persistentStore.getCaptureAsset(c.req.param("id"));
    const body = asset.body.buffer.slice(asset.body.byteOffset, asset.body.byteOffset + asset.body.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "content-type": asset.contentType,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "capture_asset_not_found";
    const status = message === "capture_not_found" ? 404 : 409;
    return c.json(withRequestId(c, { error: message }), status);
  }
});
