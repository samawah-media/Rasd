"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  Camera,
  Check,
  FilePlus2,
  Link as LinkIcon,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Capture, HealthMetric, MonitoringItem, ReportVersion } from "@/lib/types";

type ApiState = {
  items: MonitoringItem[];
  metrics: HealthMetric[];
  auditCount: number;
  capturesByItem: Record<string, Capture[]>;
  liveReport: ReportVersion | null;
};

const emptyState: ApiState = {
  items: [],
  metrics: [],
  auditCount: 0,
  capturesByItem: {},
  liveReport: null,
};

const statCards: Array<[string, keyof ReturnType<typeof getStats>, LucideIcon]> = [
  ["كل المواد", "total", Activity],
  ["بانتظار المراجعة", "review", Archive],
  ["جاهزة للتقرير", "ready", ShieldCheck],
  ["فشل الالتقاط", "failed", Camera],
];

function getStats(items: MonitoringItem[]) {
  const ready = items.filter((item) => item.state === "report_ready").length;
  const review = items.filter((item) => item.state === "needs_review").length;
  const failed = items.filter((item) => item.state === "capture_failed").length;
  return { ready, review, failed, total: items.length };
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "request_failed");
  return data;
}

function stateLabel(state: MonitoringItem["state"]) {
  const labels: Record<MonitoringItem["state"], string> = {
    ingested: "مجموع",
    normalized: "منظم",
    deduped: "مكرر",
    candidate: "مرشح",
    needs_review: "بانتظار المراجعة",
    rejected: "مرفوض",
    approved_pending_capture: "معتمد بانتظار الالتقاط",
    capture_pending: "الالتقاط جار",
    capture_failed: "فشل الالتقاط",
    report_ready: "جاهز للتقرير",
    added_to_report: "داخل التقرير",
    published: "منشور",
    archived: "مؤرشف",
  };
  return labels[state];
}

function stateClass(state: MonitoringItem["state"]) {
  if (state === "report_ready" || state === "added_to_report") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (state === "capture_failed" || state === "rejected") return "border-red-200 bg-red-50 text-red-900";
  if (state === "approved_pending_capture" || state === "needs_review") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-stone-200 bg-stone-50 text-stone-800";
}

export function OpsClient() {
  const [state, setState] = useState<ApiState>(emptyState);
  const [url, setUrl] = useState("https://example.com/news/hidayathon");
  const [title, setTitle] = useState("خبر عن هاكاثون هداية");
  const [text, setText] = useState("تغطية إعلامية عن هداية وهاكاثون هداية ضمن فعالية تقنية.");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string>("لم يتم إنشاء رابط مشاركة بعد.");

  const stats = useMemo(() => getStats(state.items), [state.items]);
  const liveReportId = state.liveReport?.id ?? "report-5";

  async function fetchSnapshot(): Promise<ApiState> {
    const [itemsData, healthData, auditData, liveReportData] = await Promise.all([
      apiJson<{ items: MonitoringItem[] }>("/api/items"),
      apiJson<{ metrics: HealthMetric[] }>("/api/admin/health"),
      apiJson<{ audit_logs: unknown[] }>("/api/audit-logs"),
      apiJson<{ report: ReportVersion }>("/api/reports/hidayathon-live"),
    ]);

    const capturePairs = await Promise.all(
      itemsData.items.map(async (item) => {
        const result = await apiJson<{ captures: Capture[] }>(`/api/items/${item.id}/captures`);
        return [item.id, result.captures] as const;
      }),
    );

    return {
      items: itemsData.items,
      metrics: healthData.metrics,
      auditCount: auditData.audit_logs.length,
      capturesByItem: Object.fromEntries(capturePairs),
      liveReport: liveReportData.report,
    };
  }

  async function refresh() {
    setPending("refresh");
    setState(await fetchSnapshot());
    setPending(null);
  }

  useEffect(() => {
    let active = true;
    fetchSnapshot().then((snapshot) => {
      if (!active) return;
      setState(snapshot);
    }).catch((error) => {
      if (!active) return;
      setMessage(error.message);
    });
    return () => {
      active = false;
    };
  }, []);

  async function runAction(label: string, action: () => Promise<unknown>) {
    setPending(label);
    setMessage(null);
    try {
      await action();
      await refresh();
      setMessage("تم تنفيذ العملية وتحديث الحالة.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
      setPending(null);
    }
  }

  async function createShareLink() {
    setPending("share-create");
    setShareStatus("جاري إنشاء رابط آمن...");
    try {
      const result = await apiJson<{ token: string; link: { expiresAt: string; maxViews?: number } }>(
        `/api/reports/${liveReportId}/share-link`,
        {
          method: "POST",
          body: JSON.stringify({ max_views: 3, expires_in_days: 7 }),
        },
      );
      setShareToken(result.token);
      setShareStatus(`رابط نشط حتى ${new Date(result.link.expiresAt).toLocaleDateString("ar-SA")}`);
    } catch (error) {
      setShareStatus(error instanceof Error ? error.message : "تعذر إنشاء الرابط.");
    } finally {
      setPending(null);
    }
  }

  async function validateShareLink() {
    if (!shareToken) return;
    setPending("share-validate");
    try {
      const result = await apiJson<{ link: { viewCount: number; maxViews?: number } }>(`/api/share-links/${shareToken}`);
      setShareStatus(`تم فتح الرابط. المشاهدات: ${result.link.viewCount}/${result.link.maxViews ?? "∞"}`);
    } catch (error) {
      setShareStatus(error instanceof Error ? error.message : "الرابط غير متاح.");
    } finally {
      setPending(null);
    }
  }

  async function revokeShareLink() {
    if (!shareToken) return;
    setPending("share-revoke");
    try {
      await apiJson(`/api/share-links/${shareToken}/revoke`, { method: "POST" });
      setShareStatus("تم إلغاء رابط المشاركة.");
    } catch (error) {
      setShareStatus(error instanceof Error ? error.message : "تعذر إلغاء الرابط.");
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f2ea] text-stone-950">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Rasd Workflow Console</p>
            <h1 className="mt-2 text-3xl font-bold">تشغيل دورة الرصد والتحرير</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-stone-600">
              هذه الصفحة تختبر الخطة عمليًا عبر API محلي: إدخال يدوي، دليل خفيف، مراجعة بشرية، التقاط نهائي، ثم تجهيز المادة للتقرير.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refresh()}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-stone-300 bg-white px-4 text-sm font-semibold hover:bg-stone-50"
          >
            <RefreshCw className="h-4 w-4" />
            تحديث
          </button>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-6 md:grid-cols-4">
        {statCards.map(([label, key, Icon]) => (
          <div key={label} className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-stone-500">{label}</p>
              <Icon className="h-4 w-4 text-stone-400" />
            </div>
            <p className="mt-3 text-3xl font-bold">{stats[key]}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-10 lg:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          <form
            className="rounded-lg border border-stone-200 bg-white p-5"
            onSubmit={(event) => {
              event.preventDefault();
              runAction("manual", () =>
                apiJson("/api/items/manual-url", {
                  method: "POST",
                  body: JSON.stringify({ url, title, text }),
                }),
              );
            }}
          >
            <div className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-emerald-700" />
              <h2 className="text-lg font-bold">إدخال رابط يدوي</h2>
            </div>
            <label className="mt-4 block text-sm font-semibold text-stone-700">
              الرابط
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-stone-300 px-3 text-left text-sm"
                dir="ltr"
              />
            </label>
            <label className="mt-3 block text-sm font-semibold text-stone-700">
              العنوان
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-stone-300 px-3 text-sm"
              />
            </label>
            <label className="mt-3 block text-sm font-semibold text-stone-700">
              نص مختصر
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="mt-2 min-h-24 w-full rounded-md border border-stone-300 p-3 text-sm leading-6"
              />
            </label>
            <button
              type="submit"
              disabled={pending !== null}
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-stone-950 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <FilePlus2 className="h-4 w-4" />
              حفظ كـ Evidence-lite
            </button>
            {message ? <p className="mt-3 rounded-md bg-stone-100 p-3 text-sm text-stone-700">{message}</p> : null}
          </form>

          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="text-lg font-bold">الصحة والتتبع</h2>
            <div className="mt-4 space-y-3">
              {state.metrics.slice(0, 8).map((metric) => (
                <div key={metric.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-stone-600">{metric.label}</span>
                  <span className="font-semibold">{metric.value}</span>
                </div>
              ))}
              <div className="border-t border-stone-200 pt-3 text-sm text-stone-600">
                أحداث التدقيق الحالية: <span className="font-semibold text-stone-950">{state.auditCount}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-700" />
              <h2 className="text-lg font-bold">رابط مشاركة آمن</h2>
            </div>
            {state.liveReport ? <p className="mt-2 text-xs text-stone-500">{state.liveReport.title}</p> : null}
            <p className="mt-3 rounded-md bg-stone-100 p-3 text-sm leading-6 text-stone-700">{shareStatus}</p>
            {shareToken ? (
              <p className="mt-3 break-all rounded-md border border-stone-200 bg-white p-3 text-left text-xs text-stone-500" dir="ltr">
                /api/share-links/{shareToken}
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={createShareLink}
                disabled={pending !== null}
                className="inline-flex h-9 items-center justify-center rounded-md bg-stone-950 px-3 text-xs font-semibold text-white disabled:opacity-50"
              >
                إنشاء
              </button>
              <button
                type="button"
                onClick={validateShareLink}
                disabled={!shareToken || pending !== null}
                className="inline-flex h-9 items-center justify-center rounded-md border border-stone-300 bg-white px-3 text-xs font-semibold disabled:opacity-50"
              >
                اختبار
              </button>
              <button
                type="button"
                onClick={revokeShareLink}
                disabled={!shareToken || pending !== null}
                className="inline-flex h-9 items-center justify-center rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-900 disabled:opacity-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white">
          <div className="border-b border-stone-200 p-5">
            <h2 className="text-lg font-bold">Inbox التحريري</h2>
            <p className="mt-1 text-sm text-stone-500">الأزرار هنا تضرب API فعليًا وتغير حالة المادة داخل الذاكرة المحلية.</p>
          </div>
          <div className="divide-y divide-stone-200">
            {state.items.map((item) => (
              <article key={item.id} className="p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${stateClass(item.state)}`}>
                        {stateLabel(item.state)}
                      </span>
                      <span className="text-xs text-stone-500">{item.sourceName}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-bold leading-7">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-stone-600">{item.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
                      <span>الصلة: {item.relevanceScore}%</span>
                      <span>التصنيف: {item.sentiment}</span>
                      <span>المطابقة: {item.matchedTerms.join("، ") || "لا توجد"}</span>
                    </div>
                    {item.warning ? <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">{item.warning}</p> : null}
                  </div>

                  <div className="grid min-w-64 grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        runAction(`approve-${item.id}`, () =>
                          apiJson(`/api/items/${item.id}/review`, {
                            method: "POST",
                            body: JSON.stringify({ action: "approve", review_notes: "اعتماد من صفحة التشغيل." }),
                          }),
                        )
                      }
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-900"
                    >
                      <Check className="h-4 w-4" />
                      اعتماد
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runAction(`reject-${item.id}`, () =>
                          apiJson(`/api/items/${item.id}/review`, {
                            method: "POST",
                            body: JSON.stringify({ action: "reject", review_notes: "رفض من صفحة التشغيل." }),
                          }),
                        )
                      }
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-900"
                    >
                      <X className="h-4 w-4" />
                      رفض
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runAction(`capture-${item.id}`, () =>
                          apiJson(`/api/items/${item.id}/capture-report-grade`, {
                            method: "POST",
                            body: JSON.stringify({}),
                          }),
                        )
                      }
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-xs font-semibold"
                    >
                      <Camera className="h-4 w-4" />
                      لقطة نهائية
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runAction(`report-${item.id}`, () =>
                          apiJson(`/api/reports/${liveReportId}/items`, {
                            method: "POST",
                            body: JSON.stringify({ item_id: item.id, warning_accepted: true }),
                          }),
                        )
                      }
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-xs font-semibold"
                    >
                      <Archive className="h-4 w-4" />
                      أضف للتقرير
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-stone-500">
                  {(state.capturesByItem[item.id] ?? []).map((capture) => (
                    <span key={capture.id} className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1">
                      {capture.kind}: {capture.status}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
