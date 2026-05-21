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
  Copy,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import type { Capture, HealthMetric, MonitoringItem, ReportVersion } from "@/lib/types";

type MessageType = "success" | "error" | "info" | "warning";
type WorkTab = "active" | "review" | "capture" | "report" | "done";

type ApiState = {
  items: MonitoringItem[];
  metrics: HealthMetric[];
  capturesByItem: Record<string, Capture[]>;
  liveReport: ReportVersion | null;
  shareLinks: ShareLinkSummary[];
};

type IntakeResponse = {
  item: MonitoringItem;
  duplicate?: boolean;
  duplicateType?: "url" | "content" | null;
  metadata?: {
    source: "x_oembed" | "html_metadata" | "url_only";
    warning?: string;
  } | null;
};

type ShareLinkSummary = {
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
  clientStatus?: "active" | "expired" | "revoked";
};

const emptyState: ApiState = {
  items: [],
  metrics: [],
  capturesByItem: {},
  liveReport: null,
  shareLinks: [],
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
  request_failed: "تعذر إتمام الطلب. حاول مرة أخرى.",
  archive_failed: "تعذرت أرشفة المادة.",
};

const tabLabels: Record<WorkTab, string> = {
  active: "الكل",
  review: "تحتاج اعتماد",
  capture: "تحتاج لقطة",
  report: "جاهزة للتقرير",
  done: "داخل التقرير",
};

function arabicError(key: string): string {
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
    ingested: "محفوظ",
    normalized: "منظم",
    deduped: "مكرر",
    candidate: "مرشح",
    needs_review: "يحتاج اعتماد",
    rejected: "مرفوض",
    approved_pending_capture: "تحتاج لقطة",
    capture_pending: "جاري الالتقاط",
    capture_failed: "تعثر الالتقاط",
    report_ready: "جاهز للتقرير",
    added_to_report: "داخل التقرير",
    published: "منشور",
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
  if (source.source === "html_metadata") return "تم جلب بيانات الصفحة.";
  return "تم حفظ الرابط.";
}

function captureAsset(captures: Capture[] | undefined) {
  return captures?.find(
    (capture) => (capture.kind === "report_grade" || capture.kind === "evidence_lite") && capture.status === "success" && capture.assetUrl,
  )?.assetUrl;
}

function platformLabel(item: MonitoringItem) {
  if (item.originalUrl.includes("x.com") || item.originalUrl.includes("twitter.com")) return "X";
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

function formatOptionalDate(value: string | null) {
  if (!value) return "غير محدد";
  return formatDate(value);
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

function latestManualItems(items: MonitoringItem[], limit = 32) {
  return items
    .filter((item) => item.sourceType === "manual_url")
    .filter((item) => item.state !== "archived")
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, limit);
}

export function OpsClient() {
  const [state, setState] = useState<ApiState>(emptyState);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<MessageType>("info");
  const [tab, setTab] = useState<WorkTab>("active");
  const [query, setQuery] = useState("");
  const [shareExpiresInDays, setShareExpiresInDays] = useState("none");
  const [shareMaxViews, setShareMaxViews] = useState("");
  const [generatedShareUrl, setGeneratedShareUrl] = useState<string | null>(null);

  const liveReportId = state.liveReport?.id ?? "report-5";

  const manualItems = useMemo(
    () => latestManualItems(state.items),
    [state.items],
  );

  const tabCounts = useMemo(() => {
    const counts: Record<WorkTab, number> = {
      active: manualItems.length,
      review: 0,
      capture: 0,
      report: 0,
      done: 0,
    };
    manualItems.forEach((item) => {
      const itemTab = tabForItem(item);
      if (itemTab !== "active") counts[itemTab] += 1;
    });
    return counts;
  }, [manualItems]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return manualItems.filter((item) => {
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
  }, [manualItems, query, tab]);

  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) ?? manualItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null,
    [manualItems, selectedId, visibleItems],
  );

  async function fetchSnapshot(): Promise<ApiState> {
    const [itemsData, healthData, liveReportData] = await Promise.all([
      apiJson<{ items: MonitoringItem[] }>("/api/items"),
      apiJson<{ metrics: HealthMetric[] }>("/api/admin/health"),
      apiJson<{ report: ReportVersion }>("/api/reports/hidayathon-live"),
    ]);
    const shareLinksData = await apiJson<{ links: ShareLinkSummary[] }>(`/api/reports/${liveReportData.report.id}/share-links`);

    const manualCandidates = latestManualItems(itemsData.items);

    const capturePairs = await Promise.all(
      manualCandidates.map(async (item) => {
        const result = await apiJson<{ captures: Capture[] }>(`/api/items/${item.id}/captures`);
        return [item.id, result.captures] as const;
      }),
    );

    return {
      items: itemsData.items,
      metrics: healthData.metrics,
      capturesByItem: Object.fromEntries(capturePairs),
      liveReport: liveReportData.report,
      shareLinks: shareLinksData.links,
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
        setSelectedId((current) => current ?? snapshot.items.find((item) => item.sourceType === "manual_url")?.id ?? null);
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
      setTab("active");
      setUrl("");
      setTitle("");
      setText("");
      setAuthorName("");
      setPublishedAt("");
      await refreshSilently();

      if (result.duplicate) {
        setMessage(result.duplicateType === "content" ? "محتوى مكرر، تم تحديث المادة الموجودة." : "الرابط موجود، تم تحديث بياناته.");
        setMessageType(result.duplicateType === "content" ? "warning" : "success");
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

  async function createShareLink() {
    const expiresInDays = shareExpiresInDays === "none" ? undefined : Number(shareExpiresInDays);
    const maxViews = shareMaxViews.trim() ? Number(shareMaxViews) : undefined;

    await runItemAction(
      "share-create",
      async () => {
        const result = await apiJson<{ token: string }>(`/api/reports/${liveReportId}/share-link`, {
          method: "POST",
          body: JSON.stringify({
            expires_in_days: Number.isFinite(expiresInDays) ? expiresInDays : undefined,
            max_views: Number.isFinite(maxViews) ? maxViews : undefined,
          }),
        });
        setGeneratedShareUrl(`${window.location.origin}/share/${result.token}`);
      },
      "تم إنشاء رابط مشاركة خاص.",
    );
  }

  async function revokeShareLink(id: string) {
    await runItemAction(
      `share-revoke-${id}`,
      () =>
        apiJson(`/api/share-links/${id}/revoke-by-id`, {
          method: "POST",
          body: JSON.stringify({}),
        }),
      "تم إلغاء رابط المشاركة.",
    );
  }

  async function copyGeneratedShareUrl() {
    if (!generatedShareUrl) return;
    await navigator.clipboard.writeText(generatedShareUrl);
    setMessage("تم نسخ رابط المشاركة.");
    setMessageType("success");
  }

  function primaryAction(item: MonitoringItem) {
    if (item.state === "needs_review" || item.state === "candidate") {
      return (
        <button type="button" onClick={() => approveItem(item)} className="ops-primary" disabled={pending !== null}>
          <Check className="h-4 w-4" />
          اعتماد
        </button>
      );
    }
    if (item.state === "approved_pending_capture" || item.state === "capture_failed") {
      return (
        <button type="button" onClick={() => captureItem(item)} className="ops-primary" disabled={pending !== null}>
          <Camera className="h-4 w-4" />
          لقطة
        </button>
      );
    }
    if (item.state === "report_ready") {
      return (
        <button type="button" onClick={() => addToReport(item)} className="ops-primary" disabled={pending !== null}>
          <Archive className="h-4 w-4" />
          إضافة للتقرير
        </button>
      );
    }
    return null;
  }

  return (
    <main className="min-h-screen bg-[#f7f8f4] text-[#17201d]" dir="rtl">
      <style jsx global>{`
        .ops-primary {
          display: inline-flex;
          height: 2.5rem;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          border-radius: 0.5rem;
          background: #116a5c;
          padding: 0 1rem;
          font-size: 0.875rem;
          font-weight: 700;
          color: white;
          transition: background 0.18s ease;
        }
        .ops-primary:hover {
          background: #0f594e;
        }
        .ops-primary:disabled {
          opacity: 0.55;
        }
      `}</style>

      <section className="border-b border-[#dfe3d9] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#66736d]">
              <span>تشغيل الرصد</span>
              <span className={`rounded-full px-2 py-1 ${systemTone(state.metrics)}`}>{systemText(state.metrics)}</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal md:text-3xl">إضافة ومراجعة المحتوى</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/client-report"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] px-3 text-sm font-semibold transition hover:border-[#116a5c]/45"
            >
              واجهة العميل
              <ChevronLeft className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={refresh}
              disabled={pending !== null}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dfe3d9] bg-white px-3 text-sm font-semibold transition hover:border-[#116a5c]/45 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${pending === "refresh" ? "animate-spin" : ""}`} />
              تحديث
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-5">
        <form onSubmit={submitUrl} className="border-b border-[#dfe3d9] bg-white p-4 shadow-sm shadow-black/[0.03] md:rounded-lg md:border">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative block">
              <LinkIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#66736d]" />
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="الصق رابط X أو خبر"
                className="h-12 w-full rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] pr-10 pl-3 text-left text-sm outline-none transition focus:border-[#116a5c] focus:bg-white"
                dir="ltr"
                required
              />
            </label>
            <button
              type="submit"
              disabled={pending !== null}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#17201d] px-5 text-sm font-semibold text-white transition hover:bg-[#26302c] disabled:opacity-50"
            >
              {pending === "manual" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              إضافة
            </button>
          </div>

          <details className="mt-3">
            <summary className="inline-flex cursor-pointer rounded-md px-1 text-sm font-semibold text-[#66736d] transition hover:text-[#116a5c]">
              تعديل يدوي
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="عنوان"
                className="h-10 rounded-lg border border-[#dfe3d9] bg-white px-3 text-sm outline-none focus:border-[#116a5c]"
              />
              <input
                value={authorName}
                onChange={(event) => setAuthorName(event.target.value)}
                placeholder="الناشر"
                className="h-10 rounded-lg border border-[#dfe3d9] bg-white px-3 text-sm outline-none focus:border-[#116a5c]"
              />
              <input
                value={publishedAt}
                onChange={(event) => setPublishedAt(event.target.value)}
                type="datetime-local"
                className="h-10 rounded-lg border border-[#dfe3d9] bg-white px-3 text-sm outline-none focus:border-[#116a5c]"
              />
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="ملخص"
                className="min-h-20 rounded-lg border border-[#dfe3d9] bg-white p-3 text-sm leading-6 outline-none focus:border-[#116a5c] md:col-span-3"
              />
            </div>
          </details>

          {message ? (
            <div className={`mt-3 rounded-lg border px-3 py-2 text-sm font-semibold ${messageClass(messageType)}`}>{message}</div>
          ) : null}
        </form>
      </section>

      <ShareLinksPanel
        links={state.shareLinks}
        expiresInDays={shareExpiresInDays}
        maxViews={shareMaxViews}
        generatedUrl={generatedShareUrl}
        pending={pending}
        onExpiresInDaysChange={setShareExpiresInDays}
        onMaxViewsChange={setShareMaxViews}
        onCreate={createShareLink}
        onCopy={copyGeneratedShareUrl}
        onRevoke={revokeShareLink}
      />

      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 rounded-lg border border-[#dfe3d9] bg-white">
          <div className="border-b border-[#dfe3d9] p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(tabLabels) as WorkTab[]).map((itemTab) => (
                  <button
                    key={itemTab}
                    type="button"
                    onClick={() => setTab(itemTab)}
                    className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${
                      tab === itemTab
                        ? "border-[#116a5c] bg-[#e8f5ef] text-[#116a5c]"
                        : "border-[#dfe3d9] bg-[#fbfbf8] text-[#66736d] hover:border-[#116a5c]/45"
                    }`}
                  >
                    {tabLabels[itemTab]}
                    <span>{tabCounts[itemTab].toLocaleString("ar-SA")}</span>
                  </button>
                ))}
              </div>
              <label className="relative block xl:w-72">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#66736d]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="بحث"
                  className="h-9 w-full rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] pr-9 pl-3 text-sm outline-none transition focus:border-[#116a5c] focus:bg-white"
                />
              </label>
            </div>
          </div>

          <div className="divide-y divide-[#edf0e9]">
            {visibleItems.length ? (
              visibleItems.map((item) => {
                const asset = captureAsset(state.capturesByItem[item.id]);
                const selected = selectedItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`grid w-full gap-4 p-4 text-right transition md:grid-cols-[108px_minmax(0,1fr)] ${
                      selected ? "bg-[#eef7f3]" : "hover:bg-[#fbfbf8]"
                    }`}
                  >
                    <div className="h-24 overflow-hidden rounded-lg border border-[#dfe3d9] bg-[#f0f3ee]">
                      {asset ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt=""
                          className="h-full w-full object-cover object-top"
                          src={asset}
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[#8a938d]">
                          <Camera className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(item.state)}`}>{stateLabel(item.state)}</span>
                        <span className="rounded-full bg-[#f0f3ee] px-2 py-1 text-xs font-semibold text-[#66736d]">{platformLabel(item)}</span>
                        {item.warning ? <AlertTriangle className="h-4 w-4 text-[#b78a00]" /> : null}
                      </div>
                      <h2 className="mt-2 line-clamp-2 font-semibold leading-7">{item.title}</h2>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#66736d]">{item.summary}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-[#66736d]">
                        <span>{item.authorHandle || item.authorName || item.sourceName}</span>
                        <span>{formatDate(item.publishedAt)}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-8 text-center">
                <CircleCheck className="mx-auto h-7 w-7 text-[#116a5c]" />
                <h2 className="mt-3 font-semibold">لا توجد مواد هنا</h2>
              </div>
            )}
          </div>
        </div>

        <aside className="min-w-0 rounded-lg border border-[#dfe3d9] bg-white lg:sticky lg:top-5 lg:max-h-[calc(100vh-2.5rem)] lg:overflow-auto">
          {selectedItem ? (
            <div>
              <div className="border-b border-[#dfe3d9] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(selectedItem.state)}`}>
                      {stateLabel(selectedItem.state)}
                    </span>
                    <h2 className="mt-3 text-lg font-semibold leading-8">{selectedItem.title}</h2>
                  </div>
                  <a
                    href={selectedItem.originalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] transition hover:border-[#116a5c]/45"
                    aria-label="فتح الرابط الأصلي"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {primaryAction(selectedItem)}
                  <button
                    type="button"
                    onClick={() => archiveItem(selectedItem)}
                    disabled={pending !== null}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#f1b6aa] bg-[#fff8f6] px-3 text-sm font-semibold text-[#9a341f] transition hover:border-[#d7745f] disabled:opacity-50"
                  >
                    <Archive className="h-4 w-4" />
                    أرشفة
                  </button>
                  {selectedItem.state === "approved_pending_capture" || selectedItem.state === "capture_failed" || selectedItem.state === "report_ready" ? (
                    <button
                      type="button"
                      onClick={() => approveItem(selectedItem)}
                      disabled={pending !== null}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] px-3 text-sm font-semibold transition hover:border-[#116a5c]/45 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      اعتماد
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="p-4">
                <div className="overflow-hidden rounded-lg border border-[#dfe3d9] bg-[#f0f3ee]">
                  {captureAsset(state.capturesByItem[selectedItem.id]) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt="صورة المحتوى"
                      className="max-h-[420px] w-full object-contain object-top"
                      src={captureAsset(state.capturesByItem[selectedItem.id]) ?? ""}
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="flex h-64 items-center justify-center text-[#66736d]">
                      <Camera className="h-7 w-7" />
                    </div>
                  )}
                </div>

                <p className="mt-4 text-sm leading-7 text-[#4f5a55]">{selectedItem.summary}</p>

                <dl className="mt-5 grid gap-3 text-sm">
                  <Info label="الناشر" value={selectedItem.authorHandle || selectedItem.authorName || selectedItem.sourceName} />
                  <Info label="التاريخ" value={formatDate(selectedItem.publishedAt)} />
                  <Info label="المنصة" value={platformLabel(selectedItem)} />
                  <Info label="التقرير" value={state.liveReport?.title ?? "رصد هداية هاكاثون"} />
                  {selectedItem.warning ? <Info label="تنبيه" value={selectedItem.warning} tone="warning" /> : null}
                </dl>
              </div>
            </div>
          ) : (
            <div className="flex min-h-96 items-center justify-center p-8 text-center text-sm text-[#66736d]">
              اختر مادة من القائمة.
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function ShareLinksPanel({
  links,
  expiresInDays,
  maxViews,
  generatedUrl,
  pending,
  onExpiresInDaysChange,
  onMaxViewsChange,
  onCreate,
  onCopy,
  onRevoke,
}: {
  links: ShareLinkSummary[];
  expiresInDays: string;
  maxViews: string;
  generatedUrl: string | null;
  pending: string | null;
  onExpiresInDaysChange: (value: string) => void;
  onMaxViewsChange: (value: string) => void;
  onCreate: () => void;
  onCopy: () => void;
  onRevoke: (id: string) => void;
}) {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-5">
      <div className="rounded-lg border border-[#dfe3d9] bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-[#66736d]">مشاركة التقرير</p>
            <h2 className="mt-1 text-lg font-semibold">روابط خاصة للعميل</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-[150px_130px_auto]">
            <select
              value={expiresInDays}
              onChange={(event) => onExpiresInDaysChange(event.target.value)}
              className="h-10 rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] px-3 text-sm font-semibold outline-none"
            >
              <option value="none">بدون انتهاء</option>
              <option value="7">7 أيام</option>
              <option value="30">30 يوم</option>
            </select>
            <input
              value={maxViews}
              onChange={(event) => onMaxViewsChange(event.target.value.replace(/[^\d]/g, ""))}
              placeholder="عدد المشاهدات"
              className="h-10 rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] px-3 text-sm outline-none"
              inputMode="numeric"
            />
            <button
              type="button"
              onClick={onCreate}
              disabled={pending !== null}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#116a5c] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <LinkIcon className="h-4 w-4" />
              إنشاء رابط
            </button>
          </div>
        </div>

        {generatedUrl ? (
          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-[#b7ddce] bg-[#ecf7f2] p-3 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate text-left text-sm text-[#0f6b57]" dir="ltr">
              {generatedUrl}
            </code>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold text-[#116a5c]"
            >
              <Copy className="h-4 w-4" />
              نسخ
            </button>
          </div>
        ) : null}

        <div className="mt-4 divide-y divide-[#edf0e9] rounded-lg border border-[#edf0e9]">
          {links.length ? (
            links.map((link) => {
              const revoked = link.clientStatus === "revoked";
              const expired = link.clientStatus === "expired";
              return (
                <div className="grid gap-3 p-3 lg:grid-cols-[1fr_auto]" key={link.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          revoked || expired ? "bg-[#fff1ed] text-[#a33a24]" : "bg-[#e8f5ef] text-[#0f6b57]"
                        }`}
                      >
                        {revoked ? "ملغي" : expired ? "منتهي" : "نشط"}
                      </span>
                      <span className="text-xs font-semibold text-[#66736d]">مشاهدات {link.viewCount.toLocaleString("ar-SA")}</span>
                      {link.maxViews ? (
                        <span className="text-xs font-semibold text-[#66736d]">الحد {link.maxViews.toLocaleString("ar-SA")}</span>
                      ) : null}
                    </div>
                    <div className="mt-2 truncate text-left text-xs font-semibold text-[#66736d]" dir="ltr">
                      {link.tokenHash.slice(0, 18)}...{link.tokenHash.slice(-8)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#66736d]">
                      <span>إنشاء: {formatOptionalDate(link.createdAt)}</span>
                      <span>انتهاء: {formatOptionalDate(link.expiresAt)}</span>
                      <span>آخر مشاهدة: {formatOptionalDate(link.lastViewedAt)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRevoke(link.id)}
                    disabled={pending !== null || revoked}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-[#f1b6aa] bg-[#fff8f6] px-3 text-sm font-semibold text-[#9a341f] disabled:opacity-50"
                  >
                    إلغاء
                  </button>
                </div>
              );
            })
          ) : (
            <div className="p-4 text-sm text-[#66736d]">لا توجد روابط مشاركة بعد.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function Info({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${tone === "warning" ? "bg-[#fff8dc] text-[#735d00]" : "bg-[#fbfbf8] text-[#4f5a55]"}`}>
      <dt className="text-xs font-semibold text-[#66736d]">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
