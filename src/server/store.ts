import { canonicalizeUrl, explainKeywordMatch, makeDedupeKey } from "@/lib/connectors";
import { checkBudget, type UsageSnapshot } from "@/lib/guardrails";
import { getImportedReportsDataset, type ImportedReportItem } from "@/lib/imported-reports";
import {
  captures as seedCaptures,
  healthMetrics,
  keywordRules,
  monitoringItems as seedItems,
  reportVersions as seedReports,
  sources as seedSources,
  usageLimit,
} from "@/lib/mock-data";
import { getPersistenceMode } from "@/server/supabase-admin";
import { evidenceCardUrl } from "@/server/evidence-card";
import { isSafePublicHttpUrl } from "@/server/url-metadata";
import {
  normalizeSourceCreateInput,
  type SourceCreateInput,
} from "@/server/source-validation";
import {
  buildRssIngestionItem,
  fetchRssFeed,
  type RssIngestionItem,
} from "@/server/rss-ingestion";
import type {
  Capture,
  CaptureKind,
  HealthMetric,
  ItemState,
  MonitoringItem,
  Source,
  SourceType,
} from "@/lib/types";

type ReviewAction = "approve" | "reject";

type AuditEvent = {
  id: string;
  action: string;
  entityId: string;
  actorRole: "owner" | "editor" | "viewer";
  metadata?: Record<string, unknown>;
  createdAt: string;
};

type ReportItem = {
  id: string;
  reportId: string;
  itemId: string;
  warningAccepted: boolean;
  addedAt: string;
};

type ShareLink = {
  id: string;
  reportId: string;
  tokenHash: string;
  expiresAt: string | null;
  revokedAt: string | null;
  maxViews?: number;
  viewCount: number;
  noindex: boolean;
  watermark: boolean;
  createdAt: string | null;
  lastViewedAt: string | null;
};

type ConnectorRun = {
  id: string;
  connector: SourceType;
  status: "queued" | "success" | "failed" | "not_configured";
  cursor?: Record<string, unknown>;
  startedAt: string;
  finishedAt?: string;
};

type ManualUrlInput = {
  url: string;
  title?: string;
  text?: string;
  authorName?: string;
  authorHandle?: string;
  publishedAt?: string;
};

type RssIngestOptions = {
  fetcher?: typeof fetch;
};

const items = seedItems.map((item) => ({ ...item }));
const captures = seedCaptures.map((capture) => ({ ...capture }));
const sources = seedSources.map((source) => ({ ...source }));
const reports = seedReports.map((report) => ({ ...report }));
const reportItems: ReportItem[] = [];
const auditLogs: AuditEvent[] = [];
const shareLinks: ShareLink[] = [];
const connectorRuns: ConnectorRun[] = [];

const initialUsage: UsageSnapshot = {
  xReadsToday: 120,
  xReadsThisMonth: 900,
  aiTokensThisMonth: 130000,
  screenshotsThisMonth: 44,
  storageMb: 880,
};

let usage: UsageSnapshot = { ...initialUsage };

function cloneList<T>(entries: T[]) {
  return entries.map((entry) => ({ ...entry }));
}

function now() {
  return new Date().toISOString();
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function audit(action: string, entityId: string, metadata?: Record<string, unknown>) {
  const event: AuditEvent = {
    id: crypto.randomUUID(),
    action,
    entityId,
    actorRole: "editor",
    metadata,
    createdAt: now(),
  };
  auditLogs.unshift(event);
  return event;
}

function sourceLabel(type: SourceType) {
  if (type === "rss") return "مصدر RSS";
  if (type === "web_page") return "موقع ويب";
  if (type.startsWith("x_")) return "منصة X";
  return "إدخال يدوي";
}

function estimateSentiment(score: number) {
  if (score <= 30) return "negative";
  if (score < 40) return "neutral";
  return "positive";
}

function platformFromUrl(value: string) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com")) {
      return "X";
    }
    return "Website";
  } catch {
    return "Unknown";
  }
}

function mapLegacyPlatformToSourceType(platform: string): SourceType {
  if (platform === "X") return "x_oembed";
  if (platform === "Official") return "web_page";
  return "web_page";
}

function mapLegacySentiment(sentiment: string) {
  if (sentiment === "positive" || sentiment === "negative" || sentiment === "neutral") {
    return sentiment;
  }
  return "neutral";
}

function mapLegacyConfidence(confidence: ImportedReportItem["confidence"]) {
  if (confidence === "high") return 95;
  if (confidence === "medium") return 82;
  return 70;
}

function legacyReportId(issue: number | null) {
  return issue ? `legacy-report-e${String(issue).padStart(2, "0")}` : "legacy-report-unassigned";
}

function legacyItemId(item: ImportedReportItem) {
  return `legacy-item-${legacyReportId(item.reportIssue)}-p${item.page}-${slugify(
    `${item.platform}-${item.authorName}-${item.title}`,
  ).slice(0, 48)}`;
}

function legacyCaptureId(itemId: string) {
  return `${itemId}-report-grade-capture`;
}

function legacyReportItemId(reportId: string, itemId: string) {
  return `${reportId}-${itemId}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function legacyUrl(item: ImportedReportItem) {
  if (item.originalUrl) return item.originalUrl;
  return `legacy://hidayathon/${encodeURIComponent(item.sourcePdf)}#page=${item.page}`;
}

function legacyEvidenceUrl(item: ImportedReportItem) {
  return item.evidenceImagePath ?? legacyUrl(item);
}

function createEvidenceLiteCapture(itemId: string): Capture {
  const item = items.find((entry) => entry.id === itemId);
  let screenshotUrl = evidenceCardUrl(itemId);
  if (item && item.originalUrl && isSafePublicHttpUrl(item.originalUrl)) {
    screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(item.originalUrl)}&screenshot=true&embed=screenshot.url`;
  }

  const capture: Capture = {
    id: crypto.randomUUID(),
    itemId,
    kind: "evidence_lite",
    status: "success",
    capturedAt: now(),
    assetUrl: screenshotUrl,
  };
  captures.unshift(capture);
  return capture;
}

function xStatusIdFromUrl(value: string) {
  try {
    return new URL(value).pathname.match(/\/status\/(\d+)/u)?.[1] ?? null;
  } catch {
    return null;
  }
}

function isSameManualUrl(item: MonitoringItem, dedupeKey: string, canonicalUrl: string) {
  if (item.dedupeKey === dedupeKey) return true;
  const incomingStatusId = xStatusIdFromUrl(canonicalUrl);
  return Boolean(incomingStatusId && incomingStatusId === xStatusIdFromUrl(item.originalUrl));
}

function isWeakManualTitle(item: MonitoringItem) {
  return item.title === item.originalUrl || item.title.startsWith("http") || item.title.includes("رابط يدوي");
}

function isWeakManualSummary(item: MonitoringItem) {
  return item.summary === item.originalUrl || item.summary.startsWith("تم حفظ الرابط");
}

function refreshManualDuplicate(item: MonitoringItem, input: ManualUrlInput, canonicalUrl: string) {
  let changed = false;

  if (input.title && (isWeakManualTitle(item) || input.title.length > item.title.length)) {
    item.title = input.title;
    changed = true;
  }
  if (input.text && (isWeakManualSummary(item) || input.text.length > item.summary.length)) {
    item.summary = input.text;
    item.summarySourceText = input.text;
    changed = true;
  }
  if (input.authorName && (!item.authorName || item.authorName === "غير محدد")) {
    item.authorName = input.authorName;
    changed = true;
  }
  if (input.authorHandle && !item.authorHandle) {
    item.authorHandle = input.authorHandle;
    changed = true;
  }
  if (input.publishedAt) {
    item.publishedAt = input.publishedAt;
    changed = true;
  }
  if (item.originalUrl !== canonicalUrl && xStatusIdFromUrl(item.originalUrl) === xStatusIdFromUrl(canonicalUrl)) {
    item.originalUrl = canonicalUrl;
    changed = true;
  }

  const rule = keywordRules[0];
  const match = explainKeywordMatch(`${item.title} ${item.summary} ${canonicalUrl}`, rule);
  if (match.score > item.relevanceScore) {
    item.relevanceScore = match.score;
    item.relevanceReason = match.reason;
    item.matchedTerms = match.matchedTerms;
    item.sentiment = estimateSentiment(match.score);
    item.sentimentConfidence = Math.max(50, Math.min(95, match.score));
    if (item.state === "candidate") item.state = "needs_review";
    changed = true;
  }

  for (const capture of captures) {
    if (capture.itemId === item.id && capture.status === "success" && (!capture.assetUrl || capture.assetUrl === "/window.svg" || capture.assetUrl.includes("evidence-card.svg"))) {
      let screenshotUrl = evidenceCardUrl(item.id);
      const targetUrl = canonicalUrl || item.originalUrl;
      if (targetUrl && isSafePublicHttpUrl(targetUrl)) {
        screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}&screenshot=true&embed=screenshot.url`;
      }
      capture.assetUrl = screenshotUrl;
      changed = true;
    }
  }

  return changed;
}

function getItemOrThrow(id: string) {
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new Error("item_not_found");
  return item;
}

function getRssSourceOrThrow(sourceId: string) {
  const source = sources.find((entry) => entry.id === sourceId);
  if (!source) throw new Error("source_not_found");
  if (source.type !== "rss" || !source.feedUrl) throw new Error("source_not_rss");
  return source;
}

function findRssDuplicate(ingested: RssIngestionItem) {
  return items.find(
    (entry) =>
      entry.sourceType === "rss" &&
      (entry.originalUrl === ingested.canonicalUrl ||
        entry.sourceItemId === ingested.item.sourceItemId ||
        entry.dedupeKey === ingested.item.dedupeKey),
  );
}

export const store = {
  resetForTest() {
    items.splice(0, items.length, ...cloneList(seedItems));
    captures.splice(0, captures.length, ...cloneList(seedCaptures));
    sources.splice(0, sources.length, ...cloneList(seedSources));
    reports.splice(0, reports.length, ...cloneList(seedReports));
    reportItems.splice(0, reportItems.length);
    auditLogs.splice(0, auditLogs.length);
    shareLinks.splice(0, shareLinks.length);
    connectorRuns.splice(0, connectorRuns.length);
    usage = { ...initialUsage };
  },

  setUsageForTest(nextUsage: Partial<UsageSnapshot>) {
    usage = { ...usage, ...nextUsage };
  },

  health() {
    const dynamicHealth: HealthMetric[] = [
      ...healthMetrics,
      {
        label: "In-memory workflow",
        value: `${items.length} مواد / ${auditLogs.length} أحداث تدقيق`,
        status: "good",
      },
      {
        label: "Persistence",
        value: getPersistenceMode() === "supabase" ? "Supabase configured" : "Local memory",
        status: getPersistenceMode() === "supabase" ? "good" : "warning",
      },
    ];

    return {
      status: "ok",
      metrics: dynamicHealth,
      connectors: {
        manual_url: "healthy",
        rss: "healthy",
        web_page: "degraded",
        x_oembed: "not_configured",
        x_recent_search: "not_configured",
      },
      usage,
    };
  },

  listItems() {
    return items;
  },

  listSources() {
    return sources;
  },

  listReports() {
    return reports;
  },

  getHidayathonLiveReport() {
    return reports.find((report) => report.id === "report-5") ?? reports[0]!;
  },

  listAuditLogs() {
    return auditLogs.slice(0, 50);
  },

  listCaptures(itemId?: string) {
    return itemId ? captures.filter((capture) => capture.itemId === itemId) : captures;
  },

  listReportItems(reportId: string) {
    return reportItems.filter((entry) => entry.reportId === reportId);
  },

  listShareLinks(reportId: string) {
    return shareLinks
      .filter((entry) => entry.reportId === reportId)
      .map((entry) => ({
        ...entry,
        clientStatus: entry.revokedAt
          ? "revoked"
          : entry.expiresAt && new Date(entry.expiresAt).getTime() <= Date.now()
            ? "expired"
            : "active",
      }));
  },

  legacyImportStatus() {
    const legacyItems = items.filter((item) => item.id.startsWith("legacy-item-"));
    const legacyReports = reports.filter((report) => report.id.startsWith("legacy-report-"));
    const legacyReportItems = reportItems.filter((entry) => entry.id.startsWith("legacy-report-"));

    return {
      imported: legacyItems.length > 0,
      importedItems: legacyItems.length,
      importedReports: legacyReports.length,
      linkedReportItems: legacyReportItems.length,
      sourceItems: getImportedReportsDataset().uniqueExtractedItems,
    };
  },

  importLegacyReports() {
    const dataset = getImportedReportsDataset();
    const uniqueReportSummaries = dataset.reports.filter(
      (report) => !report.duplicateOf && report.extractedItemCount > 0,
    );

    let reportsCreated = 0;
    let itemsCreated = 0;
    let capturesCreated = 0;
    let linksCreated = 0;
    let duplicatesSkipped = 0;

    for (const reportSummary of uniqueReportSummaries) {
      const reportId = legacyReportId(reportSummary.issue);
      const existingReport = reports.find((report) => report.id === reportId);

      if (!existingReport) {
        reports.push({
          id: reportId,
          version: reportSummary.issue ?? reports.length + 1,
          status: "published",
          title: `تقرير رصد هاكاثون هداية - الإصدار ${reportSummary.issue ?? "-"}`,
          periodStart: "2025-12-08",
          periodEnd: "2026-03-15",
          publishedAt: now(),
          secureUrl: `/reports/${reportId}`,
        });
        reportsCreated += 1;
      }
    }

    for (const legacyItem of dataset.items) {
      const itemId = legacyItemId(legacyItem);
      const reportId = legacyReportId(legacyItem.reportIssue);
      const existingItem = items.find((item) => item.id === itemId);

      if (existingItem) {
        duplicatesSkipped += 1;
      } else {
        const sourceType = mapLegacyPlatformToSourceType(legacyItem.platform);
        const monitoringItem: MonitoringItem = {
          id: itemId,
          sourceId: `legacy-source-${sourceType}`,
          sourceName: legacyItem.sourceName,
          sourceType,
          state: "published",
          title: legacyItem.title,
          originalUrl: legacyUrl(legacyItem),
          authorName: legacyItem.authorName,
          publishedAt: legacyItem.publishedDateText,
          summary: legacyItem.summary,
          summarySourceText: legacyItem.rawText,
          sentiment: mapLegacySentiment(legacyItem.sentiment),
          sentimentConfidence: mapLegacyConfidence(legacyItem.confidence),
          relevanceScore: 100,
          relevanceReason: "مادة مستوردة من تقرير قديم معتمد ومنشور سابقًا.",
          matchedTerms: ["هداية", "هاكاثون"],
          dedupeKey: `legacy:${legacyItem.sourcePdf}:${legacyItem.page}:${legacyItem.platform}:${legacyItem.authorName}`,
          hasReportGradeCapture: true,
          warning: legacyItem.warnings.length
            ? legacyItem.warnings.join("، ")
            : legacyItem.originalUrl
              ? undefined
              : "لا يوجد رابط أصلي داخل التقرير القديم؛ الدليل المتاح هو صورة صفحة التقرير.",
          sourceItemId: legacyItem.id,
        };
        items.push(monitoringItem);
        itemsCreated += 1;
      }

      const captureId = legacyCaptureId(itemId);
      if (!captures.some((capture) => capture.id === captureId)) {
        captures.push({
          id: captureId,
          itemId,
          kind: "report_grade",
          status: "success",
          capturedAt: legacyItem.capturedAtText,
          assetUrl: legacyEvidenceUrl(legacyItem),
        });
        capturesCreated += 1;
      }

      const reportItemId = legacyReportItemId(reportId, itemId);
      if (!reportItems.some((entry) => entry.id === reportItemId)) {
        reportItems.push({
          id: reportItemId,
          reportId,
          itemId,
          warningAccepted: true,
          addedAt: now(),
        });
        linksCreated += 1;
      }
    }

    const event = audit("legacy_import.completed", "legacy-hidayathon", {
      reportsCreated,
      itemsCreated,
      capturesCreated,
      linksCreated,
      duplicatesSkipped,
      sourceItems: dataset.uniqueExtractedItems,
    });

    return {
      ...this.legacyImportStatus(),
      reportsCreated,
      itemsCreated,
      capturesCreated,
      linksCreated,
      duplicatesSkipped,
      auditLog: event,
    };
  },

  createSource(input: SourceCreateInput) {
    const normalized = normalizeSourceCreateInput(input);
    const source: Source = {
      id: crypto.randomUUID(),
      type: normalized.type,
      name: normalized.name ?? sourceLabel(normalized.type),
      url: normalized.url,
      feedUrl: normalized.feedUrl,
      country: "السعودية",
      credibility: normalized.credibility,
      isVerifiedSource: false,
      isActive: normalized.isActive,
      pollIntervalMinutes: normalized.pollIntervalMinutes,
    };
    sources.unshift(source);
    audit("source.created", source.id, { type: source.type });
    return source;
  },

  async ingestRssSource(sourceId: string, options: RssIngestOptions = {}) {
    const source = getRssSourceOrThrow(sourceId);
    const checkedAt = now();
    source.lastCheckedAt = checkedAt;

    try {
      const feed = await fetchRssFeed(source.feedUrl!, options.fetcher);
      let created = 0;
      let duplicates = 0;
      let failed = 0;
      const createdItems: MonitoringItem[] = [];

      for (const entry of feed.entries) {
        try {
          const ingested = buildRssIngestionItem(source, entry, checkedAt);
          const duplicate = findRssDuplicate(ingested);
          if (duplicate) {
            duplicates += 1;
            continue;
          }

          items.unshift(ingested.item);
          createdItems.push(ingested.item);
          created += 1;
          audit("item.ingested", ingested.item.id, {
            sourceType: "rss",
            sourceId: source.id,
            canonicalUrl: ingested.canonicalUrl,
          });
        } catch {
          failed += 1;
        }
      }

      source.lastSuccessAt = now();
      source.lastError = undefined;
      audit("source.rss_polled", source.id, {
        fetched: feed.entries.length,
        created,
        duplicates,
        failed,
      });

      return {
        source,
        feed,
        fetched: feed.entries.length,
        created,
        duplicates,
        failed,
        items: createdItems,
      };
    } catch (error) {
      source.lastError = error instanceof Error ? error.message : "rss_ingestion_failed";
      audit("source.rss_poll_failed", source.id, { error: source.lastError });
      throw error;
    }
  },

  ingestManualUrl(input: ManualUrlInput) {
    const canonicalUrl = canonicalizeUrl(input.url);
    const publishedAt = input.publishedAt ?? now();
    const platform = platformFromUrl(canonicalUrl);
    const dedupeKey = makeDedupeKey(
      {
        url: canonicalUrl,
        title: input.title ?? canonicalUrl,
        text: input.text ?? input.title ?? canonicalUrl,
        authorName: input.authorName,
        authorHandle: input.authorHandle,
        publishedAt,
        raw: { ...input, platform },
      },
      "manual_url",
    );
    let duplicateType: "url" | "content" | null = null;
    let duplicate = items.find((entry) => entry.sourceType === "manual_url" && isSameManualUrl(entry, dedupeKey, canonicalUrl));
    if (duplicate) {
      duplicateType = "url";
    }

    if (!duplicate && input.text && input.text.trim().length > 30) {
      const inputTrimmed = input.text.trim();
      duplicate = items.find((entry) => {
        if (entry.sourceType !== "manual_url") return false;
        const entryText = (entry.summary || entry.summarySourceText || "").trim();
        return entryText === inputTrimmed;
      });
      if (duplicate) {
        duplicateType = "content";
      }
    }

    if (duplicate) {
      const refreshed = refreshManualDuplicate(duplicate, input, canonicalUrl);
      audit("item.duplicate_detected", duplicate.id, { dedupeKey, duplicateType });
      if (refreshed) audit("item.metadata_refreshed", duplicate.id, { dedupeKey });
      return { item: duplicate, duplicate: true, duplicateType };
    }

    const rule = keywordRules[0];
    const match = explainKeywordMatch(`${input.title ?? ""} ${input.text ?? ""} ${canonicalUrl}`, rule);
    const item: MonitoringItem = {
      id: crypto.randomUUID(),
      sourceId: "src-manual",
      sourceName: "إدخال يدوي",
      sourceType: "manual_url",
      state: match.score > 0 ? "needs_review" : "candidate",
      title: input.title ?? "مادة مرصودة من رابط يدوي",
      originalUrl: canonicalUrl,
      authorName: input.authorName ?? "غير محدد",
      authorHandle: input.authorHandle,
      publishedAt,
      summary: input.text ?? "تم حفظ الرابط كدليل خفيف بانتظار مراجعة المحرر.",
      summarySourceText: input.text ?? canonicalUrl,
      sentiment: estimateSentiment(match.score),
      sentimentConfidence: Math.max(50, Math.min(95, match.score)),
      relevanceScore: match.score,
      relevanceReason: match.reason,
      matchedTerms: match.matchedTerms,
      dedupeKey,
      hasReportGradeCapture: false,
    };

    items.unshift(item);
    const evidence = createEvidenceLiteCapture(item.id);
    audit("item.ingested", item.id, { sourceType: "manual_url", evidenceId: evidence.id });
    return { item, duplicate: false, duplicateType: null, evidence };
  },

  reviewItem(id: string, action: ReviewAction, reviewNotes?: string) {
    const item = getItemOrThrow(id);
    const nextState: ItemState =
      action === "reject"
        ? "rejected"
        : item.hasReportGradeCapture
          ? "report_ready"
          : "approved_pending_capture";

    item.state = nextState;
    const event = audit(`item.${action}`, item.id, {
      reviewNotes: reviewNotes ?? null,
      nextState,
    });

    return { item, auditLog: event };
  },

  mergeItem(id: string, targetId?: string) {
    const item = getItemOrThrow(id);
    item.state = "deduped";
    item.warning = targetId ? `تم دمج المادة مع ${targetId}` : "تم تعليم المادة كمكررة.";
    const event = audit("item.merged", item.id, { targetId });
    return { item, auditLog: event };
  },

  archiveItem(id: string, reason?: string) {
    const item = getItemOrThrow(id);
    const removedReportItems = reportItems.filter((entry) => entry.itemId === id).length;
    for (let index = reportItems.length - 1; index >= 0; index -= 1) {
      if (reportItems[index].itemId === id) reportItems.splice(index, 1);
    }
    item.state = "archived";
    item.warning = reason ?? "تمت أرشفة المادة من صفحة التشغيل.";
    const event = audit("item.archived", item.id, { reason: reason ?? null, removedReportItems });
    return { item, auditLog: event, removedReportItems };
  },

  requestCapture(id: string, kind: Exclude<CaptureKind, "evidence_lite">, shouldFail = false) {
    const item = getItemOrThrow(id);
    const budget = checkBudget(usageLimit, usage, { type: "screenshot", units: 1 });
    if (!budget.allowed) {
      return { allowed: false as const, budget };
    }

    item.state = "capture_pending";
    usage = {
      ...usage,
      screenshotsThisMonth: usage.screenshotsThisMonth + 1,
      storageMb: usage.storageMb + 2,
    };

    let screenshotUrl = evidenceCardUrl(id);
    if (!shouldFail && item.originalUrl && isSafePublicHttpUrl(item.originalUrl)) {
      screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(item.originalUrl)}&screenshot=true&embed=screenshot.url`;
    }

    const capture: Capture = shouldFail
      ? {
          id: crypto.randomUUID(),
          itemId: id,
          kind,
          status: "failed",
          failureReason: "تعذر التقاط الصفحة في البيئة التجريبية.",
        }
      : {
          id: crypto.randomUUID(),
          itemId: id,
          kind,
          status: "success",
          capturedAt: now(),
          assetUrl: screenshotUrl,
        };

    captures.unshift(capture);
    if (capture.status === "success" && kind === "report_grade") {
      item.hasReportGradeCapture = true;
      item.state = "report_ready";
      item.warning = undefined;
    } else if (capture.status === "failed") {
      item.state = "capture_failed";
      item.warning = "فشل الالتقاط. يمكن إعادة المحاولة أو رفع لقطة يدويًا.";
    }

    const event = audit("capture.requested", capture.id, {
      itemId: id,
      kind,
      status: capture.status,
    });

    return { allowed: true as const, item, capture, auditLog: event, usage };
  },

  addReportItem(reportId: string, itemId: string, warningAccepted = false) {
    const report = reports.find((entry) => entry.id === reportId);
    if (!report) return { ok: false as const, error: "report_not_found" };

    const item = getItemOrThrow(itemId);
    if (item.state !== "report_ready" && !(warningAccepted && item.state === "capture_failed")) {
      return {
        ok: false as const,
        error: "item_not_report_ready",
        warning: "لا تدخل المادة التقرير إلا بعد capture أو موافقة صريحة بتحذير.",
      };
    }

    const existing = reportItems.find((entry) => entry.reportId === reportId && entry.itemId === itemId);
    if (existing) return { ok: true as const, reportItem: existing, duplicate: true };

    const reportItem: ReportItem = {
      id: crypto.randomUUID(),
      reportId,
      itemId,
      warningAccepted,
      addedAt: now(),
    };
    reportItems.unshift(reportItem);
    item.state = "added_to_report";
    audit("report.item_added", reportItem.id, { reportId, itemId, warningAccepted });
    return { ok: true as const, reportItem, duplicate: false };
  },

  publishReport(reportId: string) {
    const report = reports.find((entry) => entry.id === reportId);
    if (!report) return { ok: false as const, error: "report_not_found" };
    report.status = "published";
    report.publishedAt = now();
    report.secureUrl = `/reports/${report.id}`;
    audit("report.published", report.id);
    return { ok: true as const, report };
  },

  async createShareLink(reportId: string, input?: { maxViews?: number; expiresInDays?: number }) {
    const report = reports.find((entry) => entry.id === reportId);
    if (!report) return { ok: false as const, error: "report_not_found" };

    const token = crypto.randomUUID().replaceAll("-", "");
    const link: ShareLink = {
      id: crypto.randomUUID(),
      reportId,
      tokenHash: `sha256:${await sha256(token)}`,
      expiresAt:
        typeof input?.expiresInDays === "number"
          ? new Date(Date.now() + 1000 * 60 * 60 * 24 * input.expiresInDays).toISOString()
          : null,
      revokedAt: null,
      maxViews: input?.maxViews,
      viewCount: 0,
      noindex: true,
      watermark: true,
      createdAt: now(),
      lastViewedAt: null,
    };
    shareLinks.unshift(link);
    audit("share_link.created", link.id, { reportId });
    return { ok: true as const, link, token };
  },

  async revokeShareLink(token: string) {
    const tokenHash = `sha256:${await sha256(token)}`;
    const link = shareLinks.find((entry) => entry.tokenHash === tokenHash);
    if (!link) return { ok: false as const, error: "share_link_not_found" };

    link.revokedAt = now();
    audit("share_link.revoked", link.id, { reportId: link.reportId });
    return { ok: true as const, link };
  },

  async revokeShareLinkById(id: string) {
    const link = shareLinks.find((entry) => entry.id === id);
    if (!link) return { ok: false as const, error: "share_link_not_found" };

    link.revokedAt = now();
    audit("share_link.revoked", link.id, { reportId: link.reportId, revokedBy: "id" });
    return { ok: true as const, link };
  },

  async resolveShareLink(token: string) {
    const tokenHash = `sha256:${await sha256(token)}`;
    const link = shareLinks.find((entry) => entry.tokenHash === tokenHash);
    if (!link) return { ok: false as const, error: "share_link_not_found" };
    if (link.revokedAt) return { ok: false as const, error: "share_link_revoked" };
    if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) {
      return { ok: false as const, error: "share_link_expired" };
    }
    if (typeof link.maxViews === "number" && link.viewCount >= link.maxViews) {
      return { ok: false as const, error: "share_link_view_limit_reached" };
    }

    const report = reports.find((entry) => entry.id === link.reportId);
    if (!report) return { ok: false as const, error: "report_not_found" };

    link.viewCount += 1;
    link.lastViewedAt = now();
    audit("share_link.viewed", link.id, { reportId: link.reportId, viewCount: link.viewCount });
    return { ok: true as const, link, report };
  },

  runConnector(type: SourceType) {
    const budget = checkBudget(
      usageLimit,
      usage,
      type === "x_recent_search" ? { type: "x_read", units: 100 } : { type: "storage_mb", units: 1 },
    );
    if (!budget.allowed) return { ok: false as const, budget };

    if (type === "x_recent_search" || type === "x_filtered_stream") {
      const run: ConnectorRun = {
        id: crypto.randomUUID(),
        connector: type,
        status: "not_configured",
        startedAt: now(),
        finishedAt: now(),
      };
      connectorRuns.unshift(run);
      return { ok: true as const, run, budget };
    }

    const run: ConnectorRun = {
      id: crypto.randomUUID(),
      connector: type,
      status: "queued",
      cursor: { lastFetchedAt: now() },
      startedAt: now(),
    };
    connectorRuns.unshift(run);
    audit("connector.run_queued", run.id, { connector: type });
    return { ok: true as const, run, budget };
  },
};
