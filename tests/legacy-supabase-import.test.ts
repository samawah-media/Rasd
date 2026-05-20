import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEGACY_ORGANIZATION_NAME, LEGACY_ORGANIZATION_SLUG } from "../src/lib/auth-config";
import { buildLegacySupabaseUpsertPlan, upsertLegacyReportsToSupabase } from "../src/server/legacy-supabase-import";

async function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T>) {
  const previous = new Map<string, string | undefined>();

  for (const [name, value] of Object.entries(values)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  try {
    return await run();
  } finally {
    for (const [name, value] of previous.entries()) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

describe("legacy Supabase import plan", () => {
  it("builds an idempotent Supabase upsert plan for the approved legacy reports", () => {
    const plan = buildLegacySupabaseUpsertPlan();

    assert.equal(plan.summary.reports, 4);
    assert.equal(plan.summary.monitoringItems, 124);
    assert.equal(plan.summary.reportItems, 124);
    assert.equal(plan.summary.captures, 124);
    assert.equal(plan.summary.openableOriginalUrls, 124);
    assert.equal(plan.summary.missingOriginalUrls, 0);
    assert.equal(plan.summary.invalidOriginalUrls, 0);
    assert.equal(plan.summary.legacyLinkOverrides, 3);
    const organizationRow = plan.batches.find((batch) => batch.table === "organizations")?.rows[0];
    assert.equal(organizationRow?.name, LEGACY_ORGANIZATION_NAME);
    assert.equal(organizationRow?.slug, LEGACY_ORGANIZATION_SLUG);
    assert.equal(
      plan.batches.every((batch) =>
        batch.table === "legacy_link_overrides" ? batch.onConflict === "organization_id,external_id" : batch.onConflict === "id",
      ),
      true,
    );
  });

  it("orders batches by foreign-key dependencies and keeps every tenant row scoped", () => {
    const plan = buildLegacySupabaseUpsertPlan();

    assert.deepEqual(
      plan.batches.map((batch) => batch.table),
      [
        "organizations",
        "plans",
        "topics",
        "sources",
        "usage_limits",
        "report_templates",
        "reports",
        "monitoring_items",
        "legacy_link_overrides",
        "captures",
        "report_items",
      ],
    );

    for (const batch of plan.batches.filter((entry) => entry.table !== "organizations")) {
      assert.equal(
        batch.rows.every((row) => row.organization_id === plan.organizationId),
        true,
        `${batch.table} rows must remain tenant-scoped`,
      );
    }
  });

  it("prefers interactive PDF annotation links over printed text and stale overrides", () => {
    const plan = buildLegacySupabaseUpsertPlan();
    const monitoringRows = plan.batches.find((batch) => batch.table === "monitoring_items")?.rows ?? [];
    const overrideRows = plan.batches.find((batch) => batch.table === "legacy_link_overrides")?.rows ?? [];
    const invalidRows = monitoringRows.filter((row) => row.original_url_status === "invalid");
    const importedOverrideRows = monitoringRows.filter((row) => row.original_url_source === "override");
    const missingRows = monitoringRows.filter((row) => row.original_url_status === "missing");
    const xRows = monitoringRows.filter((row) => row.source_type === "x_oembed");

    assert.equal(invalidRows.length, 0);
    assert.equal(overrideRows.every((row) => row.original_url === "https://hedayathon.com"), true);
    assert.equal(overrideRows.length, 3);
    assert.equal(importedOverrideRows.length, 0);
    assert.equal(missingRows.length, 0);
    assert.equal(monitoringRows.every((row) => row.original_url_status === "openable"), true);
    assert.equal(xRows.length, 70);
    assert.equal(xRows.every((row) => String(row.original_url).includes("/status/")), true);
    assert.equal(overrideRows.every((row) => row.status === "verified"), true);
    assert.equal(monitoringRows.every((row) => String(row.canonical_url_hash).length === 32), true);
    assert.equal(monitoringRows.every((row) => String(row.normalized_text_hash).length === 32), true);
  });

  it("does not include Supabase secrets or connection strings in the public upsert plan", async () => {
    await withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://ewunxfttbpqisspqthiz.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_plan_leak_test",
        SUPABASE_SERVICE_ROLE_KEY: "service_role_plan_leak_test",
        SUPABASE_DB_URL: "postgresql://postgres:plan_leak_test@example.supabase.co:5432/postgres",
        RASD_ADMIN_IMPORT_TOKEN: "admin_plan_leak_test",
      },
      async () => {
        const serialized = JSON.stringify(buildLegacySupabaseUpsertPlan());

        assert.equal(serialized.includes("sb_publishable_plan_leak_test"), false);
        assert.equal(serialized.includes("service_role_plan_leak_test"), false);
        assert.equal(serialized.includes("plan_leak_test"), false);
        assert.equal(serialized.includes("admin_plan_leak_test"), false);
        assert.equal(serialized.includes("postgresql://"), false);
      },
    );
  });

  it("returns a dry-run result without requiring Supabase credentials", async () => {
    const result = await upsertLegacyReportsToSupabase();

    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.match(result.mode, /^(memory|supabase)$/);
    assert.equal(result.summary.monitoringItems, 124);
    assert.ok(result.batches.some((batch) => batch.table === "monitoring_items" && batch.rows === 124));
  });

  it("defaults to dry-run even when Supabase server credentials are present", async () => {
    await withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://ewunxfttbpqisspqthiz.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service_role_must_not_be_used_by_default",
      },
      async () => {
        const result = await upsertLegacyReportsToSupabase();
        const serialized = JSON.stringify(result);

        assert.equal(result.ok, true);
        assert.equal(result.mode, "supabase");
        assert.equal(result.dryRun, true);
        assert.equal(serialized.includes("service_role_must_not_be_used_by_default"), false);
      },
    );
  });

  it("falls back to the dry-run plan if a real upsert is requested without server credentials", async () => {
    await withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: undefined,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
      },
      async () => {
        const result = await upsertLegacyReportsToSupabase({ dryRun: false });

        assert.equal(result.ok, true);
        assert.equal(result.mode, "memory");
        assert.equal(result.dryRun, true);
        assert.equal(result.summary.monitoringItems, 124);
      },
    );
  });
});
