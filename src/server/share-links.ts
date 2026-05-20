import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/server/supabase-admin";
import { store } from "@/server/store";

type ShareLinkInput = {
  maxViews?: number;
  expiresInDays?: number;
};

type DbShareLinkRow = {
  id: string;
  report_id: string;
  token_hash: string;
  expires_at: string | null;
  revoked_at: string | null;
  max_views: number | null;
  view_count: number;
  noindex: boolean;
  watermark: boolean;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeDbLink(row: DbShareLinkRow) {
  return {
    id: row.id,
    reportId: row.report_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    maxViews: row.max_views ?? undefined,
    viewCount: row.view_count,
    noindex: row.noindex,
    watermark: row.watermark,
  };
}

function shouldUseSupabase(reportId?: string) {
  return isSupabaseAdminConfigured() && (!reportId || isUuid(reportId));
}

export async function createReportShareLink(reportId: string, input?: ShareLinkInput) {
  if (!shouldUseSupabase(reportId)) {
    return store.createShareLink(reportId, input);
  }

  const supabase = getSupabaseAdmin();
  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, organization_id")
    .eq("id", reportId)
    .maybeSingle();

  if (reportError) return { ok: false as const, error: reportError.message };
  if (!report) return { ok: false as const, error: "report_not_found" };

  const reportRow = report as { id: string; organization_id: string };
  const token = crypto.randomUUID().replaceAll("-", "");
  const tokenHash = `sha256:${await sha256(token)}`;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * (input?.expiresInDays ?? 14)).toISOString();

  const { data: link, error } = await supabase
    .from("share_links")
    .insert({
      organization_id: reportRow.organization_id,
      report_id: reportRow.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      max_views: input?.maxViews ?? null,
      noindex: true,
      watermark: true,
    })
    .select("id, report_id, token_hash, expires_at, revoked_at, max_views, view_count, noindex, watermark")
    .single();

  if (error) return { ok: false as const, error: error.message };

  return {
    ok: true as const,
    link: normalizeDbLink(link as DbShareLinkRow),
    token,
  };
}

export async function resolveReportShareLink(token: string) {
  if (!isSupabaseAdminConfigured()) {
    return store.resolveShareLink(token);
  }

  const supabase = getSupabaseAdmin();
  const tokenHash = `sha256:${await sha256(token)}`;
  const { data: link, error } = await supabase
    .from("share_links")
    .select("id, report_id, token_hash, expires_at, revoked_at, max_views, view_count, noindex, watermark")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!link) return store.resolveShareLink(token);

  const linkRow = link as DbShareLinkRow;
  if (linkRow.revoked_at) return { ok: false as const, error: "share_link_revoked" };
  if (linkRow.expires_at && new Date(linkRow.expires_at).getTime() <= Date.now()) {
    return { ok: false as const, error: "share_link_expired" };
  }
  if (typeof linkRow.max_views === "number" && linkRow.view_count >= linkRow.max_views) {
    return { ok: false as const, error: "share_link_view_limit_reached" };
  }

  const nextViewCount = linkRow.view_count + 1;
  const { error: updateError } = await supabase
    .from("share_links")
    .update({ view_count: nextViewCount, last_viewed_at: new Date().toISOString() })
    .eq("id", linkRow.id);

  if (updateError) return { ok: false as const, error: updateError.message };

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, title, status, version, period_start, period_end, published_at")
    .eq("id", linkRow.report_id)
    .maybeSingle();

  if (reportError) return { ok: false as const, error: reportError.message };
  if (!report) return { ok: false as const, error: "report_not_found" };

  return {
    ok: true as const,
    link: normalizeDbLink({ ...linkRow, view_count: nextViewCount }),
    report,
  };
}

export async function revokeReportShareLink(token: string) {
  if (!isSupabaseAdminConfigured()) {
    return store.revokeShareLink(token);
  }

  const supabase = getSupabaseAdmin();
  const tokenHash = `sha256:${await sha256(token)}`;
  const { data: link, error } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .select("id, report_id, token_hash, expires_at, revoked_at, max_views, view_count, noindex, watermark")
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!link) return store.revokeShareLink(token);

  return {
    ok: true as const,
    link: normalizeDbLink(link as DbShareLinkRow),
  };
}
