import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  return signOut(request);
}

export async function POST(request: Request) {
  return signOut(request);
}

async function signOut(request: Request) {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", new URL(request.url).origin));
}
