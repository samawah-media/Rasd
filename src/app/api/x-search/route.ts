import { NextResponse } from "next/server";
import { XSearchManager } from "@/lib/x/search-manager";
import { keywordRules } from "@/lib/mock-data";
import { canonicalizeXUrl } from "@/lib/x/parser";
import type { MonitoringItem } from "@/lib/types";
import type { XSearchRunResult } from "@/lib/x/types";
import { authorizeApiRequest } from "@/server/api-auth";
import { persistentStore } from "@/server/persistent-store";

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

export async function GET(request: Request) {
  const blocked = await authorizeApiRequest(request);
  if (blocked) return blocked;

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
  const blocked = await authorizeApiRequest(request);
  if (blocked) return blocked;

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

    const storedItems = await persistentStore.listItems();
    const storedXUrls = storedItems
      .filter((item) => item.sourceType.startsWith("x_") || item.originalUrl.includes("x.com") || item.originalUrl.includes("twitter.com"))
      .map((item) => item.originalUrl);

    // Build set of existing URLs for dedup from both client state and persisted storage.
    const existingUrls = new Set(
      [...(body.existingUrls ?? []), ...storedXUrls].map((url: string) => canonicalizeXUrl(url)),
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

    const items: MonitoringItem[] = [];
    let storedNew = 0;
    let storageDuplicates = 0;
    let storageFailed = 0;

    for (const result of results) {
      try {
        const canonicalUrl = canonicalizeXUrl(result.tweetUrl);
        const ingest = await persistentStore.ingestManualUrl({
          url: canonicalUrl,
          title: result.text ? result.text.slice(0, 120) : canonicalUrl,
          text: result.text || canonicalUrl,
          authorName: result.authorHandle ? result.authorHandle.replace(/^@/u, "") : undefined,
          authorHandle: result.authorHandle,
          publishedAt: result.publishedAt,
          sourceType: "x_recent_search",
          sourceName: result.authorHandle,
          discoveryMethod: "auto_search",
        });

        items.push(ingest.item);
        if (ingest.duplicate) storageDuplicates += 1;
        else storedNew += 1;
      } catch (error) {
        storageFailed += 1;
        console.error("[x-search POST] Failed to store result:", error);
      }
    }

    return NextResponse.json({
      ok: true,
      results,
      runResult,
      items,
      storage: {
        created: storedNew,
        duplicates: storageDuplicates,
        failed: storageFailed,
      },
    });
  } catch (err) {
    console.error("[x-search POST] Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "search_failed" },
      { status: 500 },
    );
  }
}
