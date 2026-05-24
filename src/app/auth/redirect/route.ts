import { NextResponse } from "next/server";

import {
  defaultPathForRole,
  isAdminPath,
  isAdminRole,
  isAuthPath,
  isClientPath,
} from "@/lib/auth-config";
import { getCurrentAuthContext } from "@/server/auth";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = safeNextPath(requestUrl.searchParams.get("next"));
  const context = await getCurrentAuthContext();

  if (!context) {
    if (isClientPath(next) || isAdminPath(next)) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }

    return NextResponse.redirect(new URL("/login", requestUrl.origin));
  }

  if (isAuthPath(next)) {
    return NextResponse.redirect(new URL(defaultPathForRole(context.membership.role), requestUrl.origin));
  }

  if (next === "/" && !isAdminRole(context.membership.role)) {
    return NextResponse.redirect(new URL(defaultPathForRole(context.membership.role), requestUrl.origin));
  }

  if (isAdminPath(next) && !isAdminRole(context.membership.role)) {
    return NextResponse.redirect(new URL(defaultPathForRole(context.membership.role), requestUrl.origin));
  }

  if (isClientPath(next) || isAdminPath(next)) {
    return NextResponse.redirect(new URL(next, requestUrl.origin));
  }

  return NextResponse.redirect(new URL(defaultPathForRole(context.membership.role), requestUrl.origin));
}

function safeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}
