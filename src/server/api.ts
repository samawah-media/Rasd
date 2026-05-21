import { Hono } from "hono";
import type { SourceCredibility, SourceType } from "@/lib/types";
import { getPreferredHidayathonClientReportData } from "@/lib/client-report-data";
import { getLegacyBackfillDataset } from "@/lib/legacy-backfill";
import { keywordRules } from "@/lib/mock-data";
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
import { fetchUrlMetadata, isSafePublicHttpUrl } from "@/server/url-metadata";
import { renderEvidenceCardSvg } from "@/server/evidence-card";
import { buildClientReportExportHtml } from "@/server/client-report-export";

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

function optionalIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return { ok: true as const, value: undefined };
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return { ok: false as const };
  return { ok: true as const, value: new Date(timestamp).toISOString() };
}

function isAuthorizedAdminImport(c: { req: { header(name: string): string | undefined } }, body: JsonBody) {
  const expectedToken = process.env.RASD_ADMIN_IMPORT_TOKEN;
  void body;
  const providedToken = c.req.header("x-rasd-admin-token");

  return Boolean(expectedToken && providedToken && providedToken === expectedToken);
}

api.get("/admin/health", async (c) => c.json(withRequestId(c, await persistentStore.health())));

api.get("/admin/persistence", async (c) =>
  c.json(withRequestId(c, { persistence: await checkSupabasePersistence() })),
);

api.get("/audit-logs", async (c) => c.json(withRequestId(c, { audit_logs: await persistentStore.listAuditLogs() })));

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
  const source = await persistentStore.createSource({
    name: typeof body.name === "string" ? body.name : undefined,
    type: body.type as SourceType | undefined,
    url: typeof body.url === "string" ? body.url : undefined,
    credibility: body.credibility as SourceCredibility | undefined,
  });
  return c.json(withRequestId(c, { source }), 201);
});

api.post("/source-rules", async (c) => {
  const body = await readJson(c);
  return c.json(
    withRequestId(c, {
      id: crypto.randomUUID(),
      source_id: body.source_id,
      type: body.type ?? "manual_url",
      cursor: null,
      active: true,
    }),
    201,
  );
});

api.post("/keyword-rules", async (c) => {
  const body = await readJson(c);
  return c.json(
    withRequestId(c, {
      keyword_rule: {
        ...keywordRules[0],
        ...body,
        id: crypto.randomUUID(),
        version: body.version ?? 1,
      },
    }),
    201,
  );
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
  const metadata =
    providedTitle && providedText && providedAuthorName
      ? null
      : await fetchUrlMetadata(url);

  const result = await persistentStore.ingestManualUrl({
    url,
    title: providedTitle ?? metadata?.title,
    text: providedText ?? metadata?.text,
    authorName: providedAuthorName ?? metadata?.authorName,
    authorHandle: providedAuthorHandle ?? metadata?.authorHandle,
    publishedAt: publishedAt.value ?? metadata?.publishedAt,
  });

  return c.json(
    withRequestId(c, {
      ...result,
      metadata,
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
