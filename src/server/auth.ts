import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import {
  DEFAULT_ORGANIZATION_ID,
  DEFAULT_ORGANIZATION_NAME,
  DEFAULT_ORGANIZATION_SLUG,
  LEGACY_ORGANIZATION_ID,
  LEGACY_ORGANIZATION_NAME,
  LEGACY_ORGANIZATION_SLUG,
  RASD_OWNER_EMAIL,
  defaultPathForRole,
  isRoleAllowed,
} from "@/lib/auth-config";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Role } from "@/lib/types";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/server/supabase-admin";

export type AuthMembership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: Role;
};

export type AuthContext = {
  user: User;
  membership: AuthMembership;
};

type MembershipRow = {
  organization_id: string;
  role: Role;
  organizations?:
    | {
        name: string | null;
        slug: string | null;
      }
    | Array<{
        name: string | null;
        slug: string | null;
      }>
    | null;
};

export async function getCurrentAuthContext(): Promise<AuthContext | null> {
  const user = await getCurrentSupabaseUser();
  if (!user) return null;

  const membership = await resolveMembershipForUser(user);
  return membership ? { user, membership } : null;
}

export async function getCurrentSupabaseUser(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

export async function requireRole(allowed: readonly Role[], nextPath = "/") {
  const context = await getCurrentAuthContext();

  if (!context) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (!isRoleAllowed(context.membership.role, allowed)) {
    redirect("/unauthorized");
  }

  return context;
}

export async function redirectAuthenticatedUser() {
  const user = await getCurrentSupabaseUser();
  if (!user) return;

  const membership = await resolveMembershipForUser(user);
  if (membership) redirect(defaultPathForRole(membership.role));

  redirect("/unauthorized");
}

async function resolveMembershipForUser(user: User): Promise<AuthMembership | null> {
  const email = user.email?.toLowerCase();

  if (isSupabaseAdminConfigured()) {
    const supabase = getSupabaseAdmin();
    await ensureHidayathonOrganizations();

    if (email === RASD_OWNER_EMAIL) {
      await ensureOwnerMembership(user.id);
      return defaultMembership("owner");
    }

    const { data, error } = await supabase
      .from("memberships")
      .select("organization_id, role, organizations(name, slug)")
      .eq("user_id", user.id);

    if (error) throw error;
    return membershipFromRows((data ?? []) as unknown as MembershipRow[]);
  }

  if (email === RASD_OWNER_EMAIL) {
    return defaultMembership("owner");
  }

  return null;
}

export async function ensureHidayathonOrganizations() {
  if (!isSupabaseAdminConfigured()) return;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("organizations").upsert(
    [
      {
        id: DEFAULT_ORGANIZATION_ID,
        name: DEFAULT_ORGANIZATION_NAME,
        slug: DEFAULT_ORGANIZATION_SLUG,
      },
      {
        id: LEGACY_ORGANIZATION_ID,
        name: LEGACY_ORGANIZATION_NAME,
        slug: LEGACY_ORGANIZATION_SLUG,
      },
    ],
    { onConflict: "id" },
  );

  if (error) throw error;
}

async function ensureOwnerMembership(userId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("memberships").upsert(
    [
      {
        organization_id: DEFAULT_ORGANIZATION_ID,
        user_id: userId,
        role: "owner",
      },
      {
        organization_id: LEGACY_ORGANIZATION_ID,
        user_id: userId,
        role: "owner",
      },
    ],
    { onConflict: "organization_id,user_id" },
  );

  if (error) throw error;
}

function membershipFromRows(rows: MembershipRow[]) {
  const selected =
    rows.find((row) => row.organization_id === DEFAULT_ORGANIZATION_ID) ??
    rows.find((row) => row.organization_id === LEGACY_ORGANIZATION_ID) ??
    rows[0];

  if (!selected) return null;

  const organization = Array.isArray(selected.organizations)
    ? selected.organizations[0]
    : selected.organizations;

  return {
    organizationId: selected.organization_id,
    organizationName: organization?.name ?? DEFAULT_ORGANIZATION_NAME,
    organizationSlug: organization?.slug ?? DEFAULT_ORGANIZATION_SLUG,
    role: selected.role,
  };
}

function defaultMembership(role: Role): AuthMembership {
  return {
    organizationId: DEFAULT_ORGANIZATION_ID,
    organizationName: DEFAULT_ORGANIZATION_NAME,
    organizationSlug: DEFAULT_ORGANIZATION_SLUG,
    role,
  };
}
