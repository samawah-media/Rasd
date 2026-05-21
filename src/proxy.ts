import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  DEFAULT_ORGANIZATION_ID,
  RASD_OWNER_EMAIL,
  defaultPathForRole,
  isAdminPath,
  isAdminRole,
  isAuthPath,
  isClientPath,
  isProtectedAppPath,
} from "@/lib/auth-config";
import type { Role } from "@/lib/types";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (isAuthPath(pathname)) {
    return supabaseResponse;
  }

  if (!isProtectedAppPath(pathname)) {
    return supabaseResponse;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isClientPath(pathname)) {
    return supabaseResponse;
  }

  const role = await resolveProxyRole(user.id, user.email?.toLowerCase() ?? null, supabase);

  if (!role) {
    const url = request.nextUrl.clone();
    url.pathname = "/unauthorized";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isAdminPath(pathname) && !isAdminRole(role)) {
    const url = request.nextUrl.clone();
    url.pathname = "/unauthorized";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = defaultPathForRole(role);
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

async function resolveProxyRole(
  userId: string,
  email: string | null,
  supabase: ReturnType<typeof createServerClient>,
): Promise<Role | null> {
  if (email === RASD_OWNER_EMAIL) return "owner";

  const { data, error } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", userId);

  if (error) return null;

  const memberships = (data ?? []) as Array<{ organization_id: string; role: Role }>;
  return (
    memberships.find((membership) => membership.organization_id === DEFAULT_ORGANIZATION_ID)?.role ??
    memberships[0]?.role ??
    null
  );
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
