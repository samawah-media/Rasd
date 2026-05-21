import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { api } from "../src/server/api";
import { store } from "../src/server/store";

async function requestJson(path: string, init?: RequestInit) {
  const response = await api.fetch(
    new Request(`http://rasd.test${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    }),
  );

  const json = await response.json();
  return { response, json };
}

async function requestText(path: string, init?: RequestInit) {
  const response = await api.fetch(new Request(`http://rasd.test${path}`, init));
  const text = await response.text();
  return { response, text };
}

describe("Hono API acceptance workflow", () => {
  beforeEach(() => {
    store.resetForTest();
  });

  it("returns request IDs and runtime persistence status", async () => {
    const { response, json } = await requestJson("/api/admin/persistence");

    assert.equal(response.status, 200);
    assert.equal(typeof json.requestId, "string");
    assert.equal(json.persistence.ok, true);
    assert.match(json.persistence.mode, /^(memory|supabase)$/);
    assert.equal(typeof json.persistence.publicConfigured, "boolean");
    assert.equal(typeof json.persistence.serverConfigured, "boolean");
    assert.equal(typeof json.persistence.message, "string");
  });

  it("reports partial Supabase activation without requiring server write credentials", async () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const previousServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ewunxfttbpqisspqthiz.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      const { response, json } = await requestJson("/api/admin/persistence");

      assert.equal(response.status, 200);
      assert.equal(json.persistence.mode, "memory");
      assert.equal(json.persistence.publicConfigured, true);
      assert.equal(json.persistence.serverConfigured, false);
      assert.equal(json.persistence.projectRef, "ewunxfttbpqisspqthiz");
      assert.equal(json.persistence.missing.serviceRoleKey, true);
    } finally {
      if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;

      if (previousPublishableKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousPublishableKey;

      if (previousServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRoleKey;
    }
  });

  it("does not expose Supabase keys or admin tokens in persistence responses", async () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const previousServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const previousAdminToken = process.env.RASD_ADMIN_IMPORT_TOKEN;

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ewunxfttbpqisspqthiz.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_should_not_echo";
    process.env.RASD_ADMIN_IMPORT_TOKEN = "admin_token_should_not_echo";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      const { response, json } = await requestJson("/api/admin/persistence");
      const serialized = JSON.stringify(json);

      assert.equal(response.status, 200);
      assert.equal(json.persistence.projectRef, "ewunxfttbpqisspqthiz");
      assert.equal(serialized.includes("sb_publishable_should_not_echo"), false);
      assert.equal(serialized.includes("admin_token_should_not_echo"), false);
      assert.equal(serialized.includes("service_role"), false);
    } finally {
      if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;

      if (previousPublishableKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousPublishableKey;

      if (previousServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRoleKey;

      if (previousAdminToken === undefined) delete process.env.RASD_ADMIN_IMPORT_TOKEN;
      else process.env.RASD_ADMIN_IMPORT_TOKEN = previousAdminToken;
    }
  });

  it("rejects invalid manual intake payloads", async () => {
    const { response, json } = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({ title: "Missing URL" }),
    });
    const invalidUrl = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({ url: "not-a-url" }),
    });
    const invalidDate = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/story", published_at: "not-a-date" }),
    });
    const privateUrl = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({ url: "http://127.0.0.1/admin" }),
    });

    assert.equal(response.status, 400);
    assert.equal(json.error, "url is required");
    assert.equal(invalidUrl.response.status, 400);
    assert.equal(invalidUrl.json.error, "url must be a valid http or https URL");
    assert.equal(invalidDate.response.status, 400);
    assert.equal(invalidDate.json.error, "published_at must be a valid date");
    assert.equal(privateUrl.response.status, 400);
    assert.equal(privateUrl.json.error, "url must be a public http or https URL");
  });

  it("hydrates a pasted X URL into a readable manual item", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          author_name: "Hidayathon",
          author_url: "https://twitter.com/Hidayathon",
          html:
            '<blockquote><p lang="ar">تغطية جديدة لهاكاثون هداية من رابط فقط.</p>&mdash; Hidayathon (@Hidayathon) <a href="https://twitter.com/Hidayathon/status/987654321">May 20, 2026</a></blockquote>',
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    try {
      const manual = await requestJson("/api/items/manual-url", {
        method: "POST",
        body: JSON.stringify({ url: "https://x.com/Hidayathon/status/987654321?utm_source=test" }),
      });

      assert.equal(manual.response.status, 201);
      assert.equal(manual.json.metadata.source, "x_oembed");
      assert.equal(manual.json.item.title, "تغطية جديدة لهاكاثون هداية من رابط فقط.");
      assert.equal(manual.json.item.summary, "تغطية جديدة لهاكاثون هداية من رابط فقط.");
      assert.equal(manual.json.item.authorName, "Hidayathon");
      assert.equal(manual.json.item.authorHandle, "@Hidayathon");
      assert.equal(manual.json.item.originalUrl, "https://x.com/Hidayathon/status/987654321");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("refreshes stale duplicate X items with newly available metadata", async () => {
    const stale = store.ingestManualUrl({
      url: "https://x.com/UOfjeddah/status/2013613302509699235?lang=en",
    });
    assert.equal(stale.item.summary.startsWith("تم حفظ الرابط"), true);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          author_name: "جامعة جدة",
          author_url: "https://twitter.com/UOfjeddah",
          html:
            '<blockquote><p lang="ar" dir="rtl">هاكثون هداية | من مكة تنطلق الفكرة وبالعلم يتحقق الأثر.</p>&mdash; جامعة جدة (@UOfjeddah) <a href="https://twitter.com/UOfjeddah/status/2013613302509699235">January 20, 2026</a></blockquote>',
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    try {
      const duplicate = await requestJson("/api/items/manual-url", {
        method: "POST",
        body: JSON.stringify({ url: "https://x.com/UOfjeddah/status/2013613302509699235" }),
      });

      assert.equal(duplicate.response.status, 200);
      assert.equal(duplicate.json.duplicate, true);
      assert.equal(duplicate.json.item.id, stale.item.id);
      assert.equal(duplicate.json.item.title, "هاكثون هداية | من مكة تنطلق الفكرة وبالعلم يتحقق الأثر.");
      assert.equal(duplicate.json.item.summary, "هاكثون هداية | من مكة تنطلق الفكرة وبالعلم يتحقق الأثر.");
      assert.equal(duplicate.json.item.authorName, "جامعة جدة");
      assert.equal(duplicate.json.item.authorHandle, "@UOfjeddah");
      assert.equal(duplicate.json.item.originalUrl, "https://x.com/UOfjeddah/status/2013613302509699235");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("runs the manual intake to report insertion lifecycle", async () => {
    const liveReport = await requestJson("/api/reports/hidayathon-live");
    assert.equal(liveReport.response.status, 200);
    assert.equal(liveReport.json.report.id, "report-5");

    const manual = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({
        url: "https://x.com/Hidayathon/status/123456789?utm_campaign=test#frag",
        title: "متابعة هاكاثون هداية عبر اختبار API",
        text: "مادة عن هداية وهاكاثون هداية لاختبار دورة الرصد.",
        author_name: "فريق اختبار رصد",
        author_handle: "@rasd_test",
        published_at: "2026-05-20T10:30:00.000Z",
      }),
    });

    assert.equal(manual.response.status, 201);
    assert.equal(manual.json.item.state, "needs_review");
    assert.equal(manual.json.evidence.kind, "evidence_lite");
    assert.match(manual.json.evidence.assetUrl, /^\/api\/items\/.+\/evidence-card\.svg$/);
    assert.equal(manual.json.item.authorName, "فريق اختبار رصد");
    assert.equal(manual.json.item.authorHandle, "@rasd_test");
    assert.equal(manual.json.item.publishedAt, "2026-05-20T10:30:00.000Z");

    const duplicate = await requestJson("/api/items/manual-url", {
      method: "POST",
      body: JSON.stringify({
        url: "https://x.com/Hidayathon/status/123456789",
        title: "متابعة هاكاثون هداية عبر اختبار API",
        text: "مادة عن هداية وهاكاثون هداية لاختبار دورة الرصد.",
      }),
    });

    assert.equal(duplicate.response.status, 200);
    assert.equal(duplicate.json.duplicate, true);
    assert.equal(duplicate.json.item.id, manual.json.item.id);

    const approved = await requestJson(`/api/items/${manual.json.item.id}/review`, {
      method: "POST",
      body: JSON.stringify({ action: "approve", review_notes: "API acceptance" }),
    });

    assert.equal(approved.response.status, 200);
    assert.equal(approved.json.item.state, "approved_pending_capture");

    const blockedInsert = await requestJson(`/api/reports/${liveReport.json.report.id}/items`, {
      method: "POST",
      body: JSON.stringify({ item_id: manual.json.item.id }),
    });

    assert.equal(blockedInsert.response.status, 409);
    assert.equal(blockedInsert.json.error, "item_not_report_ready");

    const captured = await requestJson(`/api/items/${manual.json.item.id}/capture-report-grade`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    assert.equal(captured.response.status, 200);
    assert.equal(captured.json.item.state, "report_ready");
    assert.equal(captured.json.capture.status, "success");
    assert.match(captured.json.capture.assetUrl, /^\/api\/items\/.+\/evidence-card\.svg$/);
    assert.equal(captured.json.capture_source, "rendered_evidence_card");

    const evidenceSvg = await requestText(captured.json.capture.assetUrl);
    assert.equal(evidenceSvg.response.status, 200);
    assert.match(evidenceSvg.response.headers.get("content-type") ?? "", /image\/svg\+xml/);
    assert.match(evidenceSvg.text, /متابعة/);

    const inserted = await requestJson(`/api/reports/${liveReport.json.report.id}/items`, {
      method: "POST",
      body: JSON.stringify({ item_id: manual.json.item.id }),
    });

    assert.equal(inserted.response.status, 200);
    assert.equal(inserted.json.ok, true);
    assert.equal(inserted.json.reportItem.itemId, manual.json.item.id);

    const clientReport = await requestJson("/api/client-report/hidayathon");
    const manualReportItem = clientReport.json.report.items.find((item: { id: string }) => item.id === manual.json.item.id);

    assert.equal(clientReport.response.status, 200);
    assert.equal(clientReport.json.report.summary.items, 125);
    assert.equal(manualReportItem.title, "متابعة هاكاثون هداية عبر اختبار API");
    assert.equal(manualReportItem.authorName, "فريق اختبار رصد");
    assert.equal(manualReportItem.platform, "X");
    assert.equal(manualReportItem.reportLabel, "الرصد الحي");
    assert.equal(manualReportItem.originalUrl, "https://x.com/Hidayathon/status/123456789");
    assert.equal(manualReportItem.linkStatus, "openable");
    assert.equal(manualReportItem.screenshotStatus, "available");
    assert.match(manualReportItem.contentImagePath, /^\/api\/items\/.+\/evidence-card\.svg$/);
  });

  it("preserves warning gates for failed captures", async () => {
    const blocked = await requestJson("/api/reports/report-5/items", {
      method: "POST",
      body: JSON.stringify({ item_id: "item-3" }),
    });
    const accepted = await requestJson("/api/reports/report-5/items", {
      method: "POST",
      body: JSON.stringify({ item_id: "item-3", warning_accepted: true }),
    });

    assert.equal(blocked.response.status, 409);
    assert.equal(accepted.response.status, 200);
    assert.equal(accepted.json.reportItem.warningAccepted, true);
  });

  it("validates review actions and missing items", async () => {
    const invalidAction = await requestJson("/api/items/item-2/review", {
      method: "POST",
      body: JSON.stringify({ action: "maybe" }),
    });
    const missingItem = await requestJson("/api/items/nope/review", {
      method: "POST",
      body: JSON.stringify({ action: "approve" }),
    });

    assert.equal(invalidAction.response.status, 400);
    assert.equal(missingItem.response.status, 404);
  });

  it("enforces share link token privacy, view limits, and revocation through the API", async () => {
    const created = await requestJson("/api/reports/report-5/share-link", {
      method: "POST",
      body: JSON.stringify({ max_views: 1, expires_in_days: 1 }),
    });

    assert.equal(created.response.status, 201);
    assert.equal(typeof created.json.token, "string");
    assert.notEqual(created.json.link.tokenHash, `sha256:${created.json.token}`);
    assert.equal(created.json.link.tokenHash.length, "sha256:".length + 64);

    const firstView = await requestJson(`/api/share-links/${created.json.token}`);
    const secondView = await requestJson(`/api/share-links/${created.json.token}`);

    assert.equal(firstView.response.status, 200);
    assert.equal(firstView.json.link.viewCount, 1);
    assert.equal(secondView.response.status, 410);
    assert.equal(secondView.json.error, "share_link_view_limit_reached");

    const revocable = await requestJson("/api/reports/report-5/share-link", {
      method: "POST",
      body: JSON.stringify({ expires_in_days: 1 }),
    });
    const revoked = await requestJson(`/api/share-links/${revocable.json.token}/revoke`, { method: "POST" });
    const afterRevoke = await requestJson(`/api/share-links/${revocable.json.token}`);

    assert.equal(revoked.response.status, 200);
    assert.equal(afterRevoke.response.status, 410);
    assert.equal(afterRevoke.json.error, "share_link_revoked");
  });

  it("keeps X API failure isolated as not configured", async () => {
    const { response, json } = await requestJson("/api/connectors/x_recent_search/run", { method: "POST" });

    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.run.status, "not_configured");
  });

  it("imports approved legacy data through the API idempotently", async () => {
    const before = await requestJson("/api/imports/legacy/status");
    assert.equal(before.response.status, 200);
    assert.equal(before.json.legacy_import.imported, false);

    const first = await requestJson("/api/imports/legacy", { method: "POST" });
    assert.equal(first.response.status, 201);
    assert.equal(first.json.legacy_import.importedItems, 124);
    assert.equal(first.json.legacy_import.importedReports, 4);
    assert.equal(first.json.legacy_import.itemsCreated, 124);

    const second = await requestJson("/api/imports/legacy", { method: "POST" });
    assert.equal(second.response.status, 201);
    assert.equal(second.json.legacy_import.importedItems, 124);
    assert.equal(second.json.legacy_import.itemsCreated, 0);
    assert.equal(second.json.legacy_import.duplicatesSkipped, 124);
  });

  it("serves the interactive client report dataset", async () => {
    const { response, json } = await requestJson("/api/client-report/hidayathon");

    assert.equal(response.status, 200);
    assert.equal(json.report.summary.items, 124);
    assert.equal(json.report.reports.length, 4);
    assert.ok(json.report.filters.dates.length > 0);
    assert.ok(json.report.items[0].publishDateLabel);
  });

  it("serves the legacy link backfill dataset for missing original URLs", async () => {
    const { response, json } = await requestJson("/api/imports/legacy/backfill");

    assert.equal(response.status, 200);
    assert.equal(json.backfill.totalItems, 124);
    assert.equal(json.backfill.itemsWithExtractedOriginalUrl, 124);
    assert.equal(json.backfill.itemsWithOriginalUrl, 124);
    assert.equal(json.backfill.itemsMissingOriginalUrl, 0);
    assert.equal(json.backfill.itemsWithoutOpenableOriginalUrl, 0);
    assert.equal(json.backfill.invalidOriginalUrlItems, 0);
    assert.equal(json.backfill.overrideReadyItems, 0);
    assert.equal(
      json.backfill.items
        .filter((item: { backfillStatus: string }) => item.backfillStatus === "missing_url" || item.backfillStatus === "invalid_url")
        .every((item: { effectiveOriginalUrl: string | null }) => item.effectiveOriginalUrl === null),
      true,
    );
  });

  it("serves a Supabase upsert plan for the approved legacy archive", async () => {
    const { response, json } = await requestJson("/api/imports/legacy/supabase-plan");

    assert.equal(response.status, 200);
    assert.equal(json.supabase_import.summary.reports, 4);
    assert.equal(json.supabase_import.summary.monitoringItems, 124);
    assert.equal(json.supabase_import.summary.openableOriginalUrls, 124);
    assert.ok(
      json.supabase_import.batches.some(
        (batch: { table: string; rows: number; onConflict: string }) =>
          batch.table === "monitoring_items" && batch.rows === 124 && batch.onConflict === "id",
      ),
    );
  });

  it("keeps legacy Supabase upsert dry-run by default", async () => {
    const { response, json } = await requestJson("/api/imports/legacy/upsert-supabase", { method: "POST" });

    assert.equal(response.status, 200);
    assert.equal(json.supabase_import.ok, true);
    assert.equal(json.supabase_import.dryRun, true);
    assert.equal(json.supabase_import.summary.monitoringItems, 124);
  });

  it("blocks real legacy Supabase upsert without an admin import token", async () => {
    const { response, json } = await requestJson("/api/imports/legacy/upsert-supabase", {
      method: "POST",
      body: JSON.stringify({ dry_run: false }),
    });

    assert.equal(response.status, 403);
    assert.equal(json.error, "admin_import_token_required");
  });

  it("does not accept the real Supabase import token from the JSON body", async () => {
    const previousAdminToken = process.env.RASD_ADMIN_IMPORT_TOKEN;
    process.env.RASD_ADMIN_IMPORT_TOKEN = "body_token_must_not_authorize";

    try {
      const { response, json } = await requestJson("/api/imports/legacy/upsert-supabase", {
        method: "POST",
        body: JSON.stringify({ dry_run: false, admin_token: "body_token_must_not_authorize" }),
      });
      const serialized = JSON.stringify(json);

      assert.equal(response.status, 403);
      assert.equal(json.error, "admin_import_token_required");
      assert.equal(serialized.includes("body_token_must_not_authorize"), false);
    } finally {
      if (previousAdminToken === undefined) delete process.env.RASD_ADMIN_IMPORT_TOKEN;
      else process.env.RASD_ADMIN_IMPORT_TOKEN = previousAdminToken;
    }
  });
});
