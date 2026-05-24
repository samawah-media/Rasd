"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Archive,
  Camera,
  Check,
  ChevronLeft,
  CircleCheck,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Cpu,
  Database,
  Server,
} from "lucide-react";
import type { Capture, HealthMetric, MonitoringItem, ReportVersion, Source } from "@/lib/types";
import AppShell from "@/components/AppShell";
import { BentoGrid, BentoCard } from "@/components/BentoGrid";
import { isValidXUrl } from "@/lib/x/parser";
import TweetPreviewCard from "@/components/TweetPreviewCard";

type MessageType = "success" | "error" | "info" | "warning";
type WorkTab = "active" | "review" | "capture" | "report" | "done";
type IntakeMode = "manual" | "x-search" | "sources";

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

const tabLabels: Record<WorkTab, string> = {
  active: "كل المواد",
  review: "يبي لها مراجعة",
  capture: "بانتظار لقطة الشاشة",
  report: "جاهزة للتقرير الفخم",
  done: "مضافة بالتقرير",
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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function messageClass(type: MessageType) {
  if (type === "error") return "border-[#f1b6aa] bg-[#fff1ed] text-[#8f321d]";
  if (type === "warning") return "border-[#eed478] bg-[#fff8dc] text-[#735d00]";
  if (type === "success") return "border-[#b7ddce] bg-[#ecf7f2] text-[#0f6b57]";
  return "border-[#c7d8f3] bg-[#f1f6ff] text-[#315f9b]";
}

function systemTone(metrics: HealthMetric[]) {
  if (metrics.some((metric) => metric.status === "danger")) return "bg-[#fff1ed] text-[#8f321d]";
  if (metrics.some((metric) => metric.status === "warning")) return "bg-[#fff8dc] text-[#735d00]";
  return "bg-[#e8f5ef] text-[#0f6b57]";
}

function systemText(metrics: HealthMetric[]) {
  if (!metrics.length) return "جاري الفحص";
  if (metrics.some((metric) => metric.status === "danger")) return "تحتاج متابعة";
  if (metrics.some((metric) => metric.status === "warning")) return "مستقرة مع تنبيه";
  return "مستقرة";
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
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("manual");
  const [query, setQuery] = useState("");
  const [searchRunning, setSearchRunning] = useState(false);

  const [itemWithRawResponse, setItemWithRawResponse] = useState<MonitoringItem | null>(null);
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

  function handleSyncSuccess(updatedItem: MonitoringItem) {
    setState((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === updatedItem.id ? updatedItem : item)),
    }));
    setItemWithRawResponse(updatedItem);
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
      const matchesQuery =
        !normalizedQuery ||
        [item.title, item.summary, item.authorName, item.authorHandle, item.sourceName, item.originalUrl]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesTab && matchesQuery;
    });
  }, [workflowItems, query, tab]);

  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) ?? workflowItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null,
    [workflowItems, selectedId, visibleItems],
  );

  const selectedItemId = selectedItem?.id;
  const selectedItemUrl = selectedItem?.originalUrl;

  useEffect(() => {
    if (!selectedItemId || !selectedItemUrl) {
      Promise.resolve().then(() => setItemWithRawResponse(null));
      return;
    }

    const isTweet = isValidXUrl(selectedItemUrl);
    if (!isTweet) {
      Promise.resolve().then(() => setItemWithRawResponse(null));
      return;
    }

    let active = true;
    Promise.resolve().then(() => setItemWithRawResponse(null));

    fetch(`/api/items/x-refresh?itemId=${selectedItemId}`)
      .then((res) => res.json())
      .then((data) => {
        if (active && data.item) {
          setItemWithRawResponse(data.item);
        }
      })
      .catch((err) => {
        console.error("Error fetching full item details:", err);
      });

    return () => {
      active = false;
    };
  }, [selectedItemId, selectedItemUrl]);

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

  async function saveItemEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem) return;
    const formData = new FormData(event.currentTarget);

    return runItemAction(
      `edit-${selectedItem.id}`,
      () =>
        apiJson(`/api/items/${selectedItem.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: String(formData.get("title") ?? ""),
            summary: String(formData.get("summary") ?? ""),
            author_name: String(formData.get("author_name") ?? ""),
            author_handle: String(formData.get("author_handle") ?? ""),
            published_at: String(formData.get("published_at") ?? "") || undefined,
            original_url: String(formData.get("original_url") ?? ""),
          }),
        }),
      "تم تحديث بيانات المادة.",
    );
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

  function primaryAction(item: MonitoringItem) {
    if (item.state === "needs_review" || item.state === "candidate") {
      return (
        <button type="button" onClick={() => approveItem(item)} className="ops-primary" disabled={pending !== null}>
          <Check className="h-4 w-4" />
          اعتماد الحين
        </button>
      );
    }
    if (item.state === "approved_pending_capture" || item.state === "capture_failed") {
      return (
        <button type="button" onClick={() => captureItem(item)} className="ops-primary" disabled={pending !== null}>
          <Camera className="h-4 w-4" />
          تصوير الشاشة
        </button>
      );
    }
    if (item.state === "report_ready") {
      return (
        <button type="button" onClick={() => addToReport(item)} className="ops-primary" disabled={pending !== null}>
          <Archive className="h-4 w-4" />
          أضف للتقرير الفخم
        </button>
      );
    }
    return null;
  }

  return (
    <AppShell>
      <div className="min-h-screen bg-[var(--color-bg-main)] p-5 md:p-8" dir="rtl">
        <style jsx global>{`
          .ops-primary {
            display: inline-flex;
            height: 2rem;
            align-items: center;
            justify-content: center;
            gap: 0.35rem;
            border-radius: 0.75rem;
            background: #111111;
            padding: 0 0.75rem;
            font-size: 11px;
            font-weight: 800;
            color: white;
            transition: all 0.2s ease;
          }
          .ops-primary:hover {
            background: #2383E2;
          }
          .ops-primary:active {
            transform: scale(0.97);
          }
          .ops-primary:disabled {
            opacity: 0.55;
          }
        `}</style>

        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 select-none">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-extrabold text-[var(--color-text-muted)] tracking-wider uppercase">
              <Cpu className="h-3.5 w-3.5 text-[#2383E2]" />
              <span>مركز تشغيل رصد</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-border)]" />
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${systemTone(state.metrics)}`}>
                {systemText(state.metrics)}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-black text-[var(--color-text-title)] tracking-tight">الرصد اليومي</h1>
            <p className="mt-1 max-w-xl text-xs font-semibold leading-6 text-[var(--color-text-muted)]">
              أدخل رابطًا يدويًا، شغّل البحث، ثم راجع المواد واعتمدها للتقرير من نفس الشاشة.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/client-report"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 text-xs font-bold text-[var(--color-text-title)] hover:border-[#2383E2]/40 transition hover:text-[#2383E2] active:scale-[0.97] transition-transform"
            >
              عرض تقرير العميل
              <ChevronLeft className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={refresh}
              disabled={pending !== null}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 text-xs font-bold text-[var(--color-text-title)] hover:border-[#2383E2]/40 transition disabled:opacity-50 active:scale-[0.97] transition-transform"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${pending === "refresh" ? "animate-spin" : ""}`} />
              تحديث الحالة
            </button>
          </div>
        </header>

        {/* Global Notifications Panel */}
        {message && (
          <div className={`mb-6 rounded-2xl border p-4 text-xs font-bold flex items-center justify-between shadow-sm transition-all duration-300 ${messageClass(messageType)}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{message}</span>
            </div>
            <button type="button" onClick={() => setMessage(null)} className="text-[10px] underline font-extrabold hover:text-[#2383E2]">
              إغلاق
            </button>
          </div>
        )}

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-[var(--color-border)] bg-white p-3">
            <span className="text-[10px] font-extrabold text-[var(--color-text-muted)]">كل المواد</span>
            <strong className="mt-1 block text-xl font-black text-[var(--color-text-title)]">{tabCounts.active.toLocaleString("ar-SA")}</strong>
          </div>
          <div className="rounded-lg border border-[#cfe2ff] bg-[#f5faff] p-3">
            <span className="text-[10px] font-extrabold text-[#315f9b]">بحاجة لمراجعة</span>
            <strong className="mt-1 block text-xl font-black text-[#1d4f8f]">{tabCounts.review.toLocaleString("ar-SA")}</strong>
          </div>
          <div className="rounded-lg border border-[#fde4b6] bg-[#fff9e8] p-3">
            <span className="text-[10px] font-extrabold text-[#8a5b08]">بانتظار اللقطة</span>
            <strong className="mt-1 block text-xl font-black text-[#8a5b08]">{tabCounts.capture.toLocaleString("ar-SA")}</strong>
          </div>
          <div className="rounded-lg border border-[#d7efdf] bg-[#f1fbf4] p-3">
            <span className="text-[10px] font-extrabold text-[#0f6b57]">جاهزة للتقرير</span>
            <strong className="mt-1 block text-xl font-black text-[#0f6b57]">{tabCounts.report.toLocaleString("ar-SA")}</strong>
          </div>
        </div>

        {/* Bento Control Center Grid */}
        <BentoGrid className="mb-6">
          {/* Card 1: Add Single URL */}
          <BentoCard colSpan="col-span-12 xl:col-span-6" title="رصد رابط سريع" icon={LinkIcon} subtitle="المدخل اليدوي هنا: الصق رابطًا واحدًا ثم اسحب تفاصيله للمراجعة">
            <form onSubmit={submitUrl} className="space-y-3 mt-1">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#cfe2ff] bg-[#f5faff] px-2.5 py-1 text-[10px] font-extrabold text-[#1d4f8f]">
                <LinkIcon className="h-3 w-3" />
                مدخل الرابط اليدوي
              </div>
              <div className="relative">
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  onFocus={() => setIntakeMode("manual")}
                  placeholder="ألصق الرابط هنا: TikTok أو Instagram أو X أو خبر..."
                  className={`h-10 w-full rounded-xl border bg-[var(--color-bg-main)] text-left text-xs outline-none transition-all duration-300 focus:outline focus:outline-2 focus:outline-[#2383E2]/50 ${
                    isXUrl
                      ? "border-[#1DA1F2] pr-16 pl-3 shadow-[0_0_10px_rgba(29,161,242,0.15)] bg-blue-50/5 focus:border-[#1DA1F2]"
                      : "border-[var(--color-border)] pr-3 pl-3 focus:border-[#2383E2] focus:bg-white"
                  }`}
                  dir="ltr"
                  required
                />
                {isXUrl && (
                  <div className="absolute right-3 top-2.5 flex items-center gap-1.5 animate-pulse select-none">
                    <span className="flex h-2 w-2 rounded-full bg-[#1DA1F2]" />
                    <span className="text-[10px] font-extrabold text-[#1DA1F2] tracking-wider font-mono">X LINK</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] font-extrabold text-[var(--color-text-muted)]">
                {["X", "TikTok", "Instagram", "خبر/موقع"].map((platform) => (
                  <span key={platform} className="rounded-full border border-[var(--color-border)] bg-white px-2 py-1">
                    {platform}
                  </span>
                ))}
              </div>

              <details className="group border border-[var(--color-border)] rounded-xl bg-stone-50 p-2.5 transition-all">
                <summary className="cursor-pointer text-[10px] font-extrabold text-[var(--color-text-muted)] hover:text-[#2383E2] select-none">
                  تعديل التفاصيل يدويًا عند الحاجة
                </summary>
                <div className="mt-2.5 space-y-2">
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="عنوان الخبر أو التغريدة"
                    className="h-8 w-full rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-xs outline-none focus:border-[#2383E2]"
                  />
                  <div className="grid gap-2 grid-cols-2">
                    <input
                      value={authorName}
                      onChange={(event) => setAuthorName(event.target.value)}
                      placeholder="اسم الناشر / الحساب"
                      className="h-8 w-full rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-xs outline-none focus:border-[#2383E2]"
                    />
                    <input
                      value={publishedAt}
                      onChange={(event) => setPublishedAt(event.target.value)}
                      type="datetime-local"
                      className="h-8 w-full rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-xs outline-none focus:border-[#2383E2]"
                    />
                  </div>
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="اكتب ملخص أو وش السالفة..."
                    className="min-h-16 w-full rounded-lg border border-[var(--color-border)] bg-white p-2 text-xs leading-5 outline-none focus:border-[#2383E2] resize-none"
                  />
                </div>
              </details>

              <button
                type="submit"
                disabled={pending !== null || searchRunning}
                className="w-full inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#111111] text-xs font-bold text-white hover:bg-[#2383E2] transition active:scale-[0.97] transition-transform disabled:opacity-50 cursor-pointer"
              >
                {pending === "manual" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                سحب التفاصيل وإضافتها للمراجعة
              </button>
            </form>
          </BentoCard>

          <BentoCard colSpan="col-span-12 md:col-span-6 xl:col-span-3" title="اكتشاف X" icon={Search} subtitle="يبحث بالكلمات الحالية ويحفظ النتائج المطابقة">
            <div className="mt-1 flex h-full flex-col justify-between gap-4">
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setIntakeMode("x-search")}
                  className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-[11px] font-extrabold transition ${
                    intakeMode === "x-search"
                      ? "border-[#1DA1F2] bg-[#edf8ff] text-[#12659d]"
                      : "border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:border-[#1DA1F2]/40 hover:text-[#12659d]"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  وضع اكتشاف X
                </button>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3">
                    <span className="block text-[10px] font-bold text-[var(--color-text-muted)]">آخر تشغيل</span>
                    <strong className="mt-1 block text-sm text-[var(--color-text-title)]">{state.xSearchLastRun?.newItems ?? 0}</strong>
                  </div>
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3">
                    <span className="block text-[10px] font-bold text-[var(--color-text-muted)]">الحالة</span>
                    <strong className="mt-1 block text-sm text-[var(--color-text-title)]">{state.connectors?.x_recent_search ?? "ready"}</strong>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={triggerXSearch}
                disabled={pending !== null || searchRunning}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#111111] text-xs font-bold text-white transition hover:bg-[#2383E2] active:scale-[0.97] disabled:opacity-50"
              >
                {searchRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                اكتشف من X الآن
              </button>
            </div>
          </BentoCard>

          <BentoCard colSpan="col-span-12 md:col-span-6 xl:col-span-3" title="فحص الأخبار" icon={Database} subtitle="يفحص مصادر RSS النشطة ويضيف الأخبار المطابقة">
            <div className="mt-1 flex h-full flex-col justify-between gap-4">
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setIntakeMode("sources")}
                  className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-[11px] font-extrabold transition ${
                    intakeMode === "sources"
                      ? "border-[#2f8f67] bg-[#edf8f2] text-[#176343]"
                      : "border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:border-[#2f8f67]/40 hover:text-[#176343]"
                  }`}
                >
                  <Server className="h-3.5 w-3.5" />
                  وضع الأخبار
                </button>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3">
                    <span className="block text-[10px] font-bold text-[var(--color-text-muted)]">مصادر نشطة</span>
                    <strong className="mt-1 block text-sm text-[var(--color-text-title)]">{activeRssSources.length}</strong>
                  </div>
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3">
                    <span className="block text-[10px] font-bold text-[var(--color-text-muted)]">RSS</span>
                    <strong className="mt-1 block text-sm text-[var(--color-text-title)]">{state.connectors?.rss ?? "ready"}</strong>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={runSourceSearch}
                disabled={pending !== null || searchRunning || activeRssSources.length === 0}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#111111] text-xs font-bold text-white transition hover:bg-[#2383E2] active:scale-[0.97] disabled:opacity-50"
              >
                {pending === "source-search" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                افحص المصادر الآن
              </button>
            </div>
          </BentoCard>
        </BentoGrid>

        {/* Monitoring Feed and Details Grid */}
        <div className="grid grid-cols-12 gap-5">
          {/* Left pane: Health Widgets & Selected Item details (col-span-12 lg:col-span-4) */}
          <div className="col-span-12 lg:col-span-4 space-y-5">


            {/* Selected Item Details Sticky Widget */}
            {selectedItem ? (
              <div className="bg-white rounded-3xl border border-[var(--color-border)] p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] pb-3">
                  <div className="min-w-0">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold ${statusClass(selectedItem.state)}`}>
                      {stateLabel(selectedItem.state)}
                    </span>
                    <h2 className="mt-2 text-sm font-extrabold leading-6 text-[var(--color-text-title)] truncate">{selectedItem.title}</h2>
                  </div>
                  <a
                    href={selectedItem.originalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] hover:border-[#2383E2]/40 transition text-[var(--color-text-muted)] hover:text-[#2383E2]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>

                {isValidXUrl(selectedItem.originalUrl) ? (
                  <TweetPreviewCard
                    item={itemWithRawResponse && itemWithRawResponse.id === selectedItem.id ? itemWithRawResponse : selectedItem}
                    onSyncSuccess={handleSyncSuccess}
                  />
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-main)] max-h-48 relative group/img">
                    {(() => {
                      const itemCaptures = state.capturesByItem[selectedItem.id] || [];
                      const activeCapture = itemCaptures.find(
                        (c) => (c.kind === "report_grade" || c.kind === "evidence_lite" || c.kind === "preview") && c.status === "success" && c.assetUrl
                      );
                      if (activeCapture) {
                        return (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              alt="صورة المحتوى"
                              className="w-full h-full object-contain max-h-48 object-top rounded-2xl transition duration-500 group-hover/img:scale-105"
                              src={activeCapture.assetUrl ?? ""}
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />
                            {activeCapture.kind === "preview" && (
                              <div className="absolute bottom-2 right-2 rounded-lg bg-black/75 px-2 py-1 text-[9px] font-black text-[#f5c542] tracking-wider flex items-center gap-1 select-none backdrop-blur-sm">
                                <Sparkles className="h-3 w-3" />
                                <span>صورة مصغرة مأخوذة من غلاف المنشور (معاينة)</span>
                              </div>
                            )}
                          </>
                        );
                      }
                      return (
                        <div className="flex h-28 items-center justify-center text-[var(--color-text-muted)]">
                          <Camera className="h-6 w-6" />
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {primaryAction(selectedItem)}
                    <button
                      type="button"
                      onClick={() => archiveItem(selectedItem)}
                      disabled={pending !== null}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#f1b6aa] bg-[#fff8f6] px-2.5 text-xs font-bold text-[#9a341f] hover:border-[#d7745f] transition disabled:opacity-50 active:scale-[0.97] transition-transform"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      أرشفة المادة
                    </button>
                    {selectedItem.state === "approved_pending_capture" || selectedItem.state === "capture_failed" || selectedItem.state === "report_ready" ? (
                      <button
                        type="button"
                        onClick={() => approveItem(selectedItem)}
                        disabled={pending !== null}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2.5 text-xs font-bold hover:border-[#2383E2]/40 transition disabled:opacity-50 active:scale-[0.97] transition-transform"
                      >
                        <Check className="h-3.5 w-3.5" />
                        اعتماد الحين
                      </button>
                    ) : null}
                  </div>

                  {!isValidXUrl(selectedItem.originalUrl) && (
                    <p className="text-xs font-semibold leading-5 text-[var(--color-text-body)] bg-[var(--color-bg-main)] p-3 rounded-xl border border-[var(--color-border)]">{selectedItem.summary}</p>
                  )}

                  {selectedItem.warning && (
                    <div className="text-[10px] font-semibold leading-5 text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span>تحذير: {selectedItem.warning}</span>
                      </div>
                      {(() => {
                        const raw = selectedItem.raw_response && typeof selectedItem.raw_response === "object"
                          ? (selectedItem.raw_response as { warningDetail?: string; input?: { extraction?: { warningDetail?: string } } })
                          : {};
                        const detail = raw.warningDetail || raw.input?.extraction?.warningDetail;
                        if (detail) {
                          return (
                            <div className="mt-1 text-[9px] text-stone-500 font-mono break-all max-h-24 overflow-y-auto bg-stone-100 p-1.5 rounded border border-stone-200" dir="ltr">
                              {detail}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}

                  <details className="group border border-[var(--color-border)] rounded-xl bg-stone-50 p-2.5 transition-all">
                    <summary className="cursor-pointer text-[10px] font-extrabold text-[var(--color-text-title)] hover:text-[#2383E2] select-none">
                      تحرير وتعديل تفاصيل المادة
                    </summary>
                    <form key={selectedItem.id} onSubmit={saveItemEdits} className="mt-3 space-y-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-stone-500">العنوان البديل</span>
                        <input
                          name="title"
                          defaultValue={selectedItem.title}
                          className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-xs font-bold outline-none focus:border-[#2383E2]"
                          required
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-stone-500">الملخص المعدل للعميل</span>
                        <textarea
                          name="summary"
                          defaultValue={selectedItem.summary}
                          className="min-h-16 rounded-lg border border-[var(--color-border)] bg-white p-2 text-xs font-semibold leading-5 outline-none focus:border-[#2383E2]"
                          required
                        />
                      </div>
                      <div className="grid gap-2 grid-cols-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-bold text-stone-500">الناشر</span>
                          <input
                            name="author_name"
                            defaultValue={selectedItem.authorName ?? ""}
                            className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-xs font-bold outline-none focus:border-[#2383E2]"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-bold text-stone-500">المعرف</span>
                          <input
                            name="author_handle"
                            defaultValue={selectedItem.authorHandle ?? ""}
                            className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-xs font-bold outline-none focus:border-[#2383E2]"
                            dir="ltr"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-stone-500">تاريخ وتوقيت النشر</span>
                        <input
                          name="published_at"
                          defaultValue={formatDateTimeLocal(selectedItem.publishedAt)}
                          type="datetime-local"
                          className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-xs font-bold outline-none focus:border-[#2383E2]"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-stone-500">رابط المصدر الأصلي</span>
                        <input
                          name="original_url"
                          defaultValue={selectedItem.originalUrl}
                          className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-left text-xs font-bold outline-none focus:border-[#2383E2]"
                          dir="ltr"
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={pending !== null}
                        className="w-full inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#111111] hover:bg-[#2383E2] text-[11px] font-bold text-white transition active:scale-[0.97] transition-transform cursor-pointer"
                      >
                        {pending === `edit-${selectedItem.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        حفظ التعديلات
                      </button>
                    </form>
                  </details>

                  <div className="grid gap-2 grid-cols-2 pt-2">
                    <Info label="منصة النشر" value={platformLabel(selectedItem)} />
                    <Info label="التقرير المستهدف" value={state.liveReport?.title ?? "رصد هداية هاكاثون"} />
                    {(() => {
                      const itemCaptures = state.capturesByItem[selectedItem.id] || [];
                      const activeCapture = itemCaptures.find(
                        (c) => (c.kind === "report_grade" || c.kind === "evidence_lite" || c.kind === "preview") && c.status === "success" && c.assetUrl
                      );
                      if (activeCapture?.kind === "preview") {
                        return (
                          <div className="col-span-2">
                            <Info label="نوع الإثبات المرفق" value="غلاف المنشور التلقائي (معاينة وليس لقطة حقيقية كاملة)" tone="warning" />
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <div className="col-span-2">
                      <Info label="تاريخ رصد المادة" value={formatDate(selectedItem.publishedAt)} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-64 items-center justify-center p-6 text-center text-xs font-bold text-[var(--color-text-muted)] select-none">
                اختر لك مادة رصد من القائمة عشان تشوف تفاصيلها الكاملة هنا 👇
              </div>
            )}
          </div>

          {/* Right pane: Core Monitoring Items List (col-span-12 lg:col-span-8) */}
          <div className="col-span-12 lg:col-span-8 space-y-4">
            {/* Filter tab bar and actions */}
            <div className="bg-white rounded-3xl border border-[var(--color-border)] p-4 shadow-sm">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(tabLabels) as WorkTab[]).map((itemTab) => (
                    <button
                      key={itemTab}
                      type="button"
                      onClick={() => setTab(itemTab)}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition-all ${
                        tab === itemTab
                          ? "border-[#2383E2] bg-[#2383E2]/10 text-[#2383E2]"
                          : "border-[var(--color-border)] bg-[var(--color-bg-main)] text-[var(--color-text-muted)] hover:border-[#2383E2]/40"
                      }`}
                    >
                      {tabLabels[itemTab]}
                      <span className="rounded-full bg-white px-1.5 py-0.5 border border-[var(--color-border)] text-[9px]">{tabCounts[itemTab]}</span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={archiveVisibleItems}
                    disabled={pending !== null || !visibleItems.length}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-[#f1b6aa] bg-[#fff8f6] px-3 text-xs font-bold text-[#9a341f] transition hover:border-[#d7745f] disabled:opacity-50 active:scale-[0.97] transition-transform cursor-pointer"
                  >
                    {pending === "archive-visible" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    أرشفة كل المعروضين
                  </button>
                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="بحث سريع في اللي رصدناه..."
                      className="h-8 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] pr-8 pl-3 text-xs outline-none transition focus:border-[#2383E2] focus:bg-white xl:w-56"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Items list */}
            <div className="bg-white rounded-3xl border border-[var(--color-border)] overflow-hidden divide-y divide-[var(--color-border)] shadow-sm">
              {visibleItems.length ? (
                visibleItems.map((item) => {
                  const asset = captureAsset(state.capturesByItem[item.id]);
                  const selected = selectedItem?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(item.id);
                        setPinnedItemId(item.id);
                      }}
                      className={`grid w-full gap-4 p-4 text-right transition-colors duration-200 md:grid-cols-[100px_minmax(0,1fr)] ${
                        selected ? "bg-[#2383E2]/5" : "hover:bg-[var(--color-bg-main)]"
                      }`}
                    >
                      <div className="h-20 w-20 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] shrink-0 self-center relative group/media flex items-center justify-center">
                        {asset ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt=""
                            className="h-full w-full object-cover object-top transition duration-300 group-hover/media:scale-105"
                            src={asset}
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="text-[var(--color-text-muted)]">
                            <Camera className="h-4.5 w-4.5" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${statusClass(item.state)}`}>
                              {stateLabel(item.state)}
                            </span>
                            <span className="rounded-full bg-[var(--color-bg-main)] border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--color-text-muted)]">
                              {platformLabel(item)}
                            </span>
                            {item.discoveryMethod === "auto_search" && (
                              <span className="rounded-full bg-[#1DA1F2]/10 border border-[#1DA1F2]/20 px-2 py-0.5 text-[9px] font-extrabold text-[#1DA1F2] flex items-center gap-1">
                                <Search className="h-2.5 w-2.5" />
                                مكتشفة تلقائياً
                              </span>
                            )}
                            {item.warning && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 animate-bounce" />}
                          </div>

                          <h2 className="mt-2 font-bold text-xs leading-5 text-[var(--color-text-title)] line-clamp-1">{item.title}</h2>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-4.5 text-[var(--color-text-muted)] font-semibold">{item.summary}</p>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between text-[10px] text-[var(--color-text-muted)] border-t border-[var(--color-border)]/40 pt-2 select-none">
                          <span className="font-extrabold text-[#2383E2]">{item.authorHandle || item.authorName || item.sourceName}</span>
                          <span className="font-bold">{formatDate(item.publishedAt)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-12 text-center select-none flex flex-col items-center">
                  <CircleCheck className="h-8 w-8 text-[#00C853] animate-pulse" />
                  <h2 className="mt-3 text-xs font-extrabold text-[var(--color-text-title)]">يا سلام! ما فيه شيء يبي له مراجعة الحين</h2>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">كل شيء تمام ومصفى على أكمل وجه.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Info({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className={`rounded-xl px-3 py-2 border border-[var(--color-border)] ${tone === "warning" ? "bg-[#fff8dc] text-[#735d00]" : "bg-[var(--color-bg-main)] text-[var(--color-text-body)]"}`}>
      <dt className="text-[10px] font-bold text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-1 text-xs font-extrabold text-[var(--color-text-title)]">{value}</dd>
    </div>
  );
}
