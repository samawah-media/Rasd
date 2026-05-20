import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractLegacyCaptureDateIso,
  extractLegacyPublishDateIso,
  getHidayathonClientReportData,
} from "../src/lib/client-report-data";
import { canonicalizeUrl, explainKeywordMatch, makeDedupeKey } from "../src/lib/connectors";
import { checkBudget } from "../src/lib/guardrails";
import { buildLegacySearchQuery, getLegacyBackfillDataset } from "../src/lib/legacy-backfill";
import { keywordRules, usageLimit } from "../src/lib/mock-data";

describe("connector and budget utilities", () => {
  it("canonicalizes URLs for dedupe without dropping meaningful query params", () => {
    const canonical = canonicalizeUrl("https://example.com/news/story/?utm_source=x&utm_medium=social&id=42#comments");

    assert.equal(canonical, "https://example.com/news/story?id=42");
  });

  it("prefers source item IDs over URLs in dedupe keys", () => {
    const key = makeDedupeKey(
      {
        sourceItemId: "post-123",
        url: "https://x.com/example/status/123?utm_source=test",
        title: "Post",
        text: "Body",
        publishedAt: "2026-02-14T00:00:00.000Z",
        raw: {},
      },
      "x_recent_search",
    );

    assert.equal(key, "x_recent_search:post-123");
  });

  it("explains required, optional, and excluded keyword behavior", () => {
    const matched = explainKeywordMatch("تغطية هداية وهاكاثون هداية", keywordRules[0]);
    const excluded = explainKeywordMatch("إعلان ممول عن وظائف مرتبطة بهداية", keywordRules[0]);

    assert.equal(matched.score, 50);
    assert.deepEqual(matched.matchedTerms.sort(), ["هاكاثون", "هداية"].sort());
    assert.equal(excluded.score, 0);
    assert.deepEqual(excluded.matchedTerms, ["هداية"]);
  });

  it("returns warnings without blocking when hard stop is disabled", () => {
    const result = checkBudget(
      { ...usageLimit, hardStopEnabled: false },
      {
        xReadsToday: usageLimit.maxXReadsPerDay,
        xReadsThisMonth: usageLimit.maxXReadsPerMonth,
        aiTokensThisMonth: 0,
        screenshotsThisMonth: 0,
        storageMb: 0,
      },
      { type: "x_read", units: 1 },
    );

    assert.equal(result.allowed, true);
    assert.equal(result.violations.length, 2);
  });

  it("blocks AI token work before monthly limits are exceeded", () => {
    const result = checkBudget(
      usageLimit,
      {
        xReadsToday: 0,
        xReadsThisMonth: 0,
        aiTokensThisMonth: usageLimit.maxAiTokensPerMonth,
        screenshotsThisMonth: 0,
        storageMb: 0,
      },
      { type: "ai_tokens", units: 1 },
    );

    assert.equal(result.allowed, false);
    assert.equal(result.violations.length, 1);
  });

  it("derives publish and capture dates from legacy Arabic report text", () => {
    const publishDate = extractLegacyPublishDateIso({
      publishedDateText: "2جمادى 8 ديســـمبر الكاتب KNews2030_KSA",
      rawText: "الاثنين\n17\n2جمادى\n8\nديســـمبر\nالكاتب\nKNews2030_KSA\n2026 يناير31",
    });
    const captureDate = extractLegacyCaptureDateIso("2026 فـــبرايـــر14");

    assert.equal(publishDate, "2025-12-08");
    assert.equal(captureDate, "2026-02-14");
  });

  it("builds the Hidayathon client report dataset from approved legacy reports", () => {
    const report = getHidayathonClientReportData();

    assert.equal(report.summary.items, 124);
    assert.equal(report.reports.length, 4);
    assert.ok(report.filters.dates.length > 0);
    assert.ok(report.dailyDistribution.length > 0);
    assert.ok(report.platformDistribution.some((entry) => entry.platform === "X"));
    assert.equal(report.items.every((item) => item.reportLabel.length > 0), true);
    assert.equal(report.items.every((item) => item.evidenceImagePath?.startsWith("/imports/legacy-pages/")), true);
    assert.ok(report.items.some((item) => item.originalUrl?.startsWith("https://")));
    assert.equal(report.items.filter((item) => item.extractedOriginalUrl).length, 24);
    assert.equal(report.items.filter((item) => item.originalUrl).length, 24);
    assert.equal(report.items.some((item) => item.extractedOriginalUrl?.includes("hedayathon.comسجّل")), true);
    assert.equal(report.items.some((item) => item.originalUrl?.includes("hedayathon.comسجّل")), false);
  });

  it("builds a legacy link backfill queue without fabricating missing original URLs", () => {
    const backfill = getLegacyBackfillDataset();

    assert.equal(backfill.totalItems, 124);
    assert.equal(backfill.itemsWithExtractedOriginalUrl, 24);
    assert.equal(backfill.itemsWithOriginalUrl, 24);
    assert.equal(backfill.itemsMissingOriginalUrl, 100);
    assert.equal(backfill.itemsWithoutOpenableOriginalUrl, 100);
    assert.equal(backfill.invalidOriginalUrlItems, 0);
    assert.equal(backfill.overrideReadyItems, 3);
    assert.ok(backfill.xItemsMissingOriginalUrl > 0);
    assert.equal(
      backfill.items
        .filter((item) => item.backfillStatus === "missing_url" || item.backfillStatus === "invalid_url")
        .every((item) => item.effectiveOriginalUrl === null),
      true,
    );
    assert.ok(backfill.items.some((item) => item.xSearchUrl.startsWith("https://x.com/search")));
  });

  it("keeps legacy backfill search queries bounded for URL generation", () => {
    const query = buildLegacySearchQuery({
      authorName: "Hidayathon",
      platform: "X",
      title: "x".repeat(260),
      summary: "y".repeat(260),
    });

    assert.ok(query.length <= 180);
    assert.ok(query.includes("Hidayathon"));
  });
});
