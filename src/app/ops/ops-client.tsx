"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  Camera,
  Check,
  ExternalLink,
  Link as LinkIcon,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { Capture, HealthMetric, MonitoringItem, ReportVersion } from "@/lib/types";

type MessageType = "success" | "error" | "info" | "warning";

type ApiState = {
  items: MonitoringItem[];
  metrics: HealthMetric[];
  auditCount: number;
  capturesByItem: Record<string, Capture[]>;
  liveReport: ReportVersion | null;
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

const emptyState: ApiState = {
  items: [],
  metrics: [],
  auditCount: 0,
  capturesByItem: {},
  liveReport: null,
};

const arabicApiErrors: Record<string, string> = {
  auth_required: "انتهت الجلسة. سجّل دخولك مجددًا ثم حاول مرة أخرى.",
  insufficient_role: "ليس لديك صلاحية لهذا الإجراء.",
  api_route_not_found_or_not_authorized: "المسار غير موجود أو غير مصرح.",
  url_is_required: "يرجى لصق رابط صحيح.",
  item_not_found: "المادة غير موجودة.",
  item_not_report_ready: "المادة ليست جاهزة للتقرير بعد.",
  report_not_found: "التقرير غير موجود.",
  budget_exceeded: "تم تجاوز حد الاستخدام المسموح.",
  request_failed: "تعذر إتمام الطلب. حاول مرة أخرى.",
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
      throw new Error("انتهت الجلسة. سجّل دخولك مجددًا ثم حاول مرة أخرى.");
    }
    if (contentType.includes("text/html")) {
      throw new Error("انتهت الجلسة أو حدث خطأ في السيرفر. أعد تحميل الصفحة وسجّل دخولك.");
    }
    throw new Error("رد غير متوقع من السيرفر. حاول مرة أخرى.");
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
    ingested: "مجموع",
    normalized: "منظم",
    deduped: "مكرر",
    candidate: "مرشح",
    needs_review: "بانتظار الاعتماد",
    rejected: "مرفوض",
    approved_pending_capture: "بانتظار اللقطة",
    capture_pending: "اللقطة جارية",
    capture_failed: "فشل الالتقاط",
    report_ready: "جاهز للتقرير",
    added_to_report: "داخل التقرير",
    published: "منشور",
    archived: "مؤرشف",
  };
  return labels[state];
}

function stateClass(state: MonitoringItem["state"]) {
  if (state === "report_ready" || state === "added_to_report" || state === "published") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (state === "capture_failed" || state === "rejected") return "border-red-200 bg-red-50 text-red-900";
  if (state === "approved_pending_capture" || state === "needs_review") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-stone-200 bg-stone-50 text-stone-800";
}

function sourceLabel(source?: IntakeResponse["metadata"]) {
  if (!source) return "تم حفظ الرابط.";
  if (source.source === "x_oembed") return "تم جلب بيانات التغريدة من X.";
  if (source.source === "html_metadata") return "تم جلب عنوان ووصف الصفحة.";
  return "تم حفظ الرابط، ولم نستطع جلب النص تلقائيًا.";
}

function nextStepLabel(item: MonitoringItem) {
  if (item.state === "needs_review" || item.state === "candidate") return "الخطوة التالية: اعتماد المادة";
  if (item.state === "approved_pending_capture") return "الخطوة التالية: التقاط لقطة نهائية";
  if (item.state === "report_ready" || item.state === "capture_failed") return "الخطوة التالية: إضافة المادة للتقرير";
  if (item.state === "added_to_report" || item.state === "published") return "المادة موجودة في تقرير العميل";
  if (item.state === "rejected") return "المادة مرفوضة";
  return "المادة محفوظة";
}

function captureAsset(captures: Capture[] | undefined) {
  return captures?.find(
    (capture) => (capture.kind === "report_grade" || capture.kind === "evidence_lite") && capture.status === "success" && capture.assetUrl,
  )?.assetUrl;
}

function messageClass(type: MessageType) {
  if (type === "error") return "rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900";
  if (type === "info") return "rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900";
  if (type === "warning") return "rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 font-semibold";
  return "rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900";
}

export function OpsClient() {
  const [state, setState] = useState<ApiState>(emptyState);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [lastItemId, setLastItemId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<MessageType>("info");

  const liveReportId = state.liveReport?.id ?? "report-5";
  const lastItem = useMemo(
    () => state.items.find((item) => item.id === lastItemId) ?? null,
    [lastItemId, state.items],
  );
  const manualItems = useMemo(
    () =>
      state.items
        .filter((item) => item.sourceType === "manual_url")
        .filter((item) => item.state !== "archived")
        .slice(0, 8),
    [state.items],
  );

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
    try {
      setState(await fetchSnapshot());
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
    setMessage("جاري حفظ الرابط وإحضار بياناته...");
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

      setLastItemId(result.item.id);
      setUrl("");
      setTitle("");
      setText("");
      setAuthorName("");
      setPublishedAt("");
      await refreshSilently();

      let msg = "";
      let msgType: MessageType = "success";

      if (result.duplicate) {
        if (result.duplicateType === "content") {
          msg = "تنبيه: تم رصد محتوى مكرر منشور برابط آخر! قمنا بدمج البيانات وتحديثها لك هنا.";
          msgType = "warning";
        } else {
          msg = "هذا الرابط موجود بالفعل وتم تحديث بياناته.";
          msgType = "success";
        }
      } else {
        msg = sourceLabel(result.metadata);
        msgType = "success";
      }

      setMessage(msg);
      setMessageType(msgType);
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

  function itemActions(item: MonitoringItem, compact = false) {
    const buttonClass = compact
      ? "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold disabled:opacity-50"
      : "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold disabled:opacity-50";

    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            runItemAction(
              `approve-${item.id}`,
              () =>
                apiJson(`/api/items/${item.id}/review`, {
                  method: "POST",
                  body: JSON.stringify({ action: "approve", review_notes: "اعتماد من صفحة التشغيل المبسطة." }),
                }),
              "تم اعتماد المادة. الخطوة التالية هي اللقطة النهائية.",
            )
          }
          disabled={pending !== null || item.state === "added_to_report" || item.state === "published"}
          className={`${buttonClass} border border-emerald-200 bg-emerald-50 text-emerald-900`}
        >
          <Check className="h-4 w-4" />
          اعتماد
        </button>
        <button
          type="button"
          onClick={() =>
            runItemAction(
              `capture-${item.id}`,
              () =>
                apiJson(`/api/items/${item.id}/capture-report-grade`, {
                  method: "POST",
                  body: JSON.stringify({}),
                }),
              "تم تجهيز اللقطة. يمكنك الآن إضافة المادة للتقرير.",
            )
          }
          disabled={pending !== null || item.state === "needs_review" || item.state === "added_to_report" || item.state === "published"}
          className={`${buttonClass} border border-stone-300 bg-white text-stone-900`}
        >
          <Camera className="h-4 w-4" />
          لقطة
        </button>
        <button
          type="button"
          onClick={() =>
            runItemAction(
              `report-${item.id}`,
              () =>
                apiJson(`/api/reports/${liveReportId}/items`, {
                  method: "POST",
                  body: JSON.stringify({ item_id: item.id, warning_accepted: true }),
                }),
              "تمت إضافة المادة للتقرير. ستظهر في واجهة العميل.",
            )
          }
          disabled={pending !== null || item.state === "needs_review" || item.state === "approved_pending_capture"}
          className={`${buttonClass} border border-stone-950 bg-stone-950 text-white`}
        >
          <Archive className="h-4 w-4" />
          إضافة للتقرير
        </button>
        <a
          href={item.originalUrl}
          target="_blank"
          rel="noreferrer"
          className={`${buttonClass} border border-stone-300 bg-white text-stone-700`}
        >
          <ExternalLink className="h-4 w-4" />
          فتح
        </a>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7f1] text-stone-950" dir="rtl">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <div>
            <p className="text-sm font-semibold text-emerald-700">تشغيل الرصد</p>
            <h1 className="mt-1 text-2xl font-bold">إضافة مادة جديدة</h1>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={pending !== null}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-stone-300 bg-white px-4 text-sm font-semibold hover:bg-stone-50 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            تحديث
          </button>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <form onSubmit={submitUrl} className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-emerald-700" />
              <h2 className="text-lg font-bold">ألصق رابط التغريدة أو الخبر</h2>
            </div>
            <div className="mt-4 flex flex-col gap-3 md:flex-row">
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://x.com/.../status/... أو رابط خبر"
                className="h-12 min-w-0 flex-1 rounded-md border border-stone-300 px-3 text-left text-sm"
                dir="ltr"
                required
              />
              <button
                type="submit"
                disabled={pending !== null}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-stone-950 px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                إضافة وإحضار المحتوى
              </button>
            </div>

            <details className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-stone-700">تعديل يدوي عند الحاجة</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="عنوان بديل"
                  className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm"
                />
                <input
                  value={authorName}
                  onChange={(event) => setAuthorName(event.target.value)}
                  placeholder="اسم الناشر"
                  className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm"
                />
                <input
                  value={publishedAt}
                  onChange={(event) => setPublishedAt(event.target.value)}
                  type="datetime-local"
                  className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm"
                />
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="ملخص أو نص المادة"
                  className="min-h-20 rounded-md border border-stone-300 bg-white p-3 text-sm leading-6 md:col-span-2"
                />
              </div>
            </details>

            {pending === "manual" ? (
              <p className={messageClass("info")}>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent align-middle" />{" "}
                جاري حفظ الرابط وإحضار بياناته...
              </p>
            ) : message ? (
              <p className={messageClass(messageType)}>{message}</p>
            ) : null}
          </form>

          {lastItem ? (
            <article className="rounded-lg border border-emerald-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${stateClass(lastItem.state)}`}>
                  {stateLabel(lastItem.state)}
                </span>
                <span className="text-xs font-semibold text-emerald-700">{nextStepLabel(lastItem)}</span>
              </div>
              <h2 className="mt-4 text-xl font-bold leading-8">{lastItem.title}</h2>
              <p className="mt-2 text-sm leading-7 text-stone-600">{lastItem.summary}</p>
              {captureAsset(state.capturesByItem[lastItem.id]) ? (
                <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="صورة دليل المحتوى"
                    className="h-auto w-full"
                    src={captureAsset(state.capturesByItem[lastItem.id]) ?? ""}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <p className="px-3 py-2 text-center text-xs text-stone-400">
                    {captureAsset(state.capturesByItem[lastItem.id])?.includes("microlink.io")
                      ? "صورة لقطة شاشة حقيقية ومباشرة"
                      : "صورة دليل محتوى — ليست لقطة شاشة حقيقية"}
                  </p>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                <span>{lastItem.authorName ?? "ناشر غير محدد"}</span>
                <span>{lastItem.sourceName}</span>
                <span>{new Date(lastItem.publishedAt).toLocaleString("ar-SA")}</span>
              </div>
              <div className="mt-5">{itemActions(lastItem)}</div>
            </article>
          ) : (
            <div className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
              بعد إضافة الرابط ستظهر المادة هنا مباشرة، ومعها أزرار الاعتماد واللقطة والإضافة للتقرير.
            </div>
          )}

          <section className="rounded-lg border border-stone-200 bg-white">
            <div className="border-b border-stone-200 p-4">
              <h2 className="text-lg font-bold">آخر المواد اليدوية</h2>
            </div>
            <div className="divide-y divide-stone-200">
              {manualItems.length ? (
                manualItems.map((item) => (
                  <article key={item.id} className="p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${stateClass(item.state)}`}>
                          {stateLabel(item.state)}
                        </span>
                        <h3 className="mt-3 font-bold leading-7">{item.title}</h3>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-stone-600">{item.summary}</p>
                        {captureAsset(state.capturesByItem[item.id]) ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            alt="صورة دليل المحتوى"
                            className="mt-3 h-24 w-40 rounded-md border border-stone-200 object-cover object-top"
                            src={captureAsset(state.capturesByItem[item.id]) ?? ""}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : null}
                      </div>
                      {itemActions(item, true)}
                    </div>
                  </article>
                ))
              ) : (
                <p className="p-5 text-sm text-stone-500">لا توجد مواد يدوية بعد.</p>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="font-bold">أين تظهر المادة؟</h2>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-stone-600">
              <li>1. تظهر فورًا في البطاقة الخضراء بعد الإضافة.</li>
              <li>2. بعد الاعتماد واللقطة تصبح جاهزة للتقرير.</li>
              <li>3. بعد «إضافة للتقرير» تظهر في واجهة العميل.</li>
            </ol>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="font-bold">تقرير هداية الحي</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {state.liveReport?.title ?? "جاري تحميل التقرير النشط..."}
            </p>
            <a
              href="/client-report"
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white"
            >
              فتح واجهة العميل
            </a>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-600">
            <div className="flex items-center justify-between">
              <span>مواد يدوية</span>
              <span className="font-bold text-stone-950">{manualItems.length}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>أحداث تدقيق</span>
              <span className="font-bold text-stone-950">{state.auditCount}</span>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
