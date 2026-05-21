"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Database,
  FileInput,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
} from "lucide-react";
import type { KeywordRule, MonitoringItem, Source } from "@/lib/types";
import AppShell from "@/components/AppShell";
import { BentoCard, BentoGrid } from "@/components/BentoGrid";

type MessageType = "success" | "error" | "info" | "warning";

type SourcesState = {
  sources: Source[];
  keywordRules: KeywordRule[];
};

type SourcePollResponse = {
  poll: {
    source?: Source;
    sources?: number;
    fetched: number;
    created: number;
    duplicates: number;
    skipped?: number;
    failed: number;
    items?: MonitoringItem[];
  };
};

type SourceCreateResponse = {
  source: Source;
  duplicate?: boolean;
};

const emptyState: SourcesState = {
  sources: [],
  keywordRules: [],
};

const arabicApiErrors: Record<string, string> = {
  auth_required: "انتهت الجلسة. سجّل دخولك مجددًا.",
  insufficient_role: "ليس لديك صلاحية لهذا الإجراء.",
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
  rss_parse_failed: "هذا ليس موجز RSS. لاختبار خبر واحد استخدم خانة رابط مادة واحدة في لوحة التشغيل.",
  rss_feed_empty: "موجز RSS فارغ.",
  rss_feed_too_large: "موجز RSS كبير جدًا.",
  request_failed: "تعذر إتمام الطلب. حاول مرة أخرى.",
};

const sourceScheduleOptions = [
  { label: "كل 3 أيام", value: 4320 },
  { label: "كل يومين", value: 2880 },
  { label: "يوميًا", value: 1440 },
  { label: "أسبوعيًا", value: 10080 },
] as const;

function arabicError(key: string): string {
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

function messageClass(type: MessageType) {
  if (type === "error") return "border-[#f1b6aa] bg-[#fff1ed] text-[#8f321d]";
  if (type === "warning") return "border-[#eed478] bg-[#fff8dc] text-[#735d00]";
  if (type === "success") return "border-[#b7ddce] bg-[#ecf7f2] text-[#0f6b57]";
  return "border-[#c7d8f3] bg-[#f1f6ff] text-[#315f9b]";
}

function scheduleLabel(minutes: number) {
  return sourceScheduleOptions.find((option) => option.value === minutes)?.label ?? `كل ${minutes.toLocaleString("ar-SA")} دقيقة`;
}

function rssPollMessage(prefix: string, poll: SourcePollResponse["poll"]) {
  const fetched = poll.fetched.toLocaleString("ar-SA");
  const created = poll.created.toLocaleString("ar-SA");
  const duplicates = poll.duplicates.toLocaleString("ar-SA");
  const skipped = (poll.skipped ?? 0).toLocaleString("ar-SA");
  const failed = poll.failed.toLocaleString("ar-SA");
  const base = `${prefix}: جلب ${fetched}، جديد ${created}، مكرر ${duplicates}، غير مطابق ${skipped}، متعثر ${failed}.`;

  if (poll.fetched > 0 && poll.created === 0 && (poll.skipped ?? 0) > 0 && poll.failed === 0) {
    return `${base} لم تدخل مواد جديدة لأن الأخبار لا تطابق كلمات الرصد الحالية.`;
  }

  return base;
}

export function SourcesClient() {
  const [state, setState] = useState<SourcesState>(emptyState);
  const [rssName, setRssName] = useState("");
  const [rssFeedUrl, setRssFeedUrl] = useState("");
  const [requiredTerms, setRequiredTerms] = useState("");
  const [optionalTerms, setOptionalTerms] = useState("");
  const [excludeTerms, setExcludeTerms] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<MessageType>("info");

  const rssSources = useMemo(
    () => state.sources.filter((source) => source.type === "rss" && source.feedUrl),
    [state.sources],
  );

  const activeRssSources = useMemo(
    () => rssSources.filter((source) => source.isActive),
    [rssSources],
  );

  const activeKeywordRule = state.keywordRules[0] ?? null;

  async function fetchSnapshot(): Promise<SourcesState> {
    const [sourcesData, keywordRulesData] = await Promise.all([
      apiJson<{ sources: Source[] }>("/api/sources"),
      apiJson<{ keyword_rules: KeywordRule[] }>("/api/keyword-rules"),
    ]);

    return {
      sources: sourcesData.sources,
      keywordRules: keywordRulesData.keyword_rules,
    };
  }

  async function refresh() {
    setPending("refresh");
    try {
      const snapshot = await fetchSnapshot();
      setState(snapshot);
      hydrateKeywordInputs(snapshot.keywordRules[0] ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل المصادر.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  async function refreshSilently() {
    setState(await fetchSnapshot());
  }

  function hydrateKeywordInputs(rule: KeywordRule | null) {
    if (!rule) return;
    setRequiredTerms(rule.requiredTerms.join("\n"));
    setOptionalTerms(rule.optionalTerms.join("\n"));
    setExcludeTerms(rule.excludeTerms.join("\n"));
  }

  useEffect(() => {
    let active = true;
    fetchSnapshot()
      .then((snapshot) => {
        if (!active) return;
        setState(snapshot);
        hydrateKeywordInputs(snapshot.keywordRules[0] ?? null);
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "تعذر تحميل المصادر.");
        setMessageType("error");
      });
    return () => {
      active = false;
    };
  }, []);

  async function submitRssSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const feedUrl = rssFeedUrl.trim();
    const existingSource = state.sources.find((source) => source.type === "rss" && source.feedUrl === feedUrl);

    if (existingSource) {
      setMessage(`المصدر موجود بالفعل: ${existingSource.name}. يمكنك تشغيله أو تعديل جدولته من القائمة.`);
      setMessageType("info");
      setRssName("");
      setRssFeedUrl("");
      return;
    }

    setPending("rss-source");
    setMessage("جاري حفظ مصدر الأخبار...");
    setMessageType("info");

    try {
      const result = await apiJson<SourceCreateResponse>("/api/sources", {
        method: "POST",
        body: JSON.stringify({
          name: rssName || "مصدر أخبار",
          type: "rss",
          url: feedUrl,
          feed_url: feedUrl,
          credibility: "media",
          poll_interval_minutes: 4320,
        }),
      });

      await refreshSilently();
      setRssName("");
      setRssFeedUrl("");
      setMessage(result.duplicate ? `المصدر موجود بالفعل: ${result.source.name}.` : `تم حفظ المصدر: ${result.source.name}.`);
      setMessageType(result.duplicate ? "info" : "success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حفظ مصدر الأخبار.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  async function submitKeywordRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("keywords");
    setMessage("جاري حفظ كلمات الرصد...");
    setMessageType("info");

    try {
      const result = await apiJson<{ keyword_rule: KeywordRule }>("/api/keyword-rules", {
        method: "POST",
        body: JSON.stringify({
          id: activeKeywordRule?.id,
          requiredTerms,
          optionalTerms,
          excludeTerms,
          language: activeKeywordRule?.language ?? "mixed",
          priority: activeKeywordRule?.priority ?? 100,
        }),
      });
      await refreshSilently();
      hydrateKeywordInputs(result.keyword_rule);
      setMessage("تم تحديث كلمات الرصد.");
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حفظ كلمات الرصد.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  async function pollSource(source: Source) {
    setPending(`poll-${source.id}`);
    setMessage("جاري تشغيل المصدر...");
    setMessageType("info");

    try {
      const result = await apiJson<SourcePollResponse>(`/api/sources/${source.id}/poll`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refreshSilently();
      setMessage(rssPollMessage(`تم تشغيل ${source.name}`, result.poll));
      setMessageType(result.poll.failed > 0 || (result.poll.created === 0 && (result.poll.skipped ?? 0) > 0) ? "warning" : "success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تشغيل المصدر.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  async function updateSourceSchedule(source: Source, input: { isActive?: boolean; pollIntervalMinutes?: number }) {
    setPending(`source-schedule-${source.id}`);
    setMessage("جاري تحديث المصدر...");
    setMessageType("info");

    try {
      const result = await apiJson<{ source: Source }>(`/api/sources/${source.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          is_active: input.isActive,
          poll_interval_minutes: input.pollIntervalMinutes,
        }),
      });
      await refreshSilently();
      setMessage(`${result.source.name}: ${result.source.isActive ? "نشط" : "متوقف"}، الجدولة ${scheduleLabel(result.source.pollIntervalMinutes)}.`);
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحديث المصدر.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  async function pollActiveSources() {
    setPending("poll-active");
    setMessage("جاري تشغيل المصادر النشطة...");
    setMessageType("info");

    try {
      const result = await apiJson<SourcePollResponse>("/api/sources/poll-active", {
        method: "POST",
        body: JSON.stringify({ limit: 5 }),
      });
      await refreshSilently();
      setMessage(rssPollMessage(`تم فحص ${(result.poll.sources ?? 0).toLocaleString("ar-SA")} مصدر`, result.poll));
      setMessageType(result.poll.failed > 0 || (result.poll.created === 0 && (result.poll.skipped ?? 0) > 0) ? "warning" : "success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تشغيل المصادر.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  return (
    <AppShell>
      <div className="min-h-screen bg-[var(--color-bg-main)] p-5 md:p-8" dir="rtl">
        <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--color-text-muted)]">
              <Database className="h-3.5 w-3.5 text-[#2383E2]" />
              <span>مصادر الرصد</span>
              <span className="rounded-full bg-[#e8f5ef] px-2 py-0.5 text-[9px] text-[#0f6b57]">
                {activeRssSources.length.toLocaleString("ar-SA")} نشط
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-[var(--color-text-title)]">المصادر والكلمات الدالة</h1>
            <p className="mt-2 max-w-2xl text-xs font-semibold leading-6 text-[var(--color-text-muted)]">
              هنا نضبط مصادر الأخبار وجدولة الفحص وكلمات الرصد. لوحة التشغيل تبقى مخصصة لإضافة ومراجعة المحتوى فقط.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/ops"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 text-xs font-bold text-[var(--color-text-title)] transition hover:border-[#2383E2]/40 hover:text-[#2383E2]"
            >
              لوحة التشغيل
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={refresh}
              disabled={pending !== null}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 text-xs font-bold text-[var(--color-text-title)] transition hover:border-[#2383E2]/40 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${pending === "refresh" ? "animate-spin" : ""}`} />
              تحديث
            </button>
          </div>
        </header>

        {message && (
          <div className={`mb-6 flex items-center justify-between rounded-2xl border p-4 text-xs font-bold shadow-sm ${messageClass(messageType)}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{message}</span>
            </div>
            <button type="button" onClick={() => setMessage(null)} className="text-[10px] font-extrabold underline hover:text-[#2383E2]">
              إغلاق
            </button>
          </div>
        )}

        <BentoGrid>
          <BentoCard colSpan="col-span-12 xl:col-span-7" title="مصادر الأخبار" icon={Globe} subtitle="إضافة RSS، تشغيل يدوي، وجدولة دورية">
            <div className="space-y-4">
              <form onSubmit={submitRssSource} className="grid gap-2 md:grid-cols-[minmax(160px,220px)_1fr_auto]">
                <input
                  value={rssName}
                  onChange={(event) => setRssName(event.target.value)}
                  placeholder="اسم المصدر"
                  className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 text-xs outline-none transition focus:border-[#2383E2] focus:bg-white"
                />
                <input
                  value={rssFeedUrl}
                  onChange={(event) => setRssFeedUrl(event.target.value)}
                  placeholder="رابط موجز RSS..."
                  className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 text-left text-xs outline-none transition focus:border-[#2383E2] focus:bg-white"
                  dir="ltr"
                  required
                />
                <button
                  type="submit"
                  disabled={pending !== null}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#111111] px-4 text-xs font-bold text-white transition hover:bg-stone-900 disabled:opacity-50"
                >
                  {pending === "rss-source" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  إضافة
                </button>
              </form>

              {rssSources.length ? (
                <div className="space-y-2">
                  {rssSources.map((source) => (
                    <div key={source.id} className="grid gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${source.isActive ? "bg-[#00C853]" : "bg-stone-300"}`} />
                          <p className="truncate text-sm font-extrabold text-[var(--color-text-title)]">{source.name}</p>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[var(--color-text-muted)]">
                            {source.isActive ? "نشط" : "متوقف"}
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[var(--color-text-muted)]">
                            {scheduleLabel(source.pollIntervalMinutes)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-left text-[10px] font-semibold text-[var(--color-text-muted)]" dir="ltr">
                          {source.feedUrl}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label="جدولة المصدر"
                          className="h-9 rounded-xl border border-[var(--color-border)] bg-white px-2 text-[11px] font-bold outline-none transition focus:border-[#2383E2] disabled:opacity-50"
                          disabled={pending !== null}
                          onChange={(event) => updateSourceSchedule(source, { pollIntervalMinutes: Number(event.target.value) })}
                          value={source.pollIntervalMinutes}
                        >
                          {sourceScheduleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => updateSourceSchedule(source, { isActive: !source.isActive })}
                          disabled={pending !== null}
                          className="inline-flex h-9 items-center gap-1 rounded-xl border border-[var(--color-border)] bg-white px-3 text-[11px] font-bold transition hover:bg-stone-50 disabled:opacity-50"
                        >
                          {source.isActive ? "إيقاف" : "تفعيل"}
                        </button>
                        <button
                          type="button"
                          onClick={() => pollSource(source)}
                          disabled={pending !== null || !source.isActive}
                          className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#00C853]/20 bg-[#e8f5ef] px-3 text-[11px] font-extrabold text-[#0f6b57] transition hover:bg-[#d4f2e4] disabled:opacity-50"
                        >
                          {pending === `poll-${source.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          تشغيل
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-main)] p-8 text-center text-xs font-bold text-[var(--color-text-muted)]">
                  لا توجد مصادر RSS محفوظة حاليًا.
                </div>
              )}

              <button
                type="button"
                onClick={pollActiveSources}
                disabled={pending !== null || !activeRssSources.length}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-[#00C853]/20 bg-[#e8f5ef] text-xs font-extrabold text-[#0f6b57] transition hover:bg-[#d4f2e4] disabled:opacity-50"
              >
                {pending === "poll-active" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                فحص كل المصادر النشطة
              </button>
            </div>
          </BentoCard>

          <BentoCard colSpan="col-span-12 xl:col-span-5" title="كلمات الرصد" icon={Settings} subtitle="هذه الكلمات تحدد ما يدخل من الأخبار">
            <form onSubmit={submitKeywordRule} className="space-y-3">
              <KeywordBox label="إشارات رئيسية" value={requiredTerms} onChange={setRequiredTerms} placeholder={"هداية\nهاكاثون هداية"} />
              <KeywordBox label="كلمات سياق" value={optionalTerms} onChange={setOptionalTerms} placeholder={"الابتكار\nالحرمين\nالشؤون الدينية"} />
              <KeywordBox label="استبعاد" value={excludeTerms} onChange={setExcludeTerms} placeholder={"وظائف\nإعلان ممول"} />
              <button
                type="submit"
                disabled={pending !== null}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#111111] text-xs font-bold text-white transition hover:bg-stone-900 disabled:opacity-50"
              >
                {pending === "keywords" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                حفظ الكلمات
              </button>
            </form>
          </BentoCard>

          <BentoCard colSpan="col-span-12" title="أدوات الأرشيف القديم" icon={FileInput} subtitle="خيارات متقدمة، لا تظهر داخل لوحة التشغيل اليومية">
            <div className="grid gap-3 md:grid-cols-2">
              <AdvancedLink
                href="/imports"
                title="استيراد التقارير القديمة"
                description="مراجعة بيانات التقارير المستخرجة قبل اعتمادها داخل المنصة."
              />
              <AdvancedLink
                href="/imports/backfill"
                title="استكمال روابط التقارير"
                description="أداة تنظيف الروابط القديمة والروابط الناقصة من ملفات التقارير."
              />
            </div>
          </BentoCard>
        </BentoGrid>
      </div>
    </AppShell>
  );
}

function KeywordBox({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-extrabold text-[var(--color-text-muted)]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3 text-xs leading-5 outline-none transition focus:border-[#2383E2] focus:bg-white"
        placeholder={placeholder}
      />
    </label>
  );
}

function AdvancedLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-main)] p-4 transition hover:border-[#2383E2]/40 hover:bg-white"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-[var(--color-text-title)]">{title}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--color-text-muted)]">{description}</p>
        </div>
        <ChevronLeft className="h-4 w-4 text-[var(--color-text-muted)] transition group-hover:text-[#2383E2]" />
      </div>
    </Link>
  );
}
