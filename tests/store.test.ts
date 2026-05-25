import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { store } from "../src/server/store";

describe("monitoring workflow store", () => {
  beforeEach(() => {
    store.resetForTest();
  });

  it("keeps manual URL ingestion idempotent by canonical URL", () => {
    const first = store.ingestManualUrl({
      url: "https://example.com/manual/story?utm_source=newsletter#section",
      title: "Hidayathon mention",
      text: "A manual monitoring item",
    });
    const second = store.ingestManualUrl({
      url: "https://example.com/manual/story",
      title: "Hidayathon mention",
      text: "A manual monitoring item",
    });

    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.item.id, first.item.id);
  });

  it("does not fabricate today's date when a manual item has no publication date", () => {
    const manual = store.ingestManualUrl({
      url: "https://example.com/manual/no-publication-date",
      title: "Hidayathon mention without date",
      text: "A manual monitoring item about Hidayathon without a publication date.",
    });

    assert.equal(Number.isNaN(Date.parse(manual.item.publishedAt)), true);

    store.reviewItem(manual.item.id, "approve", "Relevant, but date is still missing.");
    store.requestCapture(manual.item.id, "report_grade");

    const blocked = store.addReportItem("report-5", manual.item.id);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error, "published_at_required");

    const corrected = store.updateItem(manual.item.id, {
      publishedAt: "2026-05-20T10:30:00.000Z",
    });
    assert.equal(corrected.item.publishedAt, "2026-05-20T10:30:00.000Z");

    const added = store.addReportItem("report-5", manual.item.id);
    assert.equal(added.ok, true);
  });

  it("stores RSS source polling settings and rejects private feed URLs", () => {
    const source = store.createSource({
      name: "Official Hidayathon Feed",
      type: "rss",
      url: "https://example.com/news",
      feedUrl: "https://example.com/rss.xml",
      credibility: "official",
      pollIntervalMinutes: 60,
    });

    assert.equal(source.type, "rss");
    assert.equal(source.feedUrl, "https://example.com/rss.xml");
    assert.equal(source.isActive, true);
    assert.equal(source.pollIntervalMinutes, 60);

    assert.throws(
      () =>
        store.createSource({
          name: "Private Feed",
          type: "rss",
          feedUrl: "http://127.0.0.1/rss.xml",
        }),
      /feed_url must be a public http or https URL/,
    );
  });

  it("does not mark an approved item report-ready until report-grade capture succeeds", () => {
    const reviewed = store.reviewItem("item-2", "approve", "Relevant enough for the report.");
    assert.equal(reviewed.item.state, "approved_pending_capture");

    const capture = store.requestCapture("item-2", "report_grade");
    assert.equal(capture.allowed, true);
    assert.equal(capture.item.state, "report_ready");
    assert.equal(capture.item.hasReportGradeCapture, true);
    assert.match(capture.capture.assetUrl ?? "", /^\/api\/items\/item-2\/evidence-card\.svg$|^https:\/\/api\.microlink\.io\//);
  });

  it("blocks report insertion for items that are not report-ready", () => {
    const result = store.addReportItem("report-5", "item-2");

    assert.equal(result.ok, false);
    assert.equal(result.error, "item_not_report_ready");
  });

  it("allows a capture-failed item only when the warning is explicitly accepted", () => {
    const blocked = store.addReportItem("report-5", "item-3");
    const accepted = store.addReportItem("report-5", "item-3", true);

    assert.equal(blocked.ok, false);
    assert.equal(accepted.ok, true);
    assert.equal(accepted.reportItem.warningAccepted, true);
  });

  it("stops screenshot work before crossing the configured budget", () => {
    store.setUsageForTest({ screenshotsThisMonth: 350 });
    const capture = store.requestCapture("item-2", "report_grade");

    assert.equal(capture.allowed, false);
    assert.deepEqual(capture.budget.violations.length, 1);
  });

  it("enforces share-link view limits and revocation", async () => {
    const created = await store.createShareLink("report-5", { maxViews: 1 });
    assert.equal(created.ok, true);
    assert.notEqual(created.link.tokenHash, `sha256:${created.token}`);
    assert.equal(created.link.tokenHash.length, "sha256:".length + 64);
    assert.equal(created.link.expiresAt, null);

    const firstView = await store.resolveShareLink(created.token);
    const secondView = await store.resolveShareLink(created.token);

    assert.equal(firstView.ok, true);
    assert.equal(secondView.ok, false);
    assert.equal(secondView.error, "share_link_view_limit_reached");

    const revoked = await store.createShareLink("report-5");
    assert.equal(revoked.ok, true);
    assert.equal((await store.revokeShareLink(revoked.token)).ok, true);
    assert.equal((await store.resolveShareLink(revoked.token)).error, "share_link_revoked");
  });

  it("rejects expired share links", async () => {
    const created = await store.createShareLink("report-5", { expiresInDays: -1 });
    assert.equal(created.ok, true);

    const result = await store.resolveShareLink(created.token);
    assert.equal(result.ok, false);
    assert.equal(result.error, "share_link_expired");
  });

  it("imports approved legacy reports as published report data without duplicates", () => {
    const first = store.importLegacyReports();
    const second = store.importLegacyReports();

    assert.equal(first.imported, true);
    assert.equal(first.importedItems, 124);
    assert.equal(first.importedReports, 4);
    assert.equal(first.linkedReportItems, 124);
    assert.equal(first.itemsCreated, 124);

    assert.equal(second.importedItems, 124);
    assert.equal(second.importedReports, 4);
    assert.equal(second.linkedReportItems, 124);
    assert.equal(second.itemsCreated, 0);
    assert.equal(second.duplicatesSkipped, 124);

    const legacyItems = store.listItems().filter((item) => item.id.startsWith("legacy-item-"));
    const legacyCaptures = store.listCaptures().filter((capture) => capture.id.startsWith("legacy-item-"));
    assert.equal(legacyItems.every((item) => item.state === "published"), true);
    assert.equal(legacyItems.every((item) => item.hasReportGradeCapture), true);
    assert.equal(
      legacyCaptures.every((capture) => capture.assetUrl?.startsWith("/imports/legacy-content-crops/full/content-")),
      true,
    );
    assert.ok(legacyItems.some((item) => item.originalUrl.startsWith("https://")));
  });

  it("refreshes duplicate items with better metadata when re-submitted", () => {
    const stale = store.ingestManualUrl({
      url: "https://x.com/TestUser/status/999888777",
    });
    assert.equal(stale.duplicate, false);
    assert.equal(stale.item.title, "مادة مرصودة من رابط يدوي");
    assert.equal(stale.item.summary, "تم حفظ الرابط كدليل خفيف بانتظار مراجعة المحرر.");
    assert.equal(stale.item.authorName, "غير محدد");

    const refreshed = store.ingestManualUrl({
      url: "https://x.com/TestUser/status/999888777?lang=en",
      title: "عنوان أفضل عن هاكاثون هداية",
      text: "نص محدث عن هاكاثون هداية ومشاركة الفريق.",
      authorName: "مستخدم اختبار",
      authorHandle: "@TestUser",
    });
    assert.equal(refreshed.duplicate, true);
    assert.equal(refreshed.item.id, stale.item.id);
    assert.equal(refreshed.item.title, "عنوان أفضل عن هاكاثون هداية");
    assert.equal(refreshed.item.summary, "نص محدث عن هاكاثون هداية ومشاركة الفريق.");
    assert.equal(refreshed.item.authorName, "مستخدم اختبار");
    assert.equal(refreshed.item.authorHandle, "@TestUser");
    assert.equal(refreshed.item.originalUrl, "https://x.com/TestUser/status/999888777");
  });

  it("reopens archived manual duplicates when the link is submitted again", () => {
    const first = store.ingestManualUrl({
      url: "https://x.com/UOfjeddah/status/2013613302509699235?lang=en",
      title: "هاكثون هداية من جامعة جدة",
      text: "هاكثون هداية من مكة تنطلق الفكرة وبالعلم يتحقق الأثر.",
      authorName: "جامعة جدة",
      authorHandle: "@UOfjeddah",
      publishedAt: "2026-01-20T00:00:00.000Z",
    });
    store.archiveItem(first.item.id, "cleanup test");

    const reopened = store.ingestManualUrl({
      url: "https://x.com/UOfjeddah/status/2013613302509699235",
      title: "هاكثون هداية من جامعة جدة",
      text: "هاكثون هداية من مكة تنطلق الفكرة وبالعلم يتحقق الأثر.",
      authorName: "جامعة جدة",
      authorHandle: "@UOfjeddah",
    });

    assert.equal(reopened.duplicate, true);
    assert.equal(reopened.duplicateType, "url");
    assert.equal(reopened.item.id, first.item.id);
    assert.equal(reopened.item.state, "needs_review");
  });

  it("detects duplicate content when different URLs are submitted with same text (> 30 chars)", () => {
    const first = store.ingestManualUrl({
      url: "https://x.com/FirstUser/status/111111",
      title: "First Title",
      text: "هذا نص مكرر طويل جدا يتجاوز الثلاثين حرفا ليتم رصده كمحتوى مكرر.",
    });

    const second = store.ingestManualUrl({
      url: "https://x.com/SecondUser/status/222222",
      title: "Second Title",
      text: "هذا نص مكرر طويل جدا يتجاوز الثلاثين حرفا ليتم رصده كمحتوى مكرر.",
    });

    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.duplicateType, "content");
    assert.equal(second.item.id, first.item.id);
  });
});
