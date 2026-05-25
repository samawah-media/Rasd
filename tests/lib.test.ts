import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enrichClientReportItem,
  extractLegacyCaptureDateIso,
  extractLegacyPublishDateIso,
  getHidayathonClientReportData,
} from "../src/lib/client-report-data";
import { canonicalizeUrl, detectPlatformFromUrl, explainKeywordMatch, makeDedupeKey } from "../src/lib/connectors";
import { checkBudget } from "../src/lib/guardrails";
import { buildLegacySearchQuery, getLegacyBackfillDataset } from "../src/lib/legacy-backfill";
import { getLegacySourceIntelligence } from "../src/lib/legacy-source-intelligence";
import { keywordRules, usageLimit } from "../src/lib/mock-data";
import { isWorkflowItem, latestWorkflowItems } from "../src/lib/ops-workflow";
import { buildClientReportExportHtml, clientReportExportLimit } from "../src/server/client-report-export";
import { errorMessage } from "../src/server/error-message";
import {
  evidenceAssetProxyUrl,
  evidenceStoragePath,
  evidenceStorageReference,
  persistEvidenceAsset,
  parseEvidenceStorageReference,
} from "../src/server/evidence-storage";
import { fetchUrlMetadata, isSafePublicHttpUrl, resolveScreenshotUrl } from "../src/server/url-metadata";
import type { YtDlpRunner } from "../src/server/media-metadata-extractor";
import type { MonitoringItem, SourceType } from "../src/lib/types";

function workflowItem(id: string, sourceType: SourceType, publishedAt: string, state: MonitoringItem["state"] = "needs_review"): MonitoringItem {
  return {
    id,
    sourceId: `source-${id}`,
    sourceName: sourceType,
    sourceType,
    state,
    title: `Item ${id}`,
    originalUrl:
      sourceType === "tiktok_research"
        ? `https://www.tiktok.com/@hidayathon/video/${id}`
        : sourceType === "instagram_public_profile"
          ? `https://www.instagram.com/p/${id}/`
          : sourceType === "x_recent_search"
            ? `https://x.com/hidayathon/status/${id}`
            : `https://example.com/${id}`,
    publishedAt,
    summary: `Summary ${id}`,
    summarySourceText: `Summary ${id}`,
    sentiment: "neutral",
    sentimentConfidence: 70,
    relevanceScore: 80,
    relevanceReason: "matched",
    matchedTerms: ["هداية"],
    dedupeKey: `${sourceType}:${id}`,
    hasReportGradeCapture: false,
  };
}

describe("connector and budget utilities", () => {
  it("keeps automated TikTok and Instagram items visible in the ops workflow", () => {
    const items = [
      workflowItem("old-news", "rss", "2026-05-20T10:00:00.000Z"),
      workflowItem("tiktok-new", "tiktok_research", "2026-05-24T10:00:00.000Z"),
      workflowItem("instagram-new", "instagram_public_profile", "2026-05-24T09:00:00.000Z"),
      workflowItem("archived-x", "x_recent_search", "2026-05-24T11:00:00.000Z", "archived"),
    ];

    const visible = latestWorkflowItems(items, 10);

    assert.equal(isWorkflowItem(items[1]), true);
    assert.equal(isWorkflowItem(items[2]), true);
    assert.deepEqual(visible.map((item) => item.id), ["tiktok-new", "instagram-new", "old-news"]);
  });

  it("canonicalizes URLs for dedupe without dropping meaningful query params", () => {
    const canonical = canonicalizeUrl("https://example.com/news/story/?utm_source=x&utm_medium=social&id=42#comments");

    assert.equal(canonical, "https://example.com/news/story?id=42");
  });

  it("canonicalizes X status URLs across language and tracking variants", () => {
    assert.equal(
      canonicalizeUrl("https://twitter.com/UOfjeddah/status/2013613302509699235?lang=en&utm_source=test#ignored"),
      "https://x.com/UOfjeddah/status/2013613302509699235",
    );
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

    assert.equal(matched.score, 85);
    assert.deepEqual(matched.matchedTerms.sort(), ["هاكاثون", "هاكاثون هداية", "هداية"].sort());
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

  it("serializes non-Error failures for connector run logs", () => {
    assert.equal(errorMessage({ code: "PGRST100", message: "Bad filter" }), '{"code":"PGRST100","message":"Bad filter"}');
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

  it("extracts source intelligence from original Hidayathon reports", () => {
    const intelligence = getLegacySourceIntelligence();

    assert.ok(intelligence.summary.items > 0);
    assert.ok(intelligence.keywords.requiredTerms.includes("هداية"));
    assert.ok(intelligence.newsSources.some((source) => source.url === "https://prh.gov.sa"));
    assert.ok(intelligence.xAccounts.some((source) => source.url === "https://x.com/UOfjeddah"));
    assert.ok(intelligence.instagramProfiles.length > 0);
    assert.ok(intelligence.tiktokProfiles.length > 0);
    assert.ok(intelligence.tiktokQueries.some((query) => query.query === "هداية"));
  });

  it("builds stable protected evidence storage references", () => {
    const storagePath = evidenceStoragePath({
      organizationId: "org-1",
      topicId: "topic-1",
      itemId: "item-1",
      captureId: "capture-1",
      kind: "report_grade",
      extension: "webp",
      nowIso: "2026-05-22T00:00:00.000Z",
    });
    const reference = evidenceStorageReference("rasd-evidence", storagePath);

    assert.equal(
      storagePath,
      "organizations/org-1/topics/topic-1/items/item-1/captures/2026-05-22T00-00-00-000Z-report_grade-capture-1.webp",
    );
    assert.deepEqual(parseEvidenceStorageReference(reference), {
      bucket: "rasd-evidence",
      path: storagePath,
    });
    assert.equal(parseEvidenceStorageReference("https://example.com/image.webp"), null);
    assert.equal(evidenceAssetProxyUrl("capture-1"), "/api/captures/capture-1/asset");
  });

  it("uploads evidence assets to Supabase Storage behind a protected proxy URL", async () => {
    const uploads: Array<{ bucket: string; path: string; contentType?: string; bytes: number }> = [];
    const fakeSupabase = {
      storage: {
        getBucket: async () => ({ data: { id: "rasd-evidence" }, error: null }),
        from: (bucket: string) => ({
          upload: async (path: string, body: Uint8Array, options: { contentType?: string }) => {
            uploads.push({ bucket, path, contentType: options.contentType, bytes: body.byteLength });
            return { data: { path }, error: null };
          },
        }),
      },
    };

    const result = await persistEvidenceAsset({
      supabase: fakeSupabase as never,
      item: {
        id: "item-1",
        sourceId: "source-1",
        sourceName: "Hidayathon",
        sourceType: "manual_url",
        state: "needs_review",
        title: "خبر هداية",
        originalUrl: "https://example.com/hidayathon",
        publishedAt: "2026-05-22T00:00:00.000Z",
        summary: "ملخص المادة",
        summarySourceText: "ملخص المادة",
        sentiment: "positive",
        sentimentConfidence: 90,
        relevanceScore: 80,
        relevanceReason: "matched",
        matchedTerms: ["هداية"],
        dedupeKey: "manual_url:https://example.com/hidayathon",
        hasReportGradeCapture: false,
      },
      captureId: "capture-1",
      kind: "report_grade",
      sourceUrl: "https://cdn.example.com/evidence.webp",
      nowIso: "2026-05-22T00:00:00.000Z",
      fetcher: async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "image/webp" },
        }),
    });

    assert.equal(result.persisted, true);
    assert.equal(result.assetUrl, "/api/captures/capture-1/asset");
    assert.equal(result.bucket, "rasd-evidence");
    assert.equal(result.contentType, "image/webp");
    assert.equal(result.sizeBytes, 4);
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].contentType, "image/webp");
    assert.equal(uploads[0].bytes, 4);
    assert.match(uploads[0].path, /items\/item-1\/captures\/2026-05-22T00-00-00-000Z-report_grade-capture-1\.webp$/);
  });

  it("derives publish and capture dates from legacy Arabic report text", () => {
    const publishDate = extractLegacyPublishDateIso({
      publishedDateText: "2جمادى 8 ديســـمبر الكاتب KNews2030_KSA",
      rawText: "الاثنين\n17\n2جمادى\n8\nديســـمبر\nالكاتب\nKNews2030_KSA\n2026 يناير31",
    });
    const captureDate = extractLegacyCaptureDateIso("2026 فـــبرايـــر14");

    assert.equal(publishDate, "2025-12-08");
    assert.equal(captureDate, "2026-02-14");
    assert.equal(
      extractLegacyPublishDateIso({
        publishedDateText: "هاكاثون يجمع المبدعين في مركز 2026 أبريل16-14 خلال الفترة",
        rawText:
          "المحتوى / الملخص\nهاكاثون يجمع المبدعين في مركز 2026 أبريل16-14 خلال الفترة\n2026 فبراير14*تم التقاط هذه الصورة بتاريخ\n14\nشعبان\n02\nفبراير\nمنصة إكس",
      }),
      "2026-02-02",
    );
    assert.equal(
      extractLegacyPublishDateIso({
        publishedDateText: "تصنيف المحتوى 2026 يناير31*تم التقاط هذه الصورة بتاريخ",
        rawText:
          "موقع رسمي\nتصنيف المحتوى\n2026 يناير31*تم التقاط هذه الصورة بتاريخ\nالثلاثاء\n18\n2جمادى\n9\nديسمبر",
      }),
      "2025-12-09",
    );
    assert.equal(
      extractLegacyPublishDateIso({
        publishedDateText: "2026-05-20T10:30:00.000Z",
        rawText: "Manual URL intake",
      }),
      "2026-05-20",
    );
    assert.equal(extractLegacyCaptureDateIso("2026-05-20T10:31:00.000Z"), "2026-05-20");
  });

  it("builds the Hidayathon client report dataset from approved legacy reports", () => {
    const report = getHidayathonClientReportData();

    assert.equal(report.summary.items, 124);
    assert.equal(report.reports.length, 4);
    assert.ok(report.filters.dates.length > 0);
    assert.ok(report.filters.sources.length > 0);
    assert.ok(report.filters.linkStatuses.includes("openable"));
    assert.equal(report.filters.linkStatuses.includes("content_link_only"), false);
    assert.equal(report.filters.linkStatuses.includes("legacy_evidence_only"), false);
    assert.ok(report.filters.screenshotStatuses.includes("available"));
    assert.ok(report.dailyDistribution.length > 0);
    assert.ok(report.platformDistribution.some((entry) => entry.platform === "X"));
    assert.deepEqual(report.filters.sentiments, ["positive"]);
    assert.deepEqual(report.sentimentDistribution, [{ sentiment: "positive", label: "إيجابي", count: 124, percent: 100 }]);
    assert.equal(report.items.every((item) => item.sentiment === "positive" && item.sentimentLabel === "إيجابي"), true);
    assert.equal(report.items.every((item) => item.reportLabel.length > 0), true);
    assert.equal(report.items.every((item) => item.clientStatusLabel.length > 0), true);
    assert.equal(report.summary.dateTo, "2026-03-13");
    assert.equal(report.items.some((item) => item.publishDateIso?.startsWith("2026-04")), false);
    assert.equal(report.items.every((item) => item.evidenceImagePath?.startsWith("/imports/legacy-content-crops/full/content-")), true);
    assert.equal(report.items.every((item) => item.contentImagePath?.startsWith("/imports/legacy-content-crops/full/content-")), true);
    assert.equal(
      report.items.every((item) => item.publisherProfileImagePath?.startsWith("/imports/legacy-content-crops/full/publisher-")),
      true,
    );
    assert.equal(report.items.every((item) => item.sourceEvidenceImagePath?.startsWith("/imports/legacy-pages/")), true);
    assert.equal(report.items.filter((item) => item.originalUrl).length, 124);
    assert.equal(report.items.filter((item) => item.extractedOriginalUrl).length, 124);
    assert.equal(
      report.items.filter((item) => item.platform === "X" && item.originalUrl && !item.originalUrl.includes("/status/")).length,
      0,
    );
    assert.equal(report.items.filter((item) => item.platform === "X" && item.originalUrl?.includes("/status/")).length, 70);
    assert.equal(report.items.filter((item) => item.platform === "X" && item.contentUrl).length, 0);
    assert.equal(report.items.some((item) => item.extractedUrls.some((url) => url.includes("hedayathon.comسجّل"))), true);
    assert.equal(report.items.some((item) => item.originalUrl?.includes("hedayathon.comسجّل")), false);
  });

  it("builds a clean exact-design printable client export with the item guardrail", () => {
    const report = getHidayathonClientReportData();
    const selected = report.items.slice(0, 3).map((item) => item.id);
    const exportHtml = buildClientReportExportHtml(report, selected);
    const expandedReport = {
      ...report,
      items: Array.from({ length: clientReportExportLimit + 1 }, (_, index) => ({
        ...report.items[index % report.items.length],
        id: `export-limit-${index}`,
      })),
    };
    const tooMany = buildClientReportExportHtml(
      expandedReport,
      expandedReport.items.map((item) => item.id),
    );

    assert.equal(exportHtml.ok, true);
    assert.equal(exportHtml.count, 3);
    assert.match(exportHtml.html, /رصد هداية هاكاثون/);
    assert.match(exportHtml.html, /حفظ PDF/);
    assert.match(exportHtml.html, /خيارات الطباعة/);
    assert.match(exportHtml.html, /Landscape/);
    assert.match(exportHtml.html, /Margins: None/);
    assert.match(exportHtml.html, /@page \{ size: 16in 9in; margin: 0; \}/);
    assert.match(exportHtml.html, /image-orientation: none/);
    assert.match(exportHtml.html, /legacy-pages/);
    assert.match(exportHtml.html, /class="legacy-source-link" href="https?:\/\//);
    assert.doesNotMatch(exportHtml.html, /confidence|raw text|backfill|النص الخام|تحذيرات الاستخراج/i);
    assert.equal(tooMany.ok, false);
    assert.equal(tooMany.error, "export_item_limit_exceeded");
    assert.equal(tooMany.maxItems, clientReportExportLimit);
  });

  it("uses the generated legacy-style page for newly added live content without a source PDF page", () => {
    const report = getHidayathonClientReportData();
    const liveItem = {
      ...report.items[0],
      id: "live-generated-export",
      sourcePdf: "live-hidayathon",
      reportIssue: null,
      reportLabel: "الرصد الحي",
      evidenceImagePath: null,
      contentImagePath: null,
      sourceEvidenceImagePath: "/live-capture.png",
      originalUrl: "https://example.com/live-post",
      contentUrl: "https://example.com/live-post",
      page: 1,
    };
    const exportHtml = buildClientReportExportHtml({ ...report, items: [liveItem] }, [liveItem.id]);

    assert.equal(exportHtml.ok, true);
    assert.match(exportHtml.html, /generated-page/);
    assert.match(exportHtml.html, /<a class="source-mark" href="https:\/\/example\.com\/live-post"/);
    assert.match(exportHtml.html, /الرصد الحي/);
    assert.match(exportHtml.html, /<div class="source-image"><img src="\/live-capture\.png"/);
    assert.doesNotMatch(exportHtml.html, /<section class="page"[^>]*>\s*<img src="\/live-capture\.png"/);
  });

  it("removes Instagram engagement metadata from client report content", () => {
    const item = enrichClientReportItem({
      id: "instagram-clean-content",
      sourcePdf: "live-hidayathon",
      reportIssue: null,
      page: 1,
      platform: "Instagram",
      sourceName: "Instagram",
      authorName: "emadowado7",
      title: "18 likes, 4 comments - emadowado7 on March 31, 2026: عنوان المنشور فقط",
      summary: "18 likes, 4 comments - emadowado7 on March 31, 2026: هذا هو محتوى المنشور فقط بدون بيانات التفاعل.",
      sentiment: "neutral",
      publishedDateText: "2026-03-31T10:30:00.000Z",
      capturedAtText: "2026-03-31T10:31:00.000Z",
      originalUrl: "https://instagram.com/p/ABCDE",
      extractedOriginalUrl: "https://instagram.com/p/ABCDE",
      originalUrlSource: "pdf",
      originalUrlOverride: null,
      extractedUrls: ["https://instagram.com/p/ABCDE"],
      evidenceImagePath: null,
      contentImagePath: null,
      publisherProfileImagePath: null,
      sourceEvidenceImagePath: null,
      rawText: "",
      imageCount: 0,
      confidence: "medium",
      warnings: [],
      initialState: "approved",
    });

    assert.equal(item.title, "عنوان المنشور فقط");
    assert.equal(item.summary, "هذا هو محتوى المنشور فقط بدون بيانات التفاعل.");
    assert.doesNotMatch(item.summary, /likes|comments|emadowado7 on March/u);
  });

  it("uses the source name as the report author for website news items", () => {
    const item = enrichClientReportItem({
      id: "website-source-author",
      sourcePdf: "live-hidayathon",
      reportIssue: null,
      page: 1,
      platform: "Website",
      sourceName: "عاجل",
      authorName: "فريق التحرير",
      title: "خبر عن هاكاثون هداية",
      summary: "تغطية خبرية من موقع إخباري.",
      sentiment: "neutral",
      publishedDateText: "2026-03-31T10:30:00.000Z",
      capturedAtText: "2026-03-31T10:31:00.000Z",
      originalUrl: "https://ajel.sa/story/hidayathon",
      extractedOriginalUrl: "https://ajel.sa/story/hidayathon",
      originalUrlSource: "pdf",
      originalUrlOverride: null,
      extractedUrls: ["https://ajel.sa/story/hidayathon"],
      evidenceImagePath: null,
      contentImagePath: null,
      publisherProfileImagePath: null,
      sourceEvidenceImagePath: null,
      rawText: "",
      imageCount: 0,
      confidence: "medium",
      warnings: [],
      initialState: "approved",
    });

    assert.equal(item.authorName, "عاجل");
  });

  it("keeps a specific publisher name when the website source is generic", () => {
    const item = enrichClientReportItem({
      id: "website-generic-source-author",
      sourcePdf: "live-hidayathon",
      reportIssue: null,
      page: 1,
      platform: "Website",
      sourceName: "إدخال يدوي",
      authorName: "أخبار السعودية",
      title: "خبر عن هاكاثون هداية",
      summary: "تغطية خبرية من موقع إخباري.",
      sentiment: "neutral",
      publishedDateText: "2026-03-31T10:30:00.000Z",
      capturedAtText: "2026-03-31T10:31:00.000Z",
      originalUrl: "https://saudinews.example/story/hidayathon",
      extractedOriginalUrl: "https://saudinews.example/story/hidayathon",
      originalUrlSource: "pdf",
      originalUrlOverride: null,
      extractedUrls: ["https://saudinews.example/story/hidayathon"],
      evidenceImagePath: null,
      contentImagePath: null,
      publisherProfileImagePath: null,
      sourceEvidenceImagePath: null,
      rawText: "",
      imageCount: 0,
      confidence: "medium",
      warnings: [],
      initialState: "approved",
    });

    assert.equal(item.authorName, "أخبار السعودية");
  });

  it("does not treat the old placeholder capture image as client evidence", () => {
    const item = enrichClientReportItem({
      id: "manual-placeholder",
      sourcePdf: "live-hidayathon",
      reportIssue: null,
      page: 1,
      platform: "Website",
      sourceName: "Hidayathon",
      authorName: "Hidayathon",
      title: "اختبار رصد هداية هاكاثون",
      summary: "مادة اختبارية قديمة.",
      sentiment: "neutral",
      publishedDateText: "2026-05-20T10:30:00.000Z",
      capturedAtText: "2026-05-20T10:31:00.000Z",
      originalUrl: "https://hedayathon.com",
      extractedOriginalUrl: "https://hedayathon.com",
      originalUrlSource: "pdf",
      originalUrlOverride: null,
      extractedUrls: ["https://hedayathon.com"],
      evidenceImagePath: "/window.svg",
      contentImagePath: "/window.svg",
      publisherProfileImagePath: null,
      sourceEvidenceImagePath: null,
      rawText: "Manual test item",
      imageCount: 1,
      confidence: "medium",
      warnings: [],
      initialState: "approved",
    });

    assert.equal(item.evidenceImagePath, null);
    assert.equal(item.contentImagePath, null);
    assert.equal(item.screenshotStatus, "missing");
  });

  it("builds a legacy link backfill queue without fabricating missing original URLs", () => {
    const backfill = getLegacyBackfillDataset();

    assert.equal(backfill.totalItems, 124);
    assert.equal(backfill.itemsWithExtractedOriginalUrl, 124);
    assert.equal(backfill.itemsWithOriginalUrl, 124);
    assert.equal(backfill.itemsMissingOriginalUrl, 0);
    assert.equal(backfill.itemsWithoutOpenableOriginalUrl, 0);
    assert.equal(backfill.invalidOriginalUrlItems, 0);
    assert.equal(backfill.overrideReadyItems, 0);
    assert.equal(backfill.xItemsMissingOriginalUrl, 0);
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

  it("extracts X oEmbed metadata for manual URL intake without calling the X API", async () => {
    const metadata = await fetchUrlMetadata("https://x.com/Hidayathon/status/123456789", async () => {
      return new Response(
        JSON.stringify({
          author_name: "Hidayathon",
          author_url: "https://twitter.com/Hidayathon",
          html:
            '<blockquote><p lang="ar">تجربة رصد جديدة لهاكاثون هداية &amp; متابعة التفاعل.</p>&mdash; Hidayathon (@Hidayathon) <a href="https://twitter.com/Hidayathon/status/123456789">May 20, 2026</a></blockquote>',
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    assert.equal(metadata.platform, "X");
    assert.equal(metadata.source, "x_oembed");
    assert.equal(metadata.authorName, "Hidayathon");
    assert.equal(metadata.authorHandle, "@Hidayathon");
    assert.equal(metadata.text, "تجربة رصد جديدة لهاكاثون هداية & متابعة التفاعل.");
    assert.equal(metadata.publishedAt, "2026-05-20T00:00:00.000Z");
    assert.equal(metadata.canonicalUrl, "https://x.com/Hidayathon/status/123456789");
  });

  it("extracts webpage title, image, canonical URL, and date metadata for manual URL intake", async () => {
    const metadata = await fetchUrlMetadata("https://example.com/news/hidayathon", async () => {
      return new Response(
        '<html><head><title>خبر هداية</title><link rel="canonical" href="/canonical-hidayathon"><meta name="description" content="متابعة إعلامية لهاكاثون هداية"><meta name="author" content="فريق الأخبار"><meta property="og:image" content="/image.jpg"><meta itemprop="datePublished" content="2026-05-21T09:30:00+03:00"></head></html>',
        { status: 200, headers: { "content-type": "text/html" } },
      );
    });

    assert.equal(metadata.platform, "Website");
    assert.equal(metadata.source, "html_metadata");
    assert.equal(metadata.readabilityUsed, false);
    assert.equal(metadata.title, "خبر هداية");
    assert.equal(metadata.text, "متابعة إعلامية لهاكاثون هداية");
    assert.equal(metadata.authorName, "فريق الأخبار");
    assert.equal(metadata.publisherName, "Example");
    assert.equal(metadata.canonicalUrl, "https://example.com/canonical-hidayathon");
    assert.equal(metadata.imageUrl, "https://example.com/image.jpg");
    assert.equal(metadata.publishedAt, "2026-05-21T06:30:00.000Z");
  });

  it("uses site metadata or hostname as a publisher fallback for webpages", async () => {
    const withSiteName = await fetchUrlMetadata("https://www.okaz.com.sa/news/hidayathon", async () => {
      return new Response(
        '<html><head><title>Hidayathon story</title><meta property="og:site_name" content="Okaz"><meta name="description" content="Coverage"></head></html>',
        { status: 200, headers: { "content-type": "text/html" } },
      );
    });
    const fromHostname = await fetchUrlMetadata("https://www.alriyadh.com/news/hidayathon", async () => {
      return new Response(
        '<html><head><title>Hidayathon story</title><meta name="description" content="Coverage"></head></html>',
        { status: 200, headers: { "content-type": "text/html" } },
      );
    });

    assert.equal(withSiteName.publisherName, "Okaz");
    assert.equal(withSiteName.siteName, "Okaz");
    assert.equal(withSiteName.authorName, "Okaz");
    assert.equal(fromHostname.publisherName, "Alriyadh");
    assert.equal(fromHostname.authorName, "Alriyadh");
  });

  it("uses Readability text when webpage metadata is too weak", async () => {
    const metadata = await fetchUrlMetadata("https://example.com/deep/hidayathon-story", async () => {
      return new Response(
        `<html><head><title>Weak metadata</title></head><body>
          <main>
            <article>
              <h1>Readability Hidayathon report</h1>
              <p>Hidayathon coverage expanded article body with useful context about the initiative, the teams, the challenge tracks, and the public response from participants.</p>
              <p>This second paragraph gives the extractor enough meaningful article text to summarize the page instead of returning only the weak title metadata.</p>
            </article>
          </main>
        </body></html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    });

    assert.equal(metadata.platform, "Website");
    assert.equal(metadata.source, "html_metadata");
    assert.equal(metadata.readabilityUsed, true);
    assert.match(metadata.text ?? "", /expanded article body/);
  });

  it("uses yt-dlp metadata first for TikTok manual URL intake", async () => {
    const previousExtractor = process.env.MEDIA_METADATA_EXTRACTOR;
    const previousApifyToken = process.env.APIFY_API_TOKEN;
    process.env.MEDIA_METADATA_EXTRACTOR = "auto";
    delete process.env.APIFY_API_TOKEN;
    let htmlFetcherCalled = false;
    const runner: YtDlpRunner = async (args) => {
      assert.equal(args.at(-1), "https://tiktok.com/@rasd/video/12345");
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          title: "TikTok title from yt-dlp",
          description: "TikTok description from yt-dlp",
          uploader: "Rasd TikTok",
          uploader_id: "rasd_tiktok",
          thumbnail: "https://cdn.example.com/tiktok.jpg",
          webpage_url: "https://www.tiktok.com/@rasd/video/12345",
          upload_date: "20260522",
        }),
        stderr: "",
      };
    };

    try {
      const metadata = await fetchUrlMetadata(
        "https://tiktok.com/@rasd/video/12345",
        async () => {
          htmlFetcherCalled = true;
          throw new Error("html_fetcher_should_not_run");
        },
        { ytdlpRunner: runner },
      );

      assert.equal(metadata.platform, "TikTok");
      assert.equal(metadata.source, "yt_dlp_metadata");
      assert.equal(metadata.title, "TikTok title from yt-dlp");
      assert.equal(metadata.text, "TikTok description from yt-dlp");
      assert.equal(metadata.authorName, "Rasd TikTok");
      assert.equal(metadata.authorHandle, "@rasd_tiktok");
      assert.equal(metadata.imageUrl, "https://cdn.example.com/tiktok.jpg");
      assert.equal(metadata.canonicalUrl, "https://www.tiktok.com/@rasd/video/12345");
      assert.equal(metadata.publishedAt, "2026-05-22T00:00:00.000Z");
      assert.equal(htmlFetcherCalled, false);
    } finally {
      if (previousExtractor === undefined) delete process.env.MEDIA_METADATA_EXTRACTOR;
      else process.env.MEDIA_METADATA_EXTRACTOR = previousExtractor;
      if (previousApifyToken === undefined) delete process.env.APIFY_API_TOKEN;
      else process.env.APIFY_API_TOKEN = previousApifyToken;
    }
  });

  it("uses yt-dlp metadata first for Instagram manual URL intake", async () => {
    const previousExtractor = process.env.MEDIA_METADATA_EXTRACTOR;
    process.env.MEDIA_METADATA_EXTRACTOR = "yt-dlp";
    const runner: YtDlpRunner = async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        title: "Instagram reel title",
        description: "Instagram caption from yt-dlp",
        uploader: "Rasd Instagram",
        uploader_id: "rasd_ig",
        thumbnail: "https://cdn.example.com/instagram.jpg",
        webpage_url: "https://www.instagram.com/reel/ABCDE/",
        timestamp: 1779395400,
      }),
      stderr: "",
    });

    try {
      const metadata = await fetchUrlMetadata(
        "https://instagram.com/reel/ABCDE",
        async () => {
          throw new Error("html_fetcher_should_not_run");
        },
        { ytdlpRunner: runner },
      );

      assert.equal(metadata.platform, "Instagram");
      assert.equal(metadata.source, "yt_dlp_metadata");
      assert.equal(metadata.title, "Instagram reel title");
      assert.equal(metadata.text, "Instagram caption from yt-dlp");
      assert.equal(metadata.authorName, "Rasd Instagram");
      assert.equal(metadata.authorHandle, "@rasd_ig");
      assert.equal(metadata.imageUrl, "https://cdn.example.com/instagram.jpg");
      assert.equal(metadata.canonicalUrl, "https://www.instagram.com/reel/ABCDE/");
      assert.equal(metadata.publishedAt, "2026-05-21T20:30:00.000Z");
    } finally {
      if (previousExtractor === undefined) delete process.env.MEDIA_METADATA_EXTRACTOR;
      else process.env.MEDIA_METADATA_EXTRACTOR = previousExtractor;
    }
  });

  it("falls back to HTML metadata when yt-dlp extraction fails", async () => {
    const previousExtractor = process.env.MEDIA_METADATA_EXTRACTOR;
    const previousApifyToken = process.env.APIFY_API_TOKEN;
    process.env.MEDIA_METADATA_EXTRACTOR = "auto";
    delete process.env.APIFY_API_TOKEN;
    const runner: YtDlpRunner = async () => ({ exitCode: 1, stdout: "", stderr: "login required" });

    try {
      const metadata = await fetchUrlMetadata(
        "https://instagram.com/p/HTMLFALLBACK",
        async () =>
          new Response(
            '<html><head><title>Instagram HTML title</title><meta property="og:description" content="25 likes, 0 comments - rasd on April 6, 2026: HTML fallback caption"><meta property="og:image" content="https://instagram.com/fallback.jpg"></head></html>',
            { status: 200, headers: { "content-type": "text/html" } },
          ),
        { ytdlpRunner: runner },
      );

      assert.equal(metadata.platform, "Instagram");
      assert.equal(metadata.source, "html_metadata");
      assert.equal(metadata.title, "Instagram HTML title");
      assert.equal(metadata.text, "HTML fallback caption");
      assert.equal(metadata.authorName, "rasd");
      assert.equal(metadata.authorHandle, "@rasd");
      assert.equal(metadata.imageUrl, "https://instagram.com/fallback.jpg");
      assert.equal(metadata.publishedAt, "2026-04-06T00:00:00.000Z");
    } finally {
      if (previousExtractor === undefined) delete process.env.MEDIA_METADATA_EXTRACTOR;
      else process.env.MEDIA_METADATA_EXTRACTOR = previousExtractor;
      if (previousApifyToken === undefined) delete process.env.APIFY_API_TOKEN;
      else process.env.APIFY_API_TOKEN = previousApifyToken;
    }
  });

  it("does not break TikTok metadata intake when yt-dlp is unavailable", async () => {
    const previousExtractor = process.env.MEDIA_METADATA_EXTRACTOR;
    const previousApifyToken = process.env.APIFY_API_TOKEN;
    process.env.MEDIA_METADATA_EXTRACTOR = "auto";
    delete process.env.APIFY_API_TOKEN;
    const runner: YtDlpRunner = async () => ({ exitCode: null, stdout: "", stderr: "not found", errorCode: "ENOENT" });

    try {
      const metadata = await fetchUrlMetadata(
        "https://tiktok.com/@rasd/video/98765",
        async () =>
          new Response(
            '<html><head><title>TikTok HTML title</title><meta property="og:description" content="TikTok fallback description"></head></html>',
            { status: 200, headers: { "content-type": "text/html" } },
          ),
        { ytdlpRunner: runner },
      );

      assert.equal(metadata.platform, "TikTok");
      assert.equal(metadata.source, "html_metadata");
      assert.equal(metadata.title, "TikTok HTML title");
      assert.equal(metadata.text, "TikTok fallback description");
    } finally {
      if (previousExtractor === undefined) delete process.env.MEDIA_METADATA_EXTRACTOR;
      else process.env.MEDIA_METADATA_EXTRACTOR = previousExtractor;
      if (previousApifyToken === undefined) delete process.env.APIFY_API_TOKEN;
      else process.env.APIFY_API_TOKEN = previousApifyToken;
    }
  });

  it("uses Apify metadata after yt-dlp fails for TikTok manual URL intake", async () => {
    const previousExtractor = process.env.MEDIA_METADATA_EXTRACTOR;
    const previousApifyToken = process.env.APIFY_API_TOKEN;
    process.env.MEDIA_METADATA_EXTRACTOR = "auto";
    process.env.APIFY_API_TOKEN = "apify_test_token";
    const runner: YtDlpRunner = async () => ({ exitCode: 1, stdout: "", stderr: "blocked by platform" });
    let htmlFetcherCalled = false;

    try {
      const metadata = await fetchUrlMetadata(
        "https://tiktok.com/@rasd/video/12345",
        async () => {
          htmlFetcherCalled = true;
          throw new Error("html_fetcher_should_not_run");
        },
        {
          ytdlpRunner: runner,
          apifyFetcher: async (input, init) => {
            assert.match(String(input), /clockworks~free-tiktok-scraper/);
            assert.match(String(init?.body), /postURLs/);
            return new Response(
              JSON.stringify([
                {
                  text: "Apify TikTok caption for Hidayathon",
                  authorMeta: { name: "rasd_tiktok", nickName: "RASD TikTok" },
                  videoMeta: { coverUrl: "https://cdn.example.com/apify-tiktok.jpg" },
                  createTimeISO: "2026-05-22T10:30:00.000Z",
                  webVideoUrl: "https://www.tiktok.com/@rasd/video/12345",
                },
              ]),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          },
        },
      );

      assert.equal(metadata.source, "apify_metadata");
      assert.equal(metadata.platform, "TikTok");
      assert.equal(metadata.title, "Apify TikTok caption for Hidayathon");
      assert.equal(metadata.text, "Apify TikTok caption for Hidayathon");
      assert.equal(metadata.authorName, "RASD TikTok");
      assert.equal(metadata.authorHandle, "@rasd_tiktok");
      assert.equal(metadata.imageUrl, "https://cdn.example.com/apify-tiktok.jpg");
      assert.equal(metadata.publishedAt, "2026-05-22T10:30:00.000Z");
      assert.equal(htmlFetcherCalled, false);
    } finally {
      if (previousExtractor === undefined) delete process.env.MEDIA_METADATA_EXTRACTOR;
      else process.env.MEDIA_METADATA_EXTRACTOR = previousExtractor;
      if (previousApifyToken === undefined) delete process.env.APIFY_API_TOKEN;
      else process.env.APIFY_API_TOKEN = previousApifyToken;
    }
  });

  it("uses Apify metadata after yt-dlp fails for Instagram manual URL intake", async () => {
    const previousExtractor = process.env.MEDIA_METADATA_EXTRACTOR;
    const previousApifyToken = process.env.APIFY_API_TOKEN;
    process.env.MEDIA_METADATA_EXTRACTOR = "auto";
    process.env.APIFY_API_TOKEN = "apify_test_token";
    const runner: YtDlpRunner = async () => ({ exitCode: 1, stdout: "", stderr: "login required" });

    try {
      const metadata = await fetchUrlMetadata(
        "https://instagram.com/p/ABCDE",
        async () => {
          throw new Error("html_fetcher_should_not_run");
        },
        {
          ytdlpRunner: runner,
          apifyFetcher: async (input, init) => {
            assert.match(String(input), /apify~instagram-post-scraper/);
            assert.match(String(init?.body), /directUrls/);
            return new Response(
              JSON.stringify([
                {
                  caption: "Apify Instagram caption for RASD",
                  ownerUsername: "rasd_ig",
                  ownerFullName: "RASD Instagram",
                  displayUrl: "https://cdn.example.com/apify-instagram.jpg",
                  timestamp: "2026-05-21T20:30:00.000Z",
                  url: "https://www.instagram.com/p/ABCDE/",
                },
              ]),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          },
        },
      );

      assert.equal(metadata.source, "apify_metadata");
      assert.equal(metadata.platform, "Instagram");
      assert.equal(metadata.title, "Apify Instagram caption for RASD");
      assert.equal(metadata.text, "Apify Instagram caption for RASD");
      assert.equal(metadata.authorName, "RASD Instagram");
      assert.equal(metadata.authorHandle, "@rasd_ig");
      assert.equal(metadata.imageUrl, "https://cdn.example.com/apify-instagram.jpg");
      assert.equal(metadata.canonicalUrl, "https://www.instagram.com/p/ABCDE/");
    } finally {
      if (previousExtractor === undefined) delete process.env.MEDIA_METADATA_EXTRACTOR;
      else process.env.MEDIA_METADATA_EXTRACTOR = previousExtractor;
      if (previousApifyToken === undefined) delete process.env.APIFY_API_TOKEN;
      else process.env.APIFY_API_TOKEN = previousApifyToken;
    }
  });

  it("prioritizes metadata thumbnails over Microlink screenshots for TikTok and Instagram", () => {
    const tiktok = resolveScreenshotUrl(
      "https://tiktok.com/@rasd/video/12345",
      "TikTok",
      "https://cdn.example.com/tiktok-cover.jpg",
    );
    const instagram = resolveScreenshotUrl(
      "https://instagram.com/p/ABCDE",
      "Instagram",
      "https://cdn.example.com/instagram-cover.jpg",
    );

    assert.deepEqual(tiktok, { url: "https://cdn.example.com/tiktok-cover.jpg", kind: "preview" });
    assert.deepEqual(instagram, { url: "https://cdn.example.com/instagram-cover.jpg", kind: "preview" });
  });

  it("blocks private or credentialed URLs before server-side metadata fetching", () => {
    assert.equal(isSafePublicHttpUrl("https://example.com/news"), true);
    assert.equal(isSafePublicHttpUrl("http://localhost:3000/admin"), false);
    assert.equal(isSafePublicHttpUrl("http://10.0.0.8/admin"), false);
    assert.equal(isSafePublicHttpUrl("http://192.168.1.20/admin"), false);
    assert.equal(isSafePublicHttpUrl("http://[::1]/admin"), false);
    assert.equal(isSafePublicHttpUrl("https://user:pass@example.com/news"), false);
  });

  it("proves storage path resolves dynamically based on real organizationId and topicId", async () => {
    const uploads: Array<{ bucket: string; path: string; contentType?: string; bytes: number }> = [];
    const fakeSupabase = {
      storage: {
        getBucket: async () => ({ data: { id: "rasd-evidence" }, error: null }),
        from: (bucket: string) => ({
          upload: async (path: string, body: Uint8Array, options: { contentType?: string }) => {
            uploads.push({ bucket, path, contentType: options.contentType, bytes: body.byteLength });
            return { data: { path }, error: null };
          },
        }),
      },
    };

    const result = await persistEvidenceAsset({
      supabase: fakeSupabase as never,
      item: {
        id: "item-special",
        sourceId: "source-1",
        sourceName: "TikTok Ingestion",
        sourceType: "manual_url",
        state: "needs_review",
        title: "فيديو رائع",
        originalUrl: "https://tiktok.com/@user/video/123",
        publishedAt: "2026-05-22T00:00:00.000Z",
        summary: "ملخص",
        summarySourceText: "ملخص",
        sentiment: "positive",
        sentimentConfidence: 90,
        relevanceScore: 80,
        relevanceReason: "matched",
        matchedTerms: ["تيك توك"],
        dedupeKey: "manual_url:https://tiktok.com/@user/video/123",
        hasReportGradeCapture: false,
        organizationId: "my-custom-org",
        topicId: "my-custom-topic",
      },
      captureId: "capture-special",
      kind: "report_grade",
      sourceUrl: "https://cdn.example.com/evidence.webp",
      nowIso: "2026-05-22T00:00:00.000Z",
      fetcher: async () =>
        new Response(new Uint8Array([1, 2, 3, 4, 5]), {
          status: 200,
          headers: { "content-type": "image/webp" },
        }),
    });

    assert.equal(result.persisted, true);
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].path, "organizations/my-custom-org/topics/my-custom-topic/items/item-special/captures/2026-05-22T00-00-00-000Z-report_grade-capture-special.webp");
  });

  it("detects and canonicalizes TikTok and Instagram URLs correctly", () => {
    // 1. Detection
    assert.equal(detectPlatformFromUrl("https://tiktok.com/@username/video/12345"), "tiktok");
    assert.equal(detectPlatformFromUrl("https://vm.tiktok.com/ABC"), "tiktok");
    assert.equal(detectPlatformFromUrl("https://instagram.com/p/ABCDE"), "instagram");
    assert.equal(detectPlatformFromUrl("https://instagr.am/p/ABCDE"), "instagram");
    assert.equal(detectPlatformFromUrl("https://example.com/news"), "web");

    // 2. Canonicalization
    assert.equal(canonicalizeUrl("https://instagram.com/p/ABCDE/"), "https://instagram.com/p/ABCDE");
    assert.equal(canonicalizeUrl("https://instagr.am/p/ABCDE?igsh=123"), "https://instagram.com/p/ABCDE");
    assert.equal(canonicalizeUrl("https://tiktok.com/@username/video/12345?is_from_webapp=1"), "https://tiktok.com/@username/video/12345");
  });

  it("extracts TikTok and Instagram metadata correctly with platform detection", async () => {
    const previousExtractor = process.env.MEDIA_METADATA_EXTRACTOR;
    const previousApifyToken = process.env.APIFY_API_TOKEN;
    const tiktokTitle = "\u062a\u063a\u0637\u064a\u0629 \u0647\u0627\u0643\u0627\u062b\u0648\u0646 \u0647\u062f\u0627\u064a\u0629 \u0639\u0644\u0649 \u062a\u064a\u0643 \u062a\u0648\u0643";
    const tiktokDescription = "\u0641\u064a\u062f\u064a\u0648 \u0631\u0627\u0626\u0639 \u0639\u0644\u0649 \u062a\u064a\u0643 \u062a\u0648\u0643";
    const instagramTitle = "\u062a\u063a\u0637\u064a\u0629 \u0631\u0635\u062f \u0647\u062f\u0627\u064a\u0629 \u0639\u0644\u0649 \u0627\u0646\u0633\u062a\u063a\u0631\u0627\u0645";
    const instagramDescription = "\u0645\u0646\u0634\u0648\u0631 \u0639\u0644\u0649 \u0627\u0646\u0633\u062a\u063a\u0631\u0627\u0645";
    process.env.MEDIA_METADATA_EXTRACTOR = "off";
    delete process.env.APIFY_API_TOKEN;

    try {
      const tiktokMeta = await fetchUrlMetadata("https://tiktok.com/@username/video/12345", async () => {
        return new Response(
          `<html><head><title>${tiktokTitle}</title><meta property="og:title" content="${tiktokTitle}"><meta property="og:description" content="${tiktokDescription}"><meta property="og:image" content="https://tiktok.com/image.jpg"></head></html>`,
          { status: 200, headers: { "content-type": "text/html" } }
        );
      });

      const instagramMeta = await fetchUrlMetadata("https://instagram.com/p/ABCDE", async () => {
        return new Response(
          `<html><head><title>${instagramTitle}</title><meta property="og:title" content="${instagramTitle}"><meta property="og:description" content="${instagramDescription}"><meta property="og:image" content="https://instagram.com/image.jpg"></head></html>`,
          { status: 200, headers: { "content-type": "text/html" } }
        );
      });

      assert.equal(tiktokMeta.platform, "TikTok");
      assert.equal(tiktokMeta.title, tiktokTitle);
      assert.equal(tiktokMeta.text, tiktokDescription);
      assert.equal(tiktokMeta.imageUrl, "https://tiktok.com/image.jpg");

      assert.equal(instagramMeta.platform, "Instagram");
      assert.equal(instagramMeta.title, instagramTitle);
      assert.equal(instagramMeta.text, instagramDescription);
      assert.equal(instagramMeta.imageUrl, "https://instagram.com/image.jpg");
    } finally {
      if (previousExtractor === undefined) delete process.env.MEDIA_METADATA_EXTRACTOR;
      else process.env.MEDIA_METADATA_EXTRACTOR = previousExtractor;
      if (previousApifyToken === undefined) delete process.env.APIFY_API_TOKEN;
      else process.env.APIFY_API_TOKEN = previousApifyToken;
    }
  });

  it("rejects generic titles and returns structured fallbacks for TikTok and Instagram", async () => {
    const previousExtractor = process.env.MEDIA_METADATA_EXTRACTOR;
    const previousApifyToken = process.env.APIFY_API_TOKEN;
    process.env.MEDIA_METADATA_EXTRACTOR = "yt-dlp";
    delete process.env.APIFY_API_TOKEN;

    const failingRunner = async () => {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "ERROR: Sign in to confirm your age.",
      };
    };

    try {
      const tiktokFallback = await fetchUrlMetadata(
        "https://tiktok.com/@username/video/12345",
        async () => {
          return new Response(
            '<html><head><title>TikTok - Make Your Day</title></head></html>',
            { status: 200, headers: { "content-type": "text/html" } }
          );
        },
        { ytdlpRunner: failingRunner }
      );

      assert.equal(tiktokFallback.platform, "TikTok");
      assert.equal(tiktokFallback.title, "تعذر جلب تفاصيل فيديو تيك توك");
      assert.equal(tiktokFallback.warning, "media_metadata_unavailable");
      assert.ok(tiktokFallback.warningDetail?.includes("yt-dlp error: yt-dlp exited with code 1"));
      assert.ok(tiktokFallback.warningDetail?.includes("HTML scraping returned a generic/denylisted title"));

      const instagramFallback = await fetchUrlMetadata(
        "https://instagram.com/p/ABCDE",
        async () => {
          return new Response(
            '<html><head><title>Log in • Instagram</title></head></html>',
            { status: 200, headers: { "content-type": "text/html" } }
          );
        },
        { ytdlpRunner: failingRunner }
      );

      assert.equal(instagramFallback.platform, "Instagram");
      assert.equal(instagramFallback.title, "تعذر جلب تفاصيل منشور إنستغرام");
      assert.equal(instagramFallback.warning, "media_metadata_unavailable");
      assert.ok(instagramFallback.warningDetail?.includes("ERROR: Sign in to confirm your age."));
    } finally {
      if (previousExtractor === undefined) delete process.env.MEDIA_METADATA_EXTRACTOR;
      else process.env.MEDIA_METADATA_EXTRACTOR = previousExtractor;
      if (previousApifyToken === undefined) delete process.env.APIFY_API_TOKEN;
      else process.env.APIFY_API_TOKEN = previousApifyToken;
    }
  });
});
