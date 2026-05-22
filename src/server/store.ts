import { canonicalizeUrl, explainKeywordMatch, makeDedupeKey, type IngestedItem } from "@/lib/connectors";
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
  SourceValidationError,
  type SourceCreateInput,
} from "@/server/source-validation";
import { TikTokResearchConnector } from "@/lib/connectors/tiktok/research";
import { InstagramPublicProfileConnector } from "@/lib/connectors/instagram/public-profile";
import {
  buildRssIngestionItem,
  evaluateRssEntryRelevance,
  fetchRssFeed,
  type RssIngestionItem,
} from "@/server/rss-ingestion";
import { XSearchManager } from "@/lib/x/search-manager";
import { canonicalizeXUrl } from "@/lib/x/parser";
import type { XSearchRunResult } from "@/lib/x/types";
import type {
  Capture,
  CaptureKind,
  HealthMetric,
  ItemState,
  KeywordRule,
  MonitoringItem,
  Source,
  SourceType,
  SourceRule,
  Job,
  ConnectorRun,
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

type LocalLegacyConnectorRun = {
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
  extraction?: Record<string, unknown>;
  sourceType?: "manual_url" | "x_recent_search";
  sourceName?: string;
  discoveryMethod?: MonitoringItem["discoveryMethod"];
};

type ItemCorrectionInput = {
  title?: string;
  summary?: string;
  authorName?: string;
  authorHandle?: string;
  publishedAt?: string;
  originalUrl?: string;
};

type RssIngestOptions = {
  fetcher?: typeof fetch;
};

const items = seedItems.map((item) => ({ ...item }));
const captures = seedCaptures.map((capture) => ({ ...capture }));
const sources = seedSources.map((source) => ({ ...source }));
const reports = seedReports.map((report) => ({ ...report }));
const keywordRulesState = keywordRules.map((rule) => ({ ...rule }));
const reportItems: ReportItem[] = [];
const auditLogs: AuditEvent[] = [];
const shareLinks: ShareLink[] = [];
const connectorRuns: LocalLegacyConnectorRun[] = [];
let xSearchLastRun: XSearchRunResult | null = null;
const sourceRulesState: SourceRule[] = [];
const jobsState: Job[] = [];
const schedulerConnectorRunsState: ConnectorRun[] = [];

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

function normalizeTerms(terms: string[] | undefined) {
  return Array.from(new Set((terms ?? []).map((term) => term.trim()).filter(Boolean)));
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

function isManualOrXSearchItem(item: MonitoringItem) {
  return item.sourceType === "manual_url" || item.sourceType === "x_recent_search";
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
  if (item.state === "archived" || item.state === "rejected") {
    const rule = keywordRules[0];
    const match = explainKeywordMatch(`${input.title ?? item.title} ${input.text ?? item.summary} ${canonicalUrl}`, rule);
    item.state = match.score > 0 ? "needs_review" : "candidate";
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

function isWorkflowItem(item: MonitoringItem) {
  return (item.sourceType === "manual_url" || item.sourceType === "rss" || item.sourceType === "x_recent_search") && item.state !== "archived";
}

function latestWorkflowItemIds(limit = 48) {
  return items
    .filter(isWorkflowItem)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, limit)
    .map((item) => item.id);
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
    keywordRulesState.splice(0, keywordRulesState.length, ...keywordRules.map((rule) => ({ ...rule })));
    sourceRulesState.splice(0, sourceRulesState.length);
    jobsState.splice(0, jobsState.length);
    schedulerConnectorRunsState.splice(0, schedulerConnectorRunsState.length);
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
        x_recent_search: xSearchLastRun ? "healthy" : "ready",
      },
      usage,
      xSearchLastRun,
    };
  },

  listItems() {
    return items;
  },

  listSources() {
    return sources;
  },

  async listSourceRules(organizationId: string) {
    return sourceRulesState.filter((rule) => rule.organizationId === organizationId);
  },

  async upsertSourceRule(input: Partial<SourceRule> & { organizationId: string; topicId: string; type: SourceType }) {
    const id = input.id ?? crypto.randomUUID();
    const existingIndex = sourceRulesState.findIndex((r) => r.id === id);
    const rule: SourceRule = {
      id,
      organizationId: input.organizationId,
      topicId: input.topicId,
      sourceId: input.sourceId ?? null,
      type: input.type,
      query: input.query ?? null,
      url: input.url ?? null,
      cursor: input.cursor ?? null,
      active: input.active ?? true,
      createdAt: existingIndex >= 0 ? sourceRulesState[existingIndex].createdAt : now(),
      keywordRule: input.keywordRule,
    };
    if (existingIndex >= 0) {
      sourceRulesState[existingIndex] = rule;
    } else {
      sourceRulesState.push(rule);
    }
    return rule;
  },

  async deleteSourceRule(id: string) {
    const index = sourceRulesState.findIndex((r) => r.id === id);
    if (index >= 0) {
      sourceRulesState.splice(index, 1);
      return true;
    }
    return false;
  },

  listKeywordRules() {
    return keywordRulesState
      .filter((rule) => !rule.activeTo || new Date(rule.activeTo).getTime() >= Date.now())
      .sort((a, b) => b.priority - a.priority || b.version - a.version);
  },

  upsertKeywordRule(input: Partial<KeywordRule>) {
    const current = keywordRulesState[0] ?? keywordRules[0];
    const next: KeywordRule = {
      ...current,
      ...input,
      id: typeof input.id === "string" && input.id ? input.id : current.id,
      requiredTerms: normalizeTerms(input.requiredTerms ?? current.requiredTerms),
      optionalTerms: normalizeTerms(input.optionalTerms ?? current.optionalTerms),
      excludeTerms: normalizeTerms(input.excludeTerms ?? current.excludeTerms),
      language: input.language ?? current.language,
      priority: Number.isInteger(input.priority) ? input.priority! : current.priority,
      activeFrom: input.activeFrom ?? current.activeFrom,
      activeTo: input.activeTo,
      version: (current.version ?? 1) + 1,
    };
    const index = keywordRulesState.findIndex((rule) => rule.id === next.id);
    if (index >= 0) keywordRulesState[index] = next;
    else keywordRulesState.unshift(next);
    audit("keyword_rule.updated", next.id, { requiredTerms: next.requiredTerms.length, optionalTerms: next.optionalTerms.length });
    return next;
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

  updateSourceSchedule(id: string, input: { isActive?: boolean; pollIntervalMinutes?: number }) {
    const source = sources.find((entry) => entry.id === id);
    if (!source) throw new Error("source_not_found");

    if (typeof input.isActive === "boolean") source.isActive = input.isActive;
    if (typeof input.pollIntervalMinutes === "number") {
      if (!Number.isInteger(input.pollIntervalMinutes) || input.pollIntervalMinutes < 15 || input.pollIntervalMinutes > 10080) {
        throw new SourceValidationError("poll_interval_minutes must be between 15 and 10080");
      }
      source.pollIntervalMinutes = input.pollIntervalMinutes;
    }

    audit("source.schedule_updated", source.id, {
      isActive: source.isActive,
      pollIntervalMinutes: source.pollIntervalMinutes,
    });
    return source;
  },

  async ingestRssSource(sourceId: string, options: RssIngestOptions = {}) {
    const source = getRssSourceOrThrow(sourceId);
    const checkedAt = now();
    source.lastCheckedAt = checkedAt;

    try {
      const feed = await fetchRssFeed(source.feedUrl!, options.fetcher);
      const rule = this.listKeywordRules()[0] ?? keywordRules[0];
      let created = 0;
      let duplicates = 0;
      let failed = 0;
      let skipped = 0;
      const createdItems: MonitoringItem[] = [];

      for (const entry of feed.entries) {
        try {
          if (!evaluateRssEntryRelevance(entry, rule).ok) {
            skipped += 1;
            continue;
          }

          const ingested = buildRssIngestionItem(source, entry, checkedAt, rule);
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
        skipped,
        failed,
      });

      return {
        source,
        feed,
        fetched: feed.entries.length,
        created,
        duplicates,
        skipped,
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
    const sourceType = input.sourceType ?? "manual_url";
    const discoveryMethod = input.discoveryMethod ?? (sourceType === "x_recent_search" ? "auto_search" : "manual");
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
      sourceType,
    );
    let duplicateType: "url" | "content" | null = null;
    let duplicate = items.find((entry) => isManualOrXSearchItem(entry) && isSameManualUrl(entry, dedupeKey, canonicalUrl));
    if (duplicate) {
      duplicateType = "url";
    }

    if (!duplicate && input.text && input.text.trim().length > 30) {
      const inputTrimmed = input.text.trim();
      duplicate = items.find((entry) => {
        if (!isManualOrXSearchItem(entry)) return false;
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
      sourceId: sourceType === "manual_url" ? "src-manual" : "src-x-search",
      sourceName: input.sourceName ?? (sourceType === "x_recent_search" ? input.authorHandle ?? sourceLabel(sourceType) : "إدخال يدوي"),
      sourceType,
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
      discoveryMethod,
    };

    items.unshift(item);
    const evidence = createEvidenceLiteCapture(item.id);
    audit(sourceType === "x_recent_search" ? "item.auto_discovered" : "item.ingested", item.id, { sourceType, evidenceId: evidence.id });
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

  updateItem(id: string, input: ItemCorrectionInput) {
    const item = getItemOrThrow(id);
    const previous = {
      title: item.title,
      summary: item.summary,
      authorName: item.authorName,
      authorHandle: item.authorHandle,
      publishedAt: item.publishedAt,
      originalUrl: item.originalUrl,
    };
    const changed: string[] = [];

    if (typeof input.title === "string" && input.title.trim() && input.title.trim() !== item.title) {
      item.title = input.title.trim();
      changed.push("title");
    }
    if (typeof input.summary === "string" && input.summary.trim() && input.summary.trim() !== item.summary) {
      item.summary = input.summary.trim();
      item.summarySourceText = input.summary.trim();
      changed.push("summary");
    }
    if (typeof input.authorName === "string" && input.authorName.trim() && input.authorName.trim() !== item.authorName) {
      item.authorName = input.authorName.trim();
      changed.push("authorName");
    }
    if (typeof input.authorHandle === "string") {
      const nextHandle = input.authorHandle.trim() || undefined;
      if (nextHandle !== item.authorHandle) {
        item.authorHandle = nextHandle;
        changed.push("authorHandle");
      }
    }
    if (typeof input.publishedAt === "string" && input.publishedAt.trim()) {
      const timestamp = Date.parse(input.publishedAt);
      if (!Number.isNaN(timestamp)) {
        const nextPublishedAt = new Date(timestamp).toISOString();
        if (nextPublishedAt !== item.publishedAt) {
          item.publishedAt = nextPublishedAt;
          changed.push("publishedAt");
        }
      }
    }
    if (typeof input.originalUrl === "string" && input.originalUrl.trim()) {
      const canonicalUrl = canonicalizeUrl(input.originalUrl.trim());
      if (isSafePublicHttpUrl(canonicalUrl) && canonicalUrl !== item.originalUrl) {
        item.originalUrl = canonicalUrl;
        changed.push("originalUrl");
      }
    }

    if (changed.length) {
      const match = explainKeywordMatch(`${item.title} ${item.summary} ${item.originalUrl}`, keywordRules[0]);
      item.relevanceScore = match.score;
      item.relevanceReason = match.reason;
      item.matchedTerms = match.matchedTerms;
      item.sentiment = estimateSentiment(match.score);
      item.sentimentConfidence = Math.max(50, Math.min(95, match.score));
    }

    const auditLog = audit("item.corrected", item.id, {
      changed,
      previous,
    });
    return { item, auditLog, changed };
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

  archiveWorkflowItems(input?: { ids?: string[]; limit?: number; reason?: string }) {
    const explicitIds = Array.from(new Set((input?.ids ?? []).filter(Boolean)));
    const limit = Math.max(1, Math.min(48, Math.trunc(input?.limit ?? 48)));
    const targetIds = explicitIds.length ? explicitIds : latestWorkflowItemIds(limit);
    let removedReportItems = 0;
    const archivedIds: string[] = [];
    const reason = input?.reason ?? "تنظيف مواد التشغيل الظاهرة من صفحة إضافة ومراجعة المحتوى.";

    for (const id of targetIds) {
      const item = items.find((entry) => entry.id === id);
      if (!item || !isWorkflowItem(item)) continue;
      const result = this.archiveItem(id, reason);
      removedReportItems += result.removedReportItems;
      archivedIds.push(id);
    }

    const event = audit("items.workflow_archived", "workflow-items", {
      requested: targetIds.length,
      archived: archivedIds.length,
      removedReportItems,
    });

    return {
      archived: archivedIds.length,
      requested: targetIds.length,
      removedReportItems,
      itemIds: archivedIds,
      auditLog: event,
    };
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

    if (type === "x_filtered_stream") {
      const run: LocalLegacyConnectorRun = {
        id: crypto.randomUUID(),
        connector: type,
        status: "not_configured",
        startedAt: now(),
        finishedAt: now(),
      };
      connectorRuns.unshift(run);
      return { ok: true as const, run, budget };
    }

    const run: LocalLegacyConnectorRun = {
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

  /**
   * Run an X search cycle using XSearchManager.
   * Discovers tweets about Hidayathon, deduplicates, and ingests new items.
   */
  async runXSearch() {
    const budget = checkBudget(usageLimit, usage, { type: "x_read", units: 50 });
    if (!budget.allowed) {
      return { ok: false as const, error: "budget_exceeded", budget };
    }

    const manager = new XSearchManager({
      X_SEARCH_PROVIDER_TYPE: process.env.X_SEARCH_PROVIDER_TYPE,
      XAI_API_KEY: process.env.XAI_API_KEY,
    });

    const rule = keywordRulesState[0];
    if (!rule) {
      return { ok: false as const, error: "no_keyword_rules" };
    }

    // Build existing URLs set for dedup
    const existingUrls = new Set(
      items
        .filter((item) => item.sourceType?.startsWith("x_") || item.originalUrl?.includes("x.com"))
        .map((item) => canonicalizeXUrl(item.originalUrl ?? "")),
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

    // Track the run result
    xSearchLastRun = runResult;

    // Ingest each new discovered tweet as a monitoring item
    const ingestedItems: MonitoringItem[] = [];
    for (const result of results) {
      const matchResult = explainKeywordMatch(result.text, rule);

      const newItem: MonitoringItem = {
        id: crypto.randomUUID(),
        sourceId: "src-x-search",
        sourceName: result.authorHandle,
        sourceType: "x_recent_search",
        state: "needs_review" as ItemState,
        title: result.text.slice(0, 120),
        summary: result.text,
        summarySourceText: result.text,
        sentiment: "neutral" as MonitoringItem["sentiment"],
        sentimentConfidence: 0.5,
        originalUrl: result.tweetUrl,
        publishedAt: result.publishedAt ?? now(),
        authorName: result.authorHandle.replace(/^@/u, ""),
        authorHandle: result.authorHandle,
        relevanceScore: matchResult.score,
        relevanceReason: matchResult.reason,
        matchedTerms: matchResult.matchedTerms,
        dedupeKey: `x-search:${result.tweetId}`,
        hasReportGradeCapture: false,
        discoveryMethod: "auto_search",
      };

      items.unshift(newItem);
      ingestedItems.push(newItem);
      audit("item.auto_discovered", newItem.id, {
        tweetUrl: result.tweetUrl,
        provider: runResult.provider,
        relevanceScore: matchResult.score,
      });
    }

    // Update usage
    usage = { ...usage, xReadsToday: usage.xReadsToday + 1, xReadsThisMonth: usage.xReadsThisMonth + 1 };

    const connectorRun: LocalLegacyConnectorRun = {
      id: crypto.randomUUID(),
      connector: "x_recent_search",
      status: "success",
      cursor: { lastSearchedAt: now(), discoveredCount: results.length },
      startedAt: runResult.searchedAt,
      finishedAt: now(),
    };
    connectorRuns.unshift(connectorRun);

    return {
      ok: true as const,
      runResult,
      ingestedCount: ingestedItems.length,
      items: ingestedItems,
      budget,
    };
  },

  async listJobs(organizationId?: string) {
    if (organizationId) {
      return jobsState.filter((j) => j.organizationId === organizationId);
    }
    return jobsState;
  },

  async listConnectorRuns(organizationId?: string) {
    if (organizationId) {
      return schedulerConnectorRunsState.filter((r) => r.organizationId === organizationId);
    }
    return schedulerConnectorRunsState;
  },

  async findDueSourceRules(organizationId?: string, nowStr?: string) {
    const referenceTime = nowStr ? new Date(nowStr) : new Date();
    let rules = sourceRulesState.filter((r) => r.active);
    if (organizationId) {
      rules = rules.filter((r) => r.organizationId === organizationId);
    }
    const dueRules: SourceRule[] = [];
    for (const rule of rules) {
      let pollIntervalMinutes = 60;
      if (rule.sourceId) {
        const src = sources.find((s) => s.id === rule.sourceId);
        if (src && src.pollIntervalMinutes) {
          pollIntervalMinutes = src.pollIntervalMinutes;
        }
      }
      // Find latest finished connector run for this rule
      const completedRuns = schedulerConnectorRunsState
        .filter((r) => r.sourceRuleId === rule.id && r.finishedAt)
        .sort((a, b) => new Date(b.finishedAt!).getTime() - new Date(a.finishedAt!).getTime());

      const latestRun = completedRuns[0];
      if (!latestRun) {
        dueRules.push(rule);
      } else {
        const elapsedMs = referenceTime.getTime() - new Date(latestRun.finishedAt!).getTime();
        if (elapsedMs >= pollIntervalMinutes * 60 * 1000) {
          dueRules.push(rule);
        }
      }
    }
    return dueRules;
  },

  async enqueueConnectorJob(rule: SourceRule, nowStr?: string) {
    const time = nowStr ? new Date(nowStr) : new Date();
    const year = time.getUTCFullYear();
    const month = String(time.getUTCMonth() + 1).padStart(2, "0");
    const day = String(time.getUTCDate()).padStart(2, "0");
    const hour = String(time.getUTCHours()).padStart(2, "0");
    const idempotencyKey = `rule:${rule.id}:${year}-${month}-${day}-${hour}`;

    const existingJob = jobsState.find(
      (j) => j.organizationId === rule.organizationId && j.idempotencyKey === idempotencyKey
    );
    if (existingJob) {
      return existingJob;
    }

    const jobId = crypto.randomUUID();
    const job: Job = {
      id: jobId,
      organizationId: rule.organizationId,
      jobType: "connector_poll",
      status: "queued",
      idempotencyKey,
      attempts: 0,
      payload: { ruleId: rule.id },
      failureReason: null,
      availableAt: nowStr || now(),
      createdAt: nowStr || now(),
    };
    jobsState.push(job);

    const runId = crypto.randomUUID();
    const run: ConnectorRun = {
      id: runId,
      organizationId: rule.organizationId,
      sourceRuleId: rule.id,
      status: "queued",
      cursorBefore: rule.cursor,
      cursorAfter: null,
      fetchedCount: 0,
      failureReason: null,
      startedAt: nowStr || now(),
      finishedAt: null,
    };
    schedulerConnectorRunsState.unshift(run);

    return job;
  },

  async runConnectorJob(jobId: string, nowStr?: string) {
    const job = jobsState.find((j) => j.id === jobId);
    if (!job) throw new Error("job_not_found");
    if (job.status !== "queued" && job.status !== "failed") {
      return job;
    }
    job.status = "running";
    job.attempts += 1;

    const ruleId = job.payload.ruleId as string;
    const rule = sourceRulesState.find((r) => r.id === ruleId);
    if (!rule) {
      job.status = "failed";
      job.failureReason = "source_rule_not_found";
      return job;
    }

    let run = schedulerConnectorRunsState.find((r) => r.sourceRuleId === ruleId && r.status === "queued");
    if (!run) {
      run = {
        id: crypto.randomUUID(),
        organizationId: job.organizationId,
        sourceRuleId: ruleId,
        status: "running",
        cursorBefore: rule.cursor,
        cursorAfter: null,
        fetchedCount: 0,
        failureReason: null,
        startedAt: nowStr || now(),
        finishedAt: null,
      };
      schedulerConnectorRunsState.unshift(run);
    } else {
      run.status = "running";
      run.startedAt = nowStr || now();
    }

    try {
      let fetched: IngestedItem[] = [];
      if (rule.type === "tiktok_research") {
        const connector = new TikTokResearchConnector();
        fetched = await connector.fetch(rule, rule.cursor);
      } else if (rule.type === "instagram_public_profile") {
        const connector = new InstagramPublicProfileConnector();
        fetched = await connector.fetch(rule, rule.cursor);
      } else {
        throw new Error(`unsupported_connector_type:${rule.type}`);
      }

      const activeRules = await this.listKeywordRules();
      const activeRule = activeRules[0] || keywordRulesState[0] || keywordRules[0];

      let insertedCount = 0;
      const parsedItems: MonitoringItem[] = [];

      for (const rawItem of fetched) {
        const relevance = explainKeywordMatch(`${rawItem.title} ${rawItem.text} ${rawItem.url}`, activeRule);
        if (relevance.score < 35) {
          continue;
        }

        const dedupeKey = makeDedupeKey(rawItem, rule.type);
        const duplicate = items.some((i) => i.dedupeKey === dedupeKey || i.originalUrl === rawItem.url);
        if (duplicate) {
          continue;
        }

        const newItem: MonitoringItem = {
          id: crypto.randomUUID(),
          sourceId: rule.sourceId || "watchlist",
          sourceName: rawItem.authorName || "Watchlist",
          sourceType: rule.type,
          state: "needs_review",
          title: rawItem.title,
          originalUrl: rawItem.url,
          authorName: rawItem.authorName ?? "غير محدد",
          authorHandle: rawItem.authorHandle ?? undefined,
          publishedAt: rawItem.publishedAt,
          summary: rawItem.text,
          summarySourceText: rawItem.text,
          sentiment: estimateSentiment(relevance.score),
          sentimentConfidence: Math.max(50, Math.min(95, relevance.score)),
          relevanceScore: relevance.score,
          relevanceReason: relevance.reason,
          matchedTerms: relevance.matchedTerms,
          dedupeKey,
          hasReportGradeCapture: false,
          sourceItemId: rawItem.sourceItemId,
          raw_response: rawItem.raw,
          discoveryMethod: "auto_search",
          organizationId: rule.organizationId,
          topicId: rule.topicId,
        };

        items.unshift(newItem);
        parsedItems.push(newItem);
        insertedCount += 1;

        audit("item.ingested", newItem.id, {
          sourceType: rule.type,
          sourceId: rule.sourceId,
          canonicalUrl: rawItem.url,
        });
      }

      let nextCursor = rule.cursor;
      if (fetched.length > 0) {
        const sorted = [...fetched].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
        const latest = sorted[0];
        if (rule.type === "tiktok_research") {
          nextCursor = { search_id: latest.sourceItemId };
        } else if (rule.type === "instagram_public_profile") {
          nextCursor = { lastPublishedAt: latest.publishedAt };
        }
      }

      rule.cursor = nextCursor;
      job.status = "succeeded";
      job.failureReason = null;

      run.status = "success";
      run.cursorAfter = nextCursor;
      run.fetchedCount = insertedCount;
      run.finishedAt = nowStr || now();
      return job;
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      job.status = "failed";
      job.failureReason = errorMsg;

      run.status = "failed";
      run.failureReason = errorMsg;
      run.finishedAt = nowStr || now();
      return job;
    }
  },
};
