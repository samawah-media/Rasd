"use client";

import { useEffect, useMemo, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Camera,
  Check,
  CircleCheck,
  Eye,
  Filter,
  Globe,
  Link as LinkIcon,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import type { Capture, HealthMetric, MonitoringItem, ReportVersion, Source } from "@/lib/types";
import AppShell from "@/components/AppShell";
import { BrandIcon, brandFromLabel } from "@/components/BrandIcon";
import { isValidXUrl } from "@/lib/x/parser";

type MessageType = "success" | "error" | "info" | "warning";
type WorkTab = "active" | "review" | "capture" | "report" | "done";
type IntakeMode = "manual" | "x-search" | "sources";
type PlatformFilter = "all" | "news" | "tiktok" | "instagram" | "x";

type ApiState = {
  items: MonitoringItem[];
  sources: Source[];
  metrics: HealthMetric[];
  capturesByItem: Record<string, Capture[]>;
  liveReport: ReportVersion | null;
  usage?: {
    xReadsToday: number;
    xReadsThisMonth: number;
    aiTokensThisMonth: number;
    screenshotsThisMonth: number;
    storageMb: number;
  };
  connectors?: {
    manual_url: string;
    rss: string;
    web_page: string;
    x_oembed: string;
    x_recent_search: string;
  };
  xSearchLastRun?: {
    provider: string;
    newItems: number;
    duplicateSkipped: number;
    searchedAt: string;
    durationMs: number;
  } | null;
};

type IntakeResponse = {
  item: MonitoringItem;
  duplicate?: boolean;
  duplicateType?: "url" | "content" | null;
  metadata?: {
    source: "x_oembed" | "yt_dlp_metadata" | "apify_metadata" | "html_metadata" | "url_only";
    warning?: string;
  } | null;
};

type WorkflowCleanupResponse = {
  cleanup: {
    archived: number;
    requested: number;
    removedReportItems: number;
    itemIds: string[];
  };
};

type XSearchResponse = {
  ok: boolean;
  results?: Array<{ tweetUrl: string }>;
  runResult?: {
    provider: string;
    newItems: number;
    duplicateSkipped: number;
    searchedAt: string;
    durationMs: number;
  };
  items?: MonitoringItem[];
  storage?: {
    created: number;
    duplicates: number;
    failed: number;
  };
  error?: string;
};

type SourcePollActiveResponse = {
  poll: {
    sources: number;
    fetched: number;
    created: number;
    duplicates: number;
    skipped: number;
    failed: number;
    runs: Array<Record<string, unknown>>;
  };
};

const emptyState: ApiState = {
  items: [],
  sources: [],
  metrics: [],
  capturesByItem: {},
  liveReport: null,
  usage: {
    xReadsToday: 0,
    xReadsThisMonth: 0,
    aiTokensThisMonth: 0,
    screenshotsThisMonth: 0,
    storageMb: 0,
  },
  connectors: {
    manual_url: "not_configured",
    rss: "not_configured",
    web_page: "not_configured",
    x_oembed: "not_configured",
    x_recent_search: "not_configured",
  },
};

const arabicApiErrors: Record<string, string> = {
  auth_required: "انتهت الجلسة. سجّل دخولك مجددًا.",
  insufficient_role: "ليس لديك صلاحية لهذا الإجراء.",
  api_route_not_found_or_not_authorized: "المسار غير موجود أو غير مصرح.",
  url_is_required: "الصق رابطًا صحيحًا.",
  item_not_found: "المادة غير موجودة.",
  item_not_report_ready: "المادة ليست جاهزة للتقرير بعد.",
  report_not_found: "التقرير غير موجود.",
  budget_exceeded: "تم تجاوز حد الاستخدام المسموح.",
  source_not_found: "المصدر غير موجود.",
  source_not_rss: "هذا المصدر ليس مصدر RSS.",
  source_poll_failed: "تعذر تشغيل المصدر.",
  "feed_url is required for RSS sources": "أدخل رابط RSS.",
  "feed_url must be a public http or https URL": "رابط RSS يجب أن يكون عامًا ويبدأ بـ http أو https.",
  "poll_interval_minutes must be between 15 and 10080": "مدة الفحص غير صحيحة.",
  "credibility must be supported": "تصنيف المصدر غير مدعوم.",
  "type must be a supported source type": "نوع المصدر غير مدعوم.",
  rss_fetch_failed: "تعذر جلب موجز RSS.",
  rss_fetch_timeout: "انتهت مهلة جلب موجز RSS.",
  rss_parse_failed: "هذا ليس موجز RSS. لاختبار خبر واحد استخدم خانة رابط مادة واحدة بالأعلى.",
  rss_feed_empty: "موجز RSS فارغ.",
  rss_feed_too_large: "موجز RSS كبير جدًا.",
  request_failed: "تعذر إتمام الطلب. حاول مرة أخرى.",
  archive_failed: "تعذرت أرشفة المادة.",
  xai_api_key_missing: "محرك بحث X الحقيقي غير مفعّل. أضف XAI_API_KEY أو استخدم mock_search للتجربة.",
  x_search_provider_not_ready: "محرك بحث X غير جاهز. راجع صفحة صحة الخوادم أو إعدادات Vercel.",
  no_keyword_rules_configured: "لا توجد قاعدة كلمات مفتاحية لتشغيل البحث.",
  search_failed: "تعذر تشغيل بحث X.",
};

function arabicError(key: string): string {
  if (key.startsWith("xai_no_credits")) return "محرك XAI لا يملك رصيدًا كافيًا لتشغيل بحث X.";
  if (key.startsWith("xai_api_error")) return "تعذر الاتصال بمحرك XAI. راجع مفتاح XAI_API_KEY أو حالة الخدمة.";
  if (key.startsWith("rss_fetch_failed")) return arabicApiErrors.rss_fetch_failed;
  return arabicApiErrors[key] ?? key;
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error("تعذر الاتصال بالسيرفر. تحقق من اتصال الإنترنت وحاول مرة أخرى.");
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("انتهت الجلسة. سجّل دخولك مجددًا.");
    }
    if (contentType.includes("text/html")) {
      throw new Error("انتهت الجلسة أو حدث خطأ في السيرفر. أعد تحميل الصفحة.");
    }
    throw new Error("رد غير متوقع من السيرفر.");
  }

  let data: Record<string, unknown>;
  try {
    data = await response.json();
  } catch {
    throw new Error("لم يرد محتوى صالح من السيرفر. حاول مرة أخرى.");
  }

  if (!response.ok) {
    const errorKey = typeof data.error === "string" ? data.error : "request_failed";
    throw new Error(arabicError(errorKey));
  }

  return data as T;
}

function stateLabel(state: MonitoringItem["state"]) {
  const labels: Record<MonitoringItem["state"], string> = {
    ingested: "تم سحبه",
    normalized: "منظم ومعدل",
    deduped: "مكرر ومستبعد",
    candidate: "مرشح الحين",
    needs_review: "يبي له مراجعة",
    rejected: "مرفوض",
    approved_pending_capture: "بانتظار اللقطة",
    capture_pending: "جاري التقاط الشاشة",
    capture_failed: "فشل تصوير الشاشة",
    report_ready: "جاهز للتقرير",
    added_to_report: "تمت إضافته للتقرير",
    published: "منشور ومكتمل",
    archived: "مؤرشف",
  };
  return labels[state];
}

function statusClass(state: MonitoringItem["state"]) {
  if (state === "added_to_report" || state === "published") return "bg-[#e8f5ef] text-[#0f6b57]";
  if (state === "report_ready") return "bg-[#fff4c2] text-[#765f00]";
  if (state === "capture_failed" || state === "rejected") return "bg-[#fff1ed] text-[#a33a24]";
  if (state === "approved_pending_capture" || state === "capture_pending") return "bg-[#eef4ff] text-[#315f9b]";
  return "bg-[#f0f3ee] text-[#52605a]";
}

function tabForItem(item: MonitoringItem): WorkTab {
  if (item.state === "needs_review" || item.state === "candidate") return "review";
  if (item.state === "approved_pending_capture" || item.state === "capture_pending" || item.state === "capture_failed") {
    return "capture";
  }
  if (item.state === "report_ready") return "report";
  if (item.state === "added_to_report" || item.state === "published") return "done";
  return "active";
}

function sourceLabel(source?: IntakeResponse["metadata"]) {
  if (!source) return "تم حفظ الرابط.";
  if (source.source === "x_oembed") return "تم جلب بيانات التغريدة.";
  if (source.source === "yt_dlp_metadata") return "تم جلب بيانات TikTok/Instagram.";
  if (source.source === "apify_metadata") return "تم جلب بيانات TikTok/Instagram عبر Apify.";
  if (source.source === "html_metadata") return "تم جلب بيانات الصفحة.";
  return "تم حفظ الرابط.";
}

function captureAsset(captures: Capture[] | undefined) {
  return captures?.find(
    (capture) => (capture.kind === "report_grade" || capture.kind === "evidence_lite" || capture.kind === "preview") && capture.status === "success" && capture.assetUrl,
  )?.assetUrl;
}

function platformLabel(item: MonitoringItem) {
  const url = item.originalUrl || "";
  if (url.includes("x.com") || url.includes("twitter.com")) return "X";
  if (url.includes("tiktok.com")) return "TikTok";
  if (url.includes("instagram.com") || url.includes("instagr.am")) return "Instagram";
  if (item.sourceName.includes("خبر") || item.sourceType === "rss") return "خبر";
  return "موقع";
}

function messageClass(type: MessageType) {
  if (type === "error") return "border-[#f1b6aa] bg-[#fff1ed] text-[#8f321d]";
  if (type === "warning") return "border-[#eed478] bg-[#fff8dc] text-[#735d00]";
  if (type === "success") return "border-[#b7ddce] bg-[#ecf7f2] text-[#0f6b57]";
  return "border-[#c7d8f3] bg-[#f1f6ff] text-[#315f9b]";
}

function latestWorkflowItems(items: MonitoringItem[], limit = 48, pinnedId?: string | null) {
  const candidates = items
    .filter((item) => item.sourceType === "manual_url" || item.sourceType === "rss" || item.sourceType === "x_recent_search")
    .filter((item) => item.state !== "archived")
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const limited = candidates.slice(0, limit);
  const pinned = pinnedId ? candidates.find((item) => item.id === pinnedId) : undefined;
  if (!pinned || limited.some((item) => item.id === pinned.id)) return limited;
  return [pinned, ...limited.slice(0, Math.max(0, limit - 1))];
}

export function OpsClient() {
  const [state, setState] = useState<ApiState>(emptyState);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinnedItemId, setPinnedItemId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<MessageType>("info");
  const [tab, setTab] = useState<WorkTab>("active");
  const [, setIntakeMode] = useState<IntakeMode>("manual");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [query, setQuery] = useState("");
  const [searchRunning, setSearchRunning] = useState(false);

  const isXUrl = useMemo(() => isValidXUrl(url), [url]);

  async function triggerXSearch() {
    setSearchRunning(true);
    setIntakeMode("x-search");
    setMessage("جاري تشغيل بحث X...");
    setMessageType("info");
    try {
      const existingXUrls = state.items
        .filter((item) => item.originalUrl?.includes("x.com") || item.originalUrl?.includes("twitter.com"))
        .map((item) => item.originalUrl)
        .filter(Boolean);

      const data = await apiJson<XSearchResponse>("/api/x-search", {
        method: "POST",
        body: JSON.stringify({ existingUrls: existingXUrls }),
      });

      if (data.ok && data.runResult) {
        const created = data.storage?.created ?? data.items?.length ?? data.runResult.newItems;
        const duplicates = data.storage?.duplicates ?? data.runResult.duplicateSkipped;
        const failed = data.storage?.failed ?? 0;
        const firstItem = data.items?.[0];
        if (firstItem) {
          setSelectedId(firstItem.id);
          setPinnedItemId(firstItem.id);
          setTab("active");
        }
        await refreshSilently();
        setMessage(
          `اكتشف بحث X ${data.runResult.newItems} نتيجة، وأضاف ${created} مادة جديدة، وتخطى ${duplicates} مكرر${failed ? `، وفشل حفظ ${failed}` : ""}.`,
        );
        setMessageType("success");
      } else {
        setMessage(data.error ? arabicError(data.error) : "فشل في البحث على X.");
        setMessageType("error");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطأ في الاتصال بمحرك البحث.");
      setMessageType("error");
    } finally {
      setSearchRunning(false);
    }
  }

  const liveReportId = state.liveReport?.id ?? "report-5";

  const workflowItems = useMemo(
    () => latestWorkflowItems(state.items, 48, pinnedItemId ?? selectedId),
    [pinnedItemId, selectedId, state.items],
  );

  const activeRssSources = useMemo(
    () => state.sources.filter((source) => source.type === "rss" && source.isActive && source.feedUrl),
    [state.sources],
  );

  const tabCounts = useMemo(() => {
    const counts: Record<WorkTab, number> = {
      active: workflowItems.length,
      review: 0,
      capture: 0,
      report: 0,
      done: 0,
    };
    workflowItems.forEach((item) => {
      const itemTab = tabForItem(item);
      if (itemTab !== "active") counts[itemTab] += 1;
    });
    return counts;
  }, [workflowItems]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return workflowItems.filter((item) => {
      const matchesTab = tab === "active" || tabForItem(item) === tab;
      const itemPlatform = platformLabel(item).toLowerCase();
      const matchesPlatform =
        platformFilter === "all" ||
        (platformFilter === "news" && (itemPlatform === "خبر" || itemPlatform === "موقع")) ||
        itemPlatform === platformFilter;
      const matchesQuery =
        !normalizedQuery ||
        [item.title, item.summary, item.authorName, item.authorHandle, item.sourceName, item.originalUrl]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesTab && matchesPlatform && matchesQuery;
    });
  }, [workflowItems, platformFilter, query, tab]);

  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) ?? workflowItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null,
    [workflowItems, selectedId, visibleItems],
  );

  async function fetchSnapshot(): Promise<ApiState> {
    const [itemsData, sourcesData, healthData, liveReportData] = await Promise.all([
      apiJson<{ items: MonitoringItem[] }>("/api/items"),
      apiJson<{ sources: Source[] }>("/api/sources"),
      apiJson<{
        metrics: HealthMetric[];
        usage?: ApiState["usage"];
        connectors?: ApiState["connectors"];
        xSearchLastRun?: ApiState["xSearchLastRun"];
      }>("/api/admin/health"),
      apiJson<{ report: ReportVersion }>("/api/reports/hidayathon-live"),
    ]);

    const workflowCandidates = latestWorkflowItems(itemsData.items);

    const capturePairs = await Promise.all(
      workflowCandidates.map(async (item) => {
        const result = await apiJson<{ captures: Capture[] }>(`/api/items/${item.id}/captures`);
        return [item.id, result.captures] as const;
      }),
    );

    return {
      items: itemsData.items,
      sources: sourcesData.sources,
      metrics: healthData.metrics,
      capturesByItem: Object.fromEntries(capturePairs),
      liveReport: liveReportData.report,
      usage: healthData.usage,
      connectors: healthData.connectors,
      xSearchLastRun: healthData.xSearchLastRun,
    };
  }

  async function refresh() {
    setPending("refresh");
    try {
      setState(await fetchSnapshot());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل بيانات التشغيل.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  async function refreshSilently() {
    setState(await fetchSnapshot());
  }

  useEffect(() => {
    let active = true;
    fetchSnapshot()
      .then((snapshot) => {
        if (!active) return;
        setState(snapshot);
        setSelectedId((current) => current ?? latestWorkflowItems(snapshot.items)[0]?.id ?? null);
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "تعذر تحميل بيانات التشغيل.");
        setMessageType("error");
      });
    return () => {
      active = false;
    };
  }, []);

  async function submitUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("manual");
    setIntakeMode("manual");
    setMessage("جاري حفظ الرابط...");
    setMessageType("info");

    try {
      const result = await apiJson<IntakeResponse>("/api/items/manual-url", {
        method: "POST",
        body: JSON.stringify({
          url,
          title: title || undefined,
          text: text || undefined,
          author_name: authorName || undefined,
          published_at: publishedAt || undefined,
        }),
      });

      setSelectedId(result.item.id);
      setPinnedItemId(result.item.id);
      setTab("active");
      setUrl("");
      setTitle("");
      setText("");
      setAuthorName("");
      setPublishedAt("");
      await refreshSilently();

      if (result.duplicate) {
        setMessage(
          result.duplicateType === "content"
            ? "المحتوى موجود مسبقًا. حدّثنا المادة الموجودة وفتحناها لك في القائمة، ويمكنك اعتمادها أو التقاط صورة جديدة أو إضافتها للتقرير."
            : "الرابط موجود مسبقًا. حدّثنا بياناته وفتحناه لك في القائمة، ويمكنك متابعة الاعتماد أو اللقطة أو إضافته للتقرير من تفاصيل المادة.",
        );
        setMessageType("info");
      } else {
        setMessage(sourceLabel(result.metadata));
        setMessageType("success");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حفظ الرابط.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  async function runSourceSearch() {
    setPending("source-search");
    setIntakeMode("sources");
    setMessage("جاري تشغيل المصادر النشطة...");
    setMessageType("info");

    try {
      const result = await apiJson<SourcePollActiveResponse>("/api/sources/poll-active", {
        method: "POST",
        body: JSON.stringify({ limit: 5 }),
      });

      await refreshSilently();
      setTab("active");
      setMessage(
        `فحصنا ${result.poll.sources} مصدر، وجلبنا ${result.poll.fetched} مادة. الجديد ${result.poll.created}، المكرر ${result.poll.duplicates}، المتجاوز ${result.poll.skipped}${result.poll.failed ? `، والفاشل ${result.poll.failed}` : ""}.`,
      );
      setMessageType(result.poll.failed ? "warning" : "success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تشغيل المصادر.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  async function runItemAction(label: string, action: () => Promise<unknown>, successMessage: string) {
    setPending(label);
    setMessage(null);
    try {
      await action();
      await refreshSilently();
      setMessage(successMessage);
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تنفيذ العملية.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  function approveItem(item: MonitoringItem) {
    return runItemAction(
      `approve-${item.id}`,
      () =>
        apiJson(`/api/items/${item.id}/review`, {
          method: "POST",
          body: JSON.stringify({ action: "approve", review_notes: "اعتماد من صفحة التشغيل." }),
        }),
      "تم اعتماد المادة.",
    );
  }

  function captureItem(item: MonitoringItem) {
    return runItemAction(
      `capture-${item.id}`,
      () =>
        apiJson(`/api/items/${item.id}/capture-report-grade`, {
          method: "POST",
          body: JSON.stringify({}),
        }),
      "تم تجهيز اللقطة.",
    );
  }

  function addToReport(item: MonitoringItem) {
    return runItemAction(
      `report-${item.id}`,
      () =>
        apiJson(`/api/reports/${liveReportId}/items`, {
          method: "POST",
          body: JSON.stringify({ item_id: item.id, warning_accepted: true }),
        }),
      "تمت إضافة المادة للتقرير.",
    );
  }

  function archiveItem(item: MonitoringItem) {
    const confirmed = window.confirm("أرشفة هذه المادة؟ ستختفي من صفحة التشغيل وتقرير العميل بدون حذف نهائي.");
    if (!confirmed) return undefined;

    return runItemAction(
      `archive-${item.id}`,
      () =>
        apiJson(`/api/items/${item.id}/archive`, {
          method: "POST",
          body: JSON.stringify({ reason: "أرشفة من صفحة التشغيل." }),
        }),
      "تمت أرشفة المادة وإزالتها من التقرير.",
    );
  }

  async function archiveVisibleItems() {
    if (!visibleItems.length) return;
    const confirmed = window.confirm(
      `تنظيف ${visibleItems.length.toLocaleString("ar-SA")} مادة ظاهرة الآن؟ ستختفي من صفحة التشغيل وتزال من التقرير إن كانت مضافة، بدون لمس أرشيف التقارير القديم.`,
    );
    if (!confirmed) return;

    setPending("archive-visible");
    setMessage("جاري تنظيف المواد الظاهرة...");
    setMessageType("info");

    try {
      const result = await apiJson<WorkflowCleanupResponse>("/api/items/archive-workflow", {
        method: "POST",
        body: JSON.stringify({
          ids: visibleItems.map((item) => item.id),
          reason: "تنظيف المواد الظاهرة من صفحة إضافة ومراجعة المحتوى.",
        }),
      });
      setSelectedId(null);
      setPinnedItemId(null);
      await refreshSilently();
      setMessage(
        `تم تنظيف ${result.cleanup.archived.toLocaleString("ar-SA")} مادة، وإزالة ${result.cleanup.removedReportItems.toLocaleString("ar-SA")} ربط من التقرير.`,
      );
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تنظيف المواد الظاهرة.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  return (
    <AppShell>
      <div className="min-h-screen bg-[var(--color-bg-main)] p-5 md:p-8" dir="rtl">
        {message && (
          <div className={`mb-4 rounded-lg border p-3 text-xs font-bold flex items-center justify-between shadow-sm ${messageClass(messageType)}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{message}</span>
            </div>
            <button type="button" onClick={() => setMessage(null)} className="text-[10px] underline font-extrabold hover:text-[#2383E2]">
              إغلاق
            </button>
          </div>
        )}

        <div className="mx-auto max-w-6xl">
          <section className="rounded-lg border border-[var(--color-border)] bg-white shadow-sm">
            <PanelHeader
              title="الرصد اليومي"
              description="هنا يتم عرض المواد الجديدة التي تم اكتشافها من جميع المصادر في الوقت الحقيقي."
              icon={BarChart3}
            >
              <button
                type="button"
                onClick={refresh}
                disabled={pending !== null}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-3 text-xs font-extrabold text-[var(--color-text-title)] transition hover:border-[#2563eb]/40 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${pending === "refresh" ? "animate-spin" : ""}`} />
                تحديث
              </button>
            </PanelHeader>
            <div className="space-y-4 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="بحث سريع في المواد..."
                  className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-white pr-8 pl-3 text-xs font-semibold outline-none transition focus:border-[#2563eb]"
                />
              </div>

              <button
                type="button"
                onClick={runSourceSearch}
                disabled={pending !== null || searchRunning || activeRssSources.length === 0}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#2563eb] px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#1d4ed8] disabled:opacity-50"
              >
                {pending === "source-search" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                افحص الآن
              </button>

              <form onSubmit={submitUrl} className="grid gap-2 rounded-lg border border-[#dbeafe] bg-[#f8fbff] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#1d4f8f]">
                    <LinkIcon className="h-3.5 w-3.5" />
                    رصد رابط يدوي
                  </span>
                  <span className="text-[10px] font-semibold text-[var(--color-text-muted)]">TikTok / Instagram / X / خبر</span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    onFocus={() => setIntakeMode("manual")}
                    placeholder="ألصق الرابط هنا..."
                    className={`h-10 min-w-0 flex-1 rounded-lg border bg-white px-3 text-left text-xs outline-none transition focus:border-[#2563eb] ${
                      isXUrl ? "border-[#1DA1F2]" : "border-[var(--color-border)]"
                    }`}
                    dir="ltr"
                    required
                  />
                  <button
                    type="submit"
                    disabled={pending !== null || searchRunning}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#111827] px-3 text-xs font-extrabold text-white transition hover:bg-[#2563eb] disabled:opacity-50"
                  >
                    {pending === "manual" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    إضافة
                  </button>
                </div>
              </form>

              <div className="grid grid-cols-3 gap-3">
                <StatCard value={tabCounts.review} label="تحتاج مراجعة" tone="warning" />
                <StatCard value={tabCounts.capture} label="بانتظار لقطة" tone="blue" />
                <StatCard value={tabCounts.active} label="مواد جديدة اليوم" tone="success" />
              </div>

              <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-2">
                {([
                  ["all", "الكل", Eye],
                  ["x", "X", Filter],
                  ["instagram", "Instagram", Filter],
                  ["tiktok", "TikTok", Filter],
                  ["news", "الأخبار", Globe],
                ] as Array<[PlatformFilter, string, ComponentType<{ className?: string }>]>
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPlatformFilter(id)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[11px] font-extrabold transition ${
                      platformFilter === id
                        ? "border-[#2563eb] bg-white text-[#2563eb] shadow-sm"
                        : "border-transparent text-[var(--color-text-muted)] hover:bg-white"
                    }`}
                  >
                    {id === "x" || id === "instagram" || id === "tiktok" ? (
                      <BrandIcon brand={brandFromLabel(label)} size="sm" />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={archiveVisibleItems}
                  disabled={pending !== null || !visibleItems.length}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#fecaca] bg-white px-3 text-[11px] font-extrabold text-[#dc2626] transition hover:bg-[#fff1f2] disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  أرشفة المعروض
                </button>
                <button
                  type="button"
                  onClick={triggerXSearch}
                  disabled={pending !== null || searchRunning}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#bfdbfe] bg-white px-3 text-[11px] font-extrabold text-[#2563eb] transition hover:bg-[#eff6ff] disabled:opacity-50"
                >
                  {searchRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  بحث X الآن
                </button>
              </div>

              <div className="space-y-2">
                {visibleItems.length ? (
                  visibleItems.slice(0, 8).map((item) => (
                  <MonitoringRow
                      key={item.id}
                      item={item}
                      asset={captureAsset(state.capturesByItem[item.id])}
                      selected={selectedItem?.id === item.id}
                      pending={pending}
                      onSelect={() => {
                        setSelectedId(item.id);
                        setPinnedItemId(item.id);
                      }}
                      primaryLabel={
                        item.state === "approved_pending_capture" || item.state === "capture_failed"
                          ? "تصوير"
                          : item.state === "report_ready"
                            ? "للتقرير"
                            : "اعتماد"
                      }
                      onPrimary={() => {
                        if (item.state === "approved_pending_capture" || item.state === "capture_failed") return captureItem(item);
                        if (item.state === "report_ready") return addToReport(item);
                        return approveItem(item);
                      }}
                      onArchive={() => archiveItem(item)}
                    />
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center">
                    <CircleCheck className="mx-auto h-8 w-8 text-[#16a34a]" />
                    <h2 className="mt-3 text-sm font-extrabold text-[var(--color-text-title)]">لا توجد مواد ضمن هذا الفلتر</h2>
                    <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">جرّب فحص المصادر أو تغيير الفلتر.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function PanelHeader({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-1 h-6 w-6 text-[#4b5563]" />
        <div>
          <h2 className="text-xl font-black tracking-tight text-[var(--color-text-title)]">{title}</h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--color-text-muted)]">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function StatCard({ value, label, tone }: { value: number; label: string; tone: "success" | "warning" | "blue" }) {
  const toneClass =
    tone === "success"
      ? "border-[#ccebd8] bg-[#f1fbf4] text-[#15803d]"
      : tone === "warning"
        ? "border-[#fed7aa] bg-[#fff7ed] text-[#ea580c]"
        : "border-[#dbeafe] bg-[#eff6ff] text-[#2563eb]";

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <strong className="block text-2xl font-black">{value.toLocaleString("ar-SA")}</strong>
      <span className="mt-1 block text-xs font-bold">{label}</span>
    </div>
  );
}

function MonitoringRow({
  item,
  asset,
  selected,
  pending,
  onSelect,
  primaryLabel,
  onPrimary,
  onArchive,
}: {
  item: MonitoringItem;
  asset?: string;
  selected: boolean;
  pending: string | null;
  onSelect: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  onArchive: () => void;
}) {
  return (
    <div className={`grid gap-3 rounded-lg border p-3 transition sm:grid-cols-[88px_minmax(0,1fr)_86px] ${selected ? "border-[#2563eb] bg-[#f8fbff]" : "border-[var(--color-border)] bg-white"}`}>
      <button type="button" onClick={onSelect} className="min-w-0 text-right sm:order-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <PlatformBadge label={platformLabel(item)} />
          <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-extrabold ${statusClass(item.state)}`}>{stateLabel(item.state)}</span>
        </div>
        <h3 className="mt-2 line-clamp-1 text-sm font-extrabold text-[var(--color-text-title)]">{item.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-[var(--color-text-muted)]">{item.summary}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {item.matchedTerms.slice(0, 4).map((term) => (
            <span key={term} className="rounded-md bg-[#e8f5ef] px-1.5 py-0.5 text-[9px] font-bold text-[#15803d]">
              {term}
            </span>
          ))}
        </div>
      </button>

      <button type="button" onClick={onSelect} className="relative h-24 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] sm:order-3">
        {asset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <Camera className="mx-auto mt-9 h-5 w-5 text-[var(--color-text-muted)]" />
        )}
        <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white">00:28</span>
      </button>

      <div className="flex gap-2 sm:order-1 sm:flex-col">
        <button
          type="button"
          onClick={onPrimary}
          disabled={pending !== null}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md bg-[#16a34a] px-2 text-xs font-extrabold text-white transition hover:bg-[#15803d] disabled:opacity-50 sm:flex-none"
        >
          <Check className="h-3.5 w-3.5" />
          {primaryLabel}
        </button>
        <button
          type="button"
          onClick={onArchive}
          disabled={pending !== null}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md border border-[var(--color-border)] bg-white px-2 text-xs font-bold text-[var(--color-text-body)] transition hover:border-[#ef4444]/50 disabled:opacity-50 sm:flex-none"
        >
          <Archive className="h-3.5 w-3.5" />
          أرشفة
        </button>
      </div>
    </div>
  );
}

function PlatformBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[9px] font-extrabold text-[var(--color-text-title)] shadow-sm">
      <BrandIcon brand={brandFromLabel(label)} size="sm" className="h-4 w-4 rounded" />
      {label}
    </span>
  );
}
