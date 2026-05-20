import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export function isSupabasePublicConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function isSupabaseAdminConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getPersistenceMode() {
  return isSupabaseAdminConfigured() ? "supabase" : "memory";
}

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("supabase_admin_not_configured");
  }

  if (!adminClient) {
    adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return adminClient;
}

export async function checkSupabasePersistence() {
  const publicConfigured = isSupabasePublicConfigured();
  const serverConfigured = isSupabaseAdminConfigured();
  const projectRef = getProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);

  if (!isSupabaseAdminConfigured()) {
    return {
      mode: "memory" as const,
      ok: true,
      publicConfigured,
      serverConfigured,
      projectRef,
      message: publicConfigured
        ? "Supabase public settings are configured, but server credentials are missing; using local in-memory store for writes."
        : "Supabase settings are not configured; using local in-memory store.",
      missing: {
        serviceRoleKey: !process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    };
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("organizations").select("id", { count: "exact", head: true });

  if (error) {
    return {
      mode: "supabase" as const,
      ok: false,
      publicConfigured,
      serverConfigured,
      projectRef,
      message: error.message,
      missing: {
        serviceRoleKey: false,
      },
    };
  }

  return {
    mode: "supabase" as const,
    ok: true,
    publicConfigured,
    serverConfigured,
    projectRef,
    message: "Supabase schema is reachable from the server runtime.",
    missing: {
      serviceRoleKey: false,
    },
  };
}

function getProjectRefFromUrl(url: string | undefined) {
  if (!url) return null;

  try {
    const host = new URL(url).host;
    return host.endsWith(".supabase.co") ? host.replace(".supabase.co", "") : null;
  } catch {
    return null;
  }
}
