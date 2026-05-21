import type { User } from "@supabase/supabase-js";

import {
  DEFAULT_ORGANIZATION_ID,
  DEFAULT_ORGANIZATION_NAME,
  LEGACY_ORGANIZATION_ID,
  LEGACY_ORGANIZATION_NAME,
} from "@/lib/auth-config";
import { ensureHidayathonOrganizations } from "@/server/auth";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/server/supabase-admin";

export type ClientViewerSummary = {
  userId: string;
  email: string;
  displayName: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  organizations: Array<{
    id: string;
    name: string;
    role: "viewer";
  }>;
};

export type ViewerAccountInput = {
  email: string;
  password: string;
  displayName?: string;
};

type MembershipRow = {
  user_id: string;
  role: "viewer";
  organization_id: string;
  created_at: string | null;
};

export function validateViewerAccountInput(body: Record<string, unknown>) {
  const email = normalizeViewerEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : undefined;

  if (!email) return { ok: false as const, error: "email_required" };
  if (!isValidEmail(email)) return { ok: false as const, error: "email_invalid" };
  if (!password) return { ok: false as const, error: "password_required" };
  if (password.length < 8) return { ok: false as const, error: "password_too_short" };

  return {
    ok: true as const,
    value: {
      email,
      password,
      displayName: displayName || undefined,
    },
  };
}

export async function listClientViewerAccounts() {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false as const, error: "supabase_admin_not_configured" };
  }

  const supabase = getSupabaseAdmin();
  await ensureHidayathonOrganizations();

  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, organization_id, created_at")
    .in("organization_id", [DEFAULT_ORGANIZATION_ID, LEGACY_ORGANIZATION_ID])
    .eq("role", "viewer")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const memberships = (data ?? []) as MembershipRow[];
  const users = await listAllAuthUsers();
  const usersById = new Map(users.map((user) => [user.id, user]));
  const grouped = new Map<string, ClientViewerSummary>();

  for (const membership of memberships) {
    const user = usersById.get(membership.user_id);
    if (!user?.email) continue;

    const existing =
      grouped.get(membership.user_id) ??
      ({
        userId: membership.user_id,
        email: user.email.toLowerCase(),
        displayName: getUserDisplayName(user),
        createdAt: user.created_at ?? membership.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        organizations: [],
      } satisfies ClientViewerSummary);

    existing.organizations.push({
      id: membership.organization_id,
      name: organizationName(membership.organization_id),
      role: "viewer",
    });
    grouped.set(membership.user_id, existing);
  }

  return { ok: true as const, viewers: Array.from(grouped.values()) };
}

export async function createOrUpdateClientViewerAccount(input: ViewerAccountInput) {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false as const, error: "supabase_admin_not_configured" };
  }

  const supabase = getSupabaseAdmin();
  await ensureHidayathonOrganizations();

  const existingUser = await findAuthUserByEmail(input.email);
  if (existingUser) {
    const canManage = await canManageAsViewer(existingUser.id);
    if (!canManage.ok) return canManage;
  }

  const user = existingUser
    ? await updateViewerAuthUser(existingUser, input)
    : await createViewerAuthUser(input);

  const { error } = await supabase.from("memberships").upsert(
    [
      {
        organization_id: DEFAULT_ORGANIZATION_ID,
        user_id: user.id,
        role: "viewer",
      },
      {
        organization_id: LEGACY_ORGANIZATION_ID,
        user_id: user.id,
        role: "viewer",
      },
    ],
    { onConflict: "organization_id,user_id" },
  );

  if (error) throw error;

  return {
    ok: true as const,
    account: {
      userId: user.id,
      email: input.email,
      displayName: input.displayName ?? getUserDisplayName(user),
      targetPath: "/client-report",
      role: "viewer" as const,
    },
  };
}

async function canManageAsViewer(userId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .in("organization_id", [DEFAULT_ORGANIZATION_ID, LEGACY_ORGANIZATION_ID]);

  if (error) throw error;

  const hasAdminRole = (data ?? []).some((membership) => membership.role === "owner" || membership.role === "editor");
  if (hasAdminRole) {
    return { ok: false as const, error: "account_has_admin_role" };
  }

  return { ok: true as const };
}

async function createViewerAuthUser(input: ViewerAccountInput) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.displayName ?? "عميل رصد هداية هاكاثون",
    },
  });

  if (error) throw error;
  if (!data.user) throw new Error("viewer_user_create_failed");
  return data.user;
}

async function updateViewerAuthUser(user: User, input: ViewerAccountInput) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    password: input.password,
    user_metadata: {
      ...user.user_metadata,
      full_name: input.displayName ?? getUserDisplayName(user) ?? "عميل رصد هداية هاكاثون",
    },
  });

  if (error) throw error;
  if (!data.user) throw new Error("viewer_user_update_failed");
  return data.user;
}

async function findAuthUserByEmail(email: string) {
  const users = await listAllAuthUsers();
  return users.find((user) => user.email?.toLowerCase() === email) ?? null;
}

async function listAllAuthUsers() {
  const supabase = getSupabaseAdmin();
  const users: User[] = [];
  const perPage = 1000;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    users.push(...data.users);
    if (data.users.length < perPage) break;
  }

  return users;
}

function normalizeViewerEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getUserDisplayName(user: User) {
  const value = user.user_metadata?.full_name ?? user.user_metadata?.name;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function organizationName(id: string) {
  if (id === DEFAULT_ORGANIZATION_ID) return DEFAULT_ORGANIZATION_NAME;
  if (id === LEGACY_ORGANIZATION_ID) return LEGACY_ORGANIZATION_NAME;
  return id;
}
