import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

async function schemaSql() {
  return readFile(join(process.cwd(), "supabase", "schema.sql"), "utf8");
}

async function migrationSql(file: string) {
  return readFile(join(process.cwd(), "supabase", "migrations", file), "utf8");
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

  it("keeps sources ready for controlled RSS polling", async () => {
    const sql = await schemaSql();
    const sources = tableBlock(sql, "sources");

    assert.match(sources, /feed_url text/);
    assert.match(sources, /is_active boolean not null default true/);
    assert.match(sources, /last_checked_at timestamptz/);
    assert.match(sources, /last_success_at timestamptz/);
    assert.match(sources, /last_error text/);
    assert.match(sources, /poll_interval_minutes integer not null default 1440/);
    assert.match(sources, /poll_interval_minutes between 15 and 10080/);
    assert.match(sql, /create index on public\.sources \(organization_id, is_active, type\)/);
  });

  it("ships the live source polling migration idempotently", async () => {
    const migrationsDir = join(process.cwd(), "supabase", "migrations");
    const migrations = await readdir(migrationsDir);
    const sourcePollingMigration = migrations.find((file) => file.endsWith("_add_source_polling_fields.sql"));

    assert.ok(sourcePollingMigration);
    const sql = await migrationSql(sourcePollingMigration);
    assert.match(sql, /add column if not exists feed_url text/);
    assert.match(sql, /add column if not exists is_active boolean not null default true/);
    assert.match(sql, /add column if not exists poll_interval_minutes integer not null default 1440/);
    assert.match(sql, /create index if not exists sources_organization_active_type_idx/);
  });

  it("ships TikTok and Instagram connector enum additions as a new production migration", async () => {
    const migrationsDir = join(process.cwd(), "supabase", "migrations");
    const migrations = await readdir(migrationsDir);
    const connectorEnumMigration = migrations.find((file) => file.endsWith("_add_tiktok_instagram_connector_enums.sql"));

    assert.ok(connectorEnumMigration);
    assert.notEqual(connectorEnumMigration, "20260520134546_initial_rasd_schema.sql");

    const sql = await migrationSql(connectorEnumMigration);
    assert.match(sql, /alter type public\.source_type add value if not exists 'tiktok_research'/);
    assert.match(sql, /alter type public\.source_type add value if not exists 'instagram_public_profile'/);
    assert.match(sql, /alter type public\.usage_event_type add value if not exists 'tiktok_read'/);
    assert.match(sql, /alter type public\.usage_event_type add value if not exists 'instagram_read'/);
    assert.match(sql, /alter type public\.usage_event_type add value if not exists 'media_hydration'/);
  });

  it("stores source-rule polling intervals in schema and migration", async () => {
    const sql = await schemaSql();
    const sourceRules = tableBlock(sql, "source_rules");
    assert.match(sourceRules, /poll_interval_minutes integer not null default 1440/);
    assert.match(sourceRules, /poll_interval_minutes between 15 and 10080/);

    const migrationsDir = join(process.cwd(), "supabase", "migrations");
    const migrations = await readdir(migrationsDir);
    const intervalMigration = migrations.find((file) => file.endsWith("_add_source_rule_poll_interval.sql"));
    assert.ok(intervalMigration);

    const migration = await migrationSql(intervalMigration);
    assert.match(migration, /alter table public\.source_rules/);
    assert.match(migration, /add column if not exists poll_interval_minutes integer not null default 1440/);
    assert.match(migration, /source_rules_poll_interval_minutes_check/);
  });

  it("registers a protected Vercel cron route for connector scheduling without removing RSS polling", async () => {
    const config = JSON.parse(await readFile(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };

    assert.ok(config.crons.some((cron) => cron.path === "/api/cron/poll-sources" && cron.schedule === "0 5 * * *"));
    assert.ok(config.crons.some((cron) => cron.path === "/api/cron/run-connectors" && cron.schedule === "15 5 * * *"));
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

  it("limits share-link management to owners and editors in RLS policy", async () => {
    const sql = await schemaSql();

    assert.match(sql, /create policy "owners and editors can manage share links"/);
    assert.match(sql, /m\.role in \('owner', 'editor'\)/);
  });

  it("keeps the live share-link RLS correction migration idempotent", async () => {
    const sql = await migrationSql("20260521094823_allow_editor_share_links.sql");

    assert.match(sql, /drop policy if exists "owners can manage share links"/);
    assert.match(sql, /drop policy if exists "owners and editors can manage share links"/);
    assert.match(sql, /create policy "owners and editors can manage share links"/);
    assert.match(sql, /m\.role in \('owner', 'editor'\)/);
  });

  it("keeps production Priority A verification pointed at the canonical legacy organization", async () => {
    const verifySql = await readFile(join(process.cwd(), "scripts", "verify_priority_a.sql"), "utf8");

    assert.match(verifySql, /slug = 'legacy-hidayathon'/);
    assert.doesNotMatch(verifySql, /hidayathon-legacy/);
  });
});
