import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const providerError = requestUrl.searchParams.get("error_code") ?? requestUrl.searchParams.get("error");
  const next = safeNextPath(requestUrl.searchParams.get("next"));

  if (providerError) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(providerError)}&next=${encodeURIComponent(next)}`, requestUrl.origin));
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(`/auth/redirect?next=${encodeURIComponent(next)}`, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL(`/login?error=auth_callback_failed&next=${encodeURIComponent(next)}`, requestUrl.origin));
}

function safeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}
