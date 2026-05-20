import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

async function schemaSql() {
  return readFile(join(process.cwd(), "supabase", "schema.sql"), "utf8");
}

function tableNames(sql: string) {
  return [...sql.matchAll(/create table public\.([a-z_]+)\s*\(/g)].map((match) => match[1]);
}

function tableBlock(sql: string, table: string) {
  const match = sql.match(new RegExp(`create table public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`));
  return match?.[1] ?? "";
}

describe("Supabase SaaS schema safety", () => {
  it("keeps the initial Supabase migration aligned with the reviewed schema", async () => {
    const migrationsDir = join(process.cwd(), "supabase", "migrations");
    const migrations = await readdir(migrationsDir);
    const initialMigration = migrations.find((file) => file.endsWith("_initial_rasd_schema.sql"));

    assert.ok(initialMigration);
    assert.equal(
      await readFile(join(migrationsDir, initialMigration), "utf8"),
      await schemaSql(),
    );
  });

  it("enables RLS on every public table", async () => {
    const sql = await schemaSql();
    const missing = tableNames(sql).filter(
      (table) => !sql.includes(`alter table public.${table} enable row level security;`),
    );

    assert.deepEqual(missing, []);
  });

  it("keeps tenant ownership on every SaaS table except organizations", async () => {
    const sql = await schemaSql();
    const missingOrganizationId = tableNames(sql).filter((table) => {
      if (table === "organizations") return false;
      return !tableBlock(sql, table).includes("organization_id uuid");
    });

    assert.deepEqual(missingOrganizationId, []);
  });

  it("protects BYOK credentials with encrypted and masked fields", async () => {
    const apiCredentials = tableBlock(await schemaSql(), "api_credentials");

    assert.match(apiCredentials, /encrypted_secret text not null/);
    assert.match(apiCredentials, /masked_secret text not null/);
    assert.match(apiCredentials, /rotated_at timestamptz/);
  });

  it("models share-link expiry, revocation, optional password, and view limits", async () => {
    const shareLinks = tableBlock(await schemaSql(), "share_links");

    assert.match(shareLinks, /token_hash text not null unique/);
    assert.match(shareLinks, /expires_at timestamptz/);
    assert.match(shareLinks, /revoked_at timestamptz/);
    assert.match(shareLinks, /password_hash text/);
    assert.match(shareLinks, /max_views integer/);
    assert.match(shareLinks, /view_count integer not null default 0/);
    assert.match(shareLinks, /last_viewed_at timestamptz/);
  });

  it("keeps monitoring item dedupe scoped by organization", async () => {
    const sql = await schemaSql();

    assert.match(sql, /unique \(organization_id, source_type, source_item_id\)/);
    assert.match(sql, /unique \(organization_id, canonical_url_hash\)/);
    assert.match(sql, /unique \(organization_id, external_id\)/);
  });

  it("tracks legacy source URL quality separately from the stored evidence URL", async () => {
    const monitoringItems = tableBlock(await schemaSql(), "monitoring_items");

    assert.match(monitoringItems, /external_id text/);
    assert.match(monitoringItems, /original_url_extracted text/);
    assert.match(monitoringItems, /original_url_status text not null default 'openable'/);
    assert.match(monitoringItems, /'openable', 'missing', 'invalid', 'legacy_evidence'/);
    assert.match(monitoringItems, /original_url_source text/);
    assert.match(monitoringItems, /evidence_image_path text/);
  });

  it("stores legacy link overrides as tenant-scoped reviewed data", async () => {
    const sql = await schemaSql();
    const overrides = tableBlock(sql, "legacy_link_overrides");

    assert.match(overrides, /external_id text not null/);
    assert.match(overrides, /original_url text not null/);
    assert.match(overrides, /status text not null default 'needs_review'/);
    assert.match(overrides, /'verified', 'needs_review'/);
    assert.match(overrides, /unique \(organization_id, external_id\)/);
    assert.match(sql, /create policy "editors can manage legacy link overrides"/);
  });

  it("limits share-link management to owners in RLS policy", async () => {
    const sql = await schemaSql();

    assert.match(sql, /create policy "owners can manage share links"/);
    assert.match(sql, /m\.role = 'owner'/);
  });
});
