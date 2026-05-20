import {
  getLegacyLinkOverrides,
  isOpenableHttpUrl,
  type LegacyLinkOverride,
  type LinkOverridesFile,
} from "@/lib/legacy-link-overrides";
import {
  LEGACY_ORGANIZATION_ID,
  LEGACY_ORGANIZATION_NAME,
  LEGACY_ORGANIZATION_SLUG,
} from "@/lib/auth-config";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/server/supabase-admin";

type LegacyLinkOverrideRow = {
  external_id: string;
  original_url: string;
  status: "verified" | "needs_review";
  note: string | null;
  verified_at: string | null;
  verified_by: string | null;
};

type UpsertLegacyLinkOverrideInput = {
  itemId: string;
  originalUrl: string;
  status?: LegacyLinkOverride["status"];
  note?: string;
  verifiedBy?: string;
};

export async function getMergedLegacyLinkOverrides(): Promise<LinkOverridesFile> {
  const fileOverrides = getLegacyLinkOverrides();
  const dbOverrides = await listLegacyLinkOverridesFromSupabase();

  if (!dbOverrides) return fileOverrides;

  return {
    version: fileOverrides.version,
    updated_at: dbOverrides.updatedAt ?? fileOverrides.updated_at,
    items: {
      ...fileOverrides.items,
      ...dbOverrides.items,
    },
  };
}

export async function upsertLegacyLinkOverride(input: UpsertLegacyLinkOverrideInput) {
  const originalUrl = input.originalUrl.trim();
  const status = input.status === "needs_review" ? "needs_review" : "verified";

  if (!input.itemId.trim()) {
    return { ok: false as const, error: "item_id_required" };
  }

  if (!isOpenableHttpUrl(originalUrl)) {
    return { ok: false as const, error: "openable_http_url_required" };
  }

  const override: LegacyLinkOverride = {
    originalUrl,
    status,
    note: input.note?.trim() || undefined,
    verifiedAt: new Date().toISOString(),
    verifiedBy: input.verifiedBy?.trim() || "admin",
  };

  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false as const,
      error: "supabase_not_configured",
      override,
    };
  }

  const supabase = getSupabaseAdmin();
  await ensureLegacyOrganization();

  const { data, error } = await supabase
    .from("legacy_link_overrides")
    .upsert(
      {
        organization_id: LEGACY_ORGANIZATION_ID,
        external_id: input.itemId,
        original_url: originalUrl,
        status,
        note: override.note ?? null,
        verified_at: override.verifiedAt,
        verified_by: override.verifiedBy,
        updated_at: override.verifiedAt,
      },
      {
        onConflict: "organization_id,external_id",
        ignoreDuplicates: false,
      },
    )
    .select("external_id, original_url, status, note, verified_at, verified_by")
    .single();

  if (error) {
    throw new Error(`legacy_link_override_upsert_failed:${error.message}`);
  }

  await applyLegacyLinkOverrideToImportedRows(input.itemId, originalUrl);

  return {
    ok: true as const,
    persisted: true,
    override: rowToOverride(data as LegacyLinkOverrideRow),
  };
}

async function listLegacyLinkOverridesFromSupabase() {
  if (!isSupabaseAdminConfigured()) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("legacy_link_overrides")
    .select("external_id, original_url, status, note, verified_at, verified_by")
    .eq("organization_id", LEGACY_ORGANIZATION_ID);

  if (error) {
    return null;
  }

  const rows = (data ?? []) as LegacyLinkOverrideRow[];
  const items = Object.fromEntries(rows.map((row) => [row.external_id, rowToOverride(row)]));
  const updatedAt = rows
    .map((row) => row.verified_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return { items, updatedAt };
}

async function ensureLegacyOrganization() {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("organizations").upsert(
    {
      id: LEGACY_ORGANIZATION_ID,
      name: LEGACY_ORGANIZATION_NAME,
      slug: LEGACY_ORGANIZATION_SLUG,
    },
    { onConflict: "id", ignoreDuplicates: false },
  );

  if (error) {
    throw new Error(`legacy_organization_upsert_failed:${error.message}`);
  }
}

async function applyLegacyLinkOverrideToImportedRows(externalId: string, originalUrl: string) {
  const supabase = getSupabaseAdmin();
  const canonicalUrlHash = stableFingerprint(`${originalUrl}:${externalId}`);

  const { data: items, error: itemSelectError } = await supabase
    .from("monitoring_items")
    .select("id")
    .eq("organization_id", LEGACY_ORGANIZATION_ID)
    .eq("external_id", externalId);

  if (itemSelectError) {
    throw new Error(`legacy_item_lookup_failed:${itemSelectError.message}`);
  }

  const itemIds = ((items ?? []) as Array<{ id: string }>).map((item) => item.id);
  if (!itemIds.length) return;

  const { error: itemUpdateError } = await supabase
    .from("monitoring_items")
    .update({
      original_url: originalUrl,
      original_url_status: "openable",
      original_url_source: "override",
      canonical_url_hash: canonicalUrlHash,
    })
    .eq("organization_id", LEGACY_ORGANIZATION_ID)
    .eq("external_id", externalId);

  if (itemUpdateError) {
    throw new Error(`legacy_item_override_apply_failed:${itemUpdateError.message}`);
  }

  const { data: reportItems, error: reportSelectError } = await supabase
    .from("report_items")
    .select("id, card_data")
    .eq("organization_id", LEGACY_ORGANIZATION_ID)
    .in("monitoring_item_id", itemIds);

  if (reportSelectError) {
    throw new Error(`legacy_report_item_lookup_failed:${reportSelectError.message}`);
  }

  for (const reportItem of (reportItems ?? []) as Array<{ id: string; card_data: Record<string, unknown> | null }>) {
    const { error } = await supabase
      .from("report_items")
      .update({
        card_data: {
          ...(reportItem.card_data ?? {}),
          original_url: originalUrl,
        },
      })
      .eq("id", reportItem.id);

    if (error) {
      throw new Error(`legacy_report_item_override_apply_failed:${error.message}`);
    }
  }
}

function rowToOverride(row: LegacyLinkOverrideRow): LegacyLinkOverride {
  return {
    originalUrl: row.original_url,
    status: row.status,
    note: row.note ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    verifiedBy: row.verified_by ?? undefined,
  };
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
