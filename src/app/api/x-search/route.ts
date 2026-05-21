import { NextResponse } from "next/server";
import { XSearchManager } from "@/lib/x/search-manager";
import { keywordRules } from "@/lib/mock-data";
import { canonicalizeXUrl } from "@/lib/x/parser";
import type { XSearchRunResult } from "@/lib/x/types";

/**
 * GET /api/x-search — Check search engine health and last run status.
 * POST /api/x-search — Trigger a manual search for tweets about Hidayathon.
 *
 * Used by the admin dashboard for on-demand discovery and provider status monitoring.
 */

let lastRunResult: XSearchRunResult | null = null;

function getSearchManager(): XSearchManager {
  return new XSearchManager({
    X_SEARCH_PROVIDER_TYPE: process.env.X_SEARCH_PROVIDER_TYPE,
    XAI_API_KEY: process.env.XAI_API_KEY,
  });
}

export async function GET() {
  try {
    const manager = getSearchManager();
    const health = await manager.checkHealth();

    return NextResponse.json({
      ok: true,
      provider: manager.getActiveProviderName(),
      health,
      lastRun: lastRunResult,
    });
  } catch (err) {
    console.error("[x-search GET] Error:", err);
    return NextResponse.json({ ok: false, error: "health_check_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      existingUrls?: string[];
    };

    const manager = getSearchManager();

    // Get keyword rule (use first active rule)
    const rule = keywordRules[0];
    if (!rule) {
      return NextResponse.json(
        { ok: false, error: "no_keyword_rules_configured" },
        { status: 400 },
      );
    }

    // Build set of existing URLs for dedup (client can pass these, or we start fresh)
    const existingUrls = new Set(
      (body.existingUrls ?? []).map((url: string) => canonicalizeXUrl(url)),
    );

    const { results, runResult } = await manager.executeSearch({
      requiredTerms: rule.requiredTerms,
      optionalTerms: rule.optionalTerms,
      languages: rule.language === "mixed" ? ["ar", "en"] : [rule.language],
      existingUrls,
      options: {
        fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        maxResults: 30,
      },
    });

    // Cache last run result for GET
    lastRunResult = runResult;

    return NextResponse.json({
      ok: true,
      results,
      runResult,
    });
  } catch (err) {
    console.error("[x-search POST] Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "search_failed" },
      { status: 500 },
    );
  }
}
