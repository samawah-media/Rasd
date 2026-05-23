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
  Power,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { ConnectorRun, KeywordRule, MonitoringItem, Source, SourceRule } from "@/lib/types";
import type { LegacySourceIntelligence } from "@/lib/legacy-source-intelligence";
import AppShell from "@/components/AppShell";
import { BentoCard, BentoGrid } from "@/components/BentoGrid";

type MessageType = "success" | "error" | "info" | "warning";

type SourcesState = {
  sources: Source[];
  keywordRules: KeywordRule[];
  sourceRules: SourceRule[];
  connectorRuns: ConnectorRun[];
  sourceIntelligence: SourceIntelligencePayload | null;
};

type SourceIntelligencePayload = {
  intelligence: LegacySourceIntelligence;
  existing: {
    keywordRuleId: string | null;
    referenceSources: number;
    sourceRules: number;
    newsSources: number;
    xAccounts: number;
    instagramProfiles: number;
    tiktokProfiles: number;
    tiktokQueries: number;
  };
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

type WatchlistType = "tiktok_research" | "instagram_public_profile";

type SourceRuleResponse = {
  source_rule: SourceRule;
};

type SourceRulesResponse = {
  source_rules: SourceRule[];
  connector_runs: ConnectorRun[];
};

type RunDueResponse = {
  ok: boolean;
  dueRulesCount: number;
  enqueuedCount: number;
  executedCount: number;
  failedCount: number;
};

type SourceIntelligenceApplyResponse = {
  ok: boolean;
  action: string;
  created?: unknown[];
  skipped?: string[];
  keyword_rule?: KeywordRule;
};

const emptyState: SourcesState = {
  sources: [],
  keywordRules: [],
  sourceRules: [],
  connectorRuns: [],
  sourceIntelligence: null,
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
  source_rule_type_unsupported: "نوع قاعدة الرصد غير مدعوم.",
  tiktok_query_or_url_required: "أدخل كلمة بحث أو رابط TikTok.",
  instagram_profile_url_required: "أدخل رابط حساب Instagram العام.",
  instagram_profile_url_invalid: "رابط Instagram يجب أن يكون رابط حساب عام.",
  source_rule_url_not_public: "الرابط يجب أن يكون عامًا ويبدأ بـ http أو https.",
  source_rule_not_found: "قاعدة الرصد غير موجودة.",
  source_rules_schema_not_ready: "قاعدة البيانات تحتاج تطبيق آخر migration الخاص بقواعد TikTok/Instagram.",
  source_rule_request_failed: "تعذر حفظ قاعدة الرصد. راجع صفحة صحة الخوادم أو سجلات Vercel.",
  request_failed: "تعذر إتمام الطلب. حاول مرة أخرى.",
};

const sourceScheduleOptions = [
  { label: "كل 3 أيام", value: 4320 },
  { label: "كل يومين", value: 2880 },
  { label: "يوميًا", value: 1440 },
  { label: "أسبوعيًا", value: 10080 },
] as const;

const watchlistScheduleOptions = [
  { label: "كل ساعة", value: 60 },
  { label: "كل 6 ساعات", value: 360 },
  { label: "يوميًا", value: 1440 },
  { label: "كل يومين", value: 2880 },
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
    const text = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error("انتهت الجلسة. سجّل دخولك مجددًا.");
    }
    throw new Error(`رد غير متوقع من السيرفر (${response.status}). ${text.slice(0, 120)}`);
  }

  let data: Record<string, unknown>;
  try {
    data = await response.json();
  } catch {
    throw new Error("لم يرد محتوى صالح من السيرفر. حاول مرة أخرى.");
  }

  if (!response.ok) {
    const errorKey = typeof data.error === "string" ? data.error : "request_failed";
    const detail = typeof data.detail === "string" ? ` ${data.detail}` : "";
    throw new Error(`${arabicError(errorKey)}${detail}`);
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
  return (
    watchlistScheduleOptions.find((option) => option.value === minutes)?.label ??
    sourceScheduleOptions.find((option) => option.value === minutes)?.label ??
    `كل ${minutes.toLocaleString("ar-SA")} دقيقة`
  );
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

function sourceRulePlatform(rule: SourceRule) {
  return rule.type === "tiktok_research" ? "TikTok" : "Instagram";
}

function sourceRuleTarget(rule: SourceRule) {
  return [rule.query, rule.url].filter(Boolean).join(" · ") || "بدون هدف";
}

function latestRunForRule(rule: SourceRule, runs: ConnectorRun[]) {
  return runs
    .filter((run) => run.sourceRuleId === rule.id)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
}

function connectorRunLabel(run?: ConnectorRun) {
  if (!run) return "لم يعمل بعد";
  if (run.status === "success") return `نجح · ${run.fetchedCount.toLocaleString("ar-SA")} مواد`;
  if (run.status === "failed") return `فشل · ${run.failureReason ?? "سبب غير معروف"}`;
  return run.status;
}

export function SourcesClient() {
  const [state, setState] = useState<SourcesState>(emptyState);
  const [rssName, setRssName] = useState("");
  const [rssFeedUrl, setRssFeedUrl] = useState("");
  const [requiredTerms, setRequiredTerms] = useState("");
  const [optionalTerms, setOptionalTerms] = useState("");
  const [excludeTerms, setExcludeTerms] = useState("");
  const [watchlistType, setWatchlistType] = useState<WatchlistType>("tiktok_research");
  const [watchlistQuery, setWatchlistQuery] = useState("");
  const [watchlistUrl, setWatchlistUrl] = useState("");
  const [watchlistIntervalMinutes, setWatchlistIntervalMinutes] = useState(1440);
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

  const referenceSources = useMemo(
    () => state.sources.filter((source) => source.type !== "rss"),
    [state.sources],
  );

  const activeKeywordRule = state.keywordRules[0] ?? null;

  async function fetchSnapshot(): Promise<SourcesState> {
    const [sourcesData, keywordRulesData, sourceRulesData, sourceIntelligenceData] = await Promise.all([
      apiJson<{ sources: Source[] }>("/api/sources"),
      apiJson<{ keyword_rules: KeywordRule[] }>("/api/keyword-rules"),
      apiJson<SourceRulesResponse>("/api/source-rules"),
      apiJson<SourceIntelligencePayload>("/api/source-intelligence"),
    ]);

    return {
      sources: sourcesData.sources,
      keywordRules: keywordRulesData.keyword_rules,
      sourceRules: sourceRulesData.source_rules,
      connectorRuns: sourceRulesData.connector_runs,
      sourceIntelligence: sourceIntelligenceData,
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

  async function applySourceIntelligence(action: "apply_keywords" | "apply_social_watchlists" | "apply_reference_sources") {
    setPending(`source-intelligence-${action}`);
    setMessage("جاري تطبيق اقتراحات التقارير الأصلية...");
    setMessageType("info");

    try {
      const result = await apiJson<SourceIntelligenceApplyResponse>("/api/source-intelligence/apply", {
        method: "POST",
        body: JSON.stringify({ action, limit: 8 }),
      });
      await refreshSilently();
      if (result.keyword_rule) hydrateKeywordInputs(result.keyword_rule);

      const created = result.created?.length ?? 0;
      const skipped = result.skipped?.length ?? 0;
      if (action === "apply_keywords") {
        setMessage("تم دمج كلمات التقارير الأصلية مع كلمات الرصد الحالية.");
      } else if (action === "apply_social_watchlists") {
        setMessage(`تمت إضافة ${created.toLocaleString("ar-SA")} قاعدة رصد اجتماعي، وتجاوز ${skipped.toLocaleString("ar-SA")} مكرر.`);
      } else {
        setMessage(`تم حفظ ${created.toLocaleString("ar-SA")} مصدر مرجعي، وتجاوز ${skipped.toLocaleString("ar-SA")} مكرر.`);
      }
      setMessageType(created === 0 && action !== "apply_keywords" ? "info" : "success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تطبيق اقتراحات التقارير الأصلية.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  async function submitWatchlistRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("watchlist-rule");
    setMessage("جاري حفظ قاعدة رصد TikTok/Instagram...");
    setMessageType("info");

    try {
      const result = await apiJson<SourceRuleResponse>("/api/source-rules", {
        method: "POST",
        body: JSON.stringify({
          type: watchlistType,
          query: watchlistQuery,
          url: watchlistUrl,
          poll_interval_minutes: watchlistIntervalMinutes,
        }),
      });
      await refreshSilently();
      setWatchlistQuery("");
      setWatchlistUrl("");
      setMessage(`تم حفظ قاعدة ${sourceRulePlatform(result.source_rule)} الآلية.`);
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حفظ قاعدة الرصد الآلي.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  async function toggleWatchlistRule(rule: SourceRule) {
    setPending(`watchlist-toggle-${rule.id}`);
    setMessage("جاري تحديث قاعدة الرصد...");
    setMessageType("info");

    try {
      const result = await apiJson<SourceRuleResponse>(`/api/source-rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !rule.active }),
      });
      await refreshSilently();
      setMessage(`${sourceRulePlatform(result.source_rule)}: ${result.source_rule.active ? "نشطة" : "متوقفة"}.`);
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحديث قاعدة الرصد.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  async function updateWatchlistSchedule(rule: SourceRule, pollIntervalMinutes: number) {
    setPending(`watchlist-schedule-${rule.id}`);
    setMessage("جاري تحديث جدولة قاعدة الرصد...");
    setMessageType("info");

    try {
      const result = await apiJson<SourceRuleResponse>(`/api/source-rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ poll_interval_minutes: pollIntervalMinutes }),
      });
      await refreshSilently();
      setMessage(`${sourceRulePlatform(result.source_rule)}: الجدولة ${scheduleLabel(result.source_rule.pollIntervalMinutes)}.`);
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحديث جدولة قاعدة الرصد.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  async function runDueWatchlists() {
    setPending("watchlist-run-due");
    setMessage("جاري تشغيل قواعد TikTok/Instagram المستحقة...");
    setMessageType("info");

    try {
      const result = await apiJson<RunDueResponse>("/api/source-rules/run-due", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refreshSilently();
      setMessage(
        `تم فحص ${result.dueRulesCount.toLocaleString("ar-SA")} قاعدة مستحقة، وتشغيل ${result.executedCount.toLocaleString("ar-SA")} job${result.failedCount ? `، وفشل ${result.failedCount.toLocaleString("ar-SA")}` : ""}.`,
      );
      setMessageType(result.failedCount ? "warning" : "success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تشغيل قواعد الرصد الآن.");
      setMessageType("error");
    } finally {
      setPending(null);
    }
  }

  async function deleteWatchlistRule(rule: SourceRule) {
    setPending(`watchlist-delete-${rule.id}`);
    setMessage("جاري حذف قاعدة الرصد...");
    setMessageType("info");

    try {
      await apiJson<{ ok: boolean }>(`/api/source-rules/${rule.id}`, {
        method: "DELETE",
      });
      await refreshSilently();
      setMessage(`تم حذف قاعدة ${sourceRulePlatform(rule)}.`);
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حذف قاعدة الرصد.");
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

        {state.sourceIntelligence && (
          <section className="mb-6 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-extrabold text-[var(--color-text-muted)]">
                  <Sparkles className="h-3.5 w-3.5 text-[#2383E2]" />
                  <span>اقتراحات من التقارير الأصلية</span>
                  <span className="rounded-full bg-[#f1f6ff] px-2 py-0.5 text-[#315f9b]">
                    {state.sourceIntelligence.intelligence.summary.items.toLocaleString("ar-SA")} مادة مرجعية
                  </span>
                </div>
                <h2 className="mt-2 text-lg font-black text-[var(--color-text-title)]">تحويل الأرشيف إلى مصادر رصد قابلة للتعديل</h2>
                <p className="mt-1 max-w-3xl text-xs font-semibold leading-6 text-[var(--color-text-muted)]">
                  تم استخراج كلمات دالة، حسابات اجتماعية، ومواقع إخبارية من التقارير القديمة. طبّق ما تحتاجه ثم عدّل القوائم من نفس الصفحة.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applySourceIntelligence("apply_keywords")}
                  disabled={pending !== null}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#111111] px-3 text-xs font-bold text-white transition hover:bg-stone-900 disabled:opacity-50"
                >
                  {pending === "source-intelligence-apply_keywords" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  تطبيق الكلمات
                </button>
                <button
                  type="button"
                  onClick={() => applySourceIntelligence("apply_social_watchlists")}
                  disabled={pending !== null}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#00C853]/20 bg-[#e8f5ef] px-3 text-xs font-extrabold text-[#0f6b57] transition hover:bg-[#d4f2e4] disabled:opacity-50"
                >
                  {pending === "source-intelligence-apply_social_watchlists" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                  إضافة رصد TikTok/Instagram
                </button>
                <button
                  type="button"
                  onClick={() => applySourceIntelligence("apply_reference_sources")}
                  disabled={pending !== null}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 text-xs font-bold text-[var(--color-text-title)] transition hover:border-[#2383E2]/40 disabled:opacity-50"
                >
                  {pending === "source-intelligence-apply_reference_sources" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                  حفظ الأخبار وX
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <SourceIntelPreview
                title="كلمات الرصد"
                items={[...state.sourceIntelligence.intelligence.keywords.requiredTerms, ...state.sourceIntelligence.intelligence.keywords.hashtags].slice(0, 8)}
              />
              <SourceIntelPreview
                title="مصادر الأخبار"
                items={state.sourceIntelligence.intelligence.newsSources.slice(0, 8).map((source) => `${source.label} (${source.count})`)}
              />
              <SourceIntelPreview
                title="حسابات X"
                items={state.sourceIntelligence.intelligence.xAccounts.slice(0, 8).map((source) => `${source.label} (${source.count})`)}
              />
              <SourceIntelPreview
                title="TikTok/Instagram"
                items={[
                  ...state.sourceIntelligence.intelligence.tiktokProfiles.slice(0, 4),
                  ...state.sourceIntelligence.intelligence.instagramProfiles.slice(0, 4),
                ].map((source) => `${source.label} (${source.count})`)}
              />
            </div>
          </section>
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

          <BentoCard colSpan="col-span-12 xl:col-span-5" title="رصد TikTok/Instagram الآلي" icon={Power} subtitle="Watchlists لحسابات محددة أو بحث TikTok Research">
            <div className="space-y-4">
              <form onSubmit={submitWatchlistRule} className="space-y-3">
                <select
                  value={watchlistType}
                  onChange={(event) => setWatchlistType(event.target.value as WatchlistType)}
                  className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 text-xs font-bold outline-none transition focus:border-[#2383E2] focus:bg-white"
                >
                  <option value="tiktok_research">TikTok Research</option>
                  <option value="instagram_public_profile">Instagram Profile</option>
                </select>
                <input
                  value={watchlistQuery}
                  onChange={(event) => setWatchlistQuery(event.target.value)}
                  placeholder={watchlistType === "tiktok_research" ? "كلمة بحث أو هاشتاق..." : "استعلام اختياري للفلترة..."}
                  className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 text-xs outline-none transition focus:border-[#2383E2] focus:bg-white"
                />
                <input
                  value={watchlistUrl}
                  onChange={(event) => setWatchlistUrl(event.target.value)}
                  placeholder={watchlistType === "instagram_public_profile" ? "https://instagram.com/profile" : "رابط TikTok اختياري..."}
                  className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 text-left text-xs outline-none transition focus:border-[#2383E2] focus:bg-white"
                  dir="ltr"
                  required={watchlistType === "instagram_public_profile"}
                />
                <select
                  value={watchlistIntervalMinutes}
                  onChange={(event) => setWatchlistIntervalMinutes(Number(event.target.value))}
                  className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 text-xs font-bold outline-none transition focus:border-[#2383E2] focus:bg-white"
                >
                  {watchlistScheduleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={pending !== null}
                  className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#111111] text-xs font-bold text-white transition hover:bg-stone-900 disabled:opacity-50"
                >
                  {pending === "watchlist-rule" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  إضافة قاعدة رصد
                </button>
              </form>

              <button
                type="button"
                onClick={runDueWatchlists}
                disabled={pending !== null || state.sourceRules.length === 0}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white text-xs font-bold text-[var(--color-text-title)] transition hover:border-[#2383E2]/40 hover:text-[#2383E2] disabled:opacity-50"
              >
                {pending === "watchlist-run-due" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                تشغيل القواعد المستحقة الآن
              </button>

              {state.sourceRules.length ? (
                <div className="space-y-2">
                  {state.sourceRules.map((rule) => {
                    const latestRun = latestRunForRule(rule, state.connectorRuns);
                    return (
                      <div key={rule.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${rule.active ? "bg-[#00C853]" : "bg-stone-300"}`} />
                              <p className="text-sm font-extrabold text-[var(--color-text-title)]">{sourceRulePlatform(rule)}</p>
                              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[var(--color-text-muted)]">
                                {rule.active ? "نشطة" : "متوقفة"}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-left text-[10px] font-semibold text-[var(--color-text-muted)]" dir="ltr">
                              {sourceRuleTarget(rule)}
                            </p>
                            <p className="mt-2 text-[10px] font-bold text-[var(--color-text-muted)]">{connectorRunLabel(latestRun)}</p>
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-[10px] font-bold text-[var(--color-text-muted)]">الجدولة</span>
                              <select
                                value={rule.pollIntervalMinutes}
                                onChange={(event) => updateWatchlistSchedule(rule, Number(event.target.value))}
                                disabled={pending !== null}
                                className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[10px] font-bold text-[var(--color-text-title)] outline-none transition focus:border-[#2383E2] disabled:opacity-50"
                              >
                                {watchlistScheduleOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleWatchlistRule(rule)}
                              disabled={pending !== null}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] transition hover:border-[#2383E2]/40 hover:text-[#2383E2] disabled:opacity-50"
                              title={rule.active ? "إيقاف" : "تفعيل"}
                            >
                              {pending === `watchlist-toggle-${rule.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteWatchlistRule(rule)}
                              disabled={pending !== null}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#f1b6aa] bg-[#fff8f6] text-[#9a341f] transition hover:border-[#d7745f] disabled:opacity-50"
                              title="حذف"
                            >
                              {pending === `watchlist-delete-${rule.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-main)] p-6 text-center text-xs font-bold text-[var(--color-text-muted)]">
                  لا توجد قواعد TikTok أو Instagram محفوظة بعد.
                </div>
              )}
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

          <BentoCard colSpan="col-span-12 xl:col-span-7" title="مصادر مرجعية من الأرشيف" icon={Globe} subtitle="مواقع وحسابات X مستخرجة من التقارير الأصلية، محفوظة للتنظيم والتحويل لاحقًا إلى رصد نشط">
            {referenceSources.length ? (
              <div className="space-y-2">
                {referenceSources.map((source) => (
                  <div key={source.id} className="grid gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${source.isActive ? "bg-[#00C853]" : "bg-stone-300"}`} />
                        <p className="truncate text-sm font-extrabold text-[var(--color-text-title)]">{source.name}</p>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[var(--color-text-muted)]">
                          {source.type === "x_recent_search" ? "X" : "Web"}
                        </span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[var(--color-text-muted)]">
                          {source.isActive ? "نشط" : "مرجعي"}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-left text-[10px] font-semibold text-[var(--color-text-muted)]" dir="ltr">
                        {source.url}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => updateSourceSchedule(source, { isActive: !source.isActive })}
                      disabled={pending !== null}
                      className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-[var(--color-border)] bg-white px-3 text-[11px] font-bold transition hover:bg-stone-50 disabled:opacity-50"
                    >
                      {source.isActive ? "إيقاف" : "تفعيل مرجعي"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-main)] p-6 text-center text-xs font-bold text-[var(--color-text-muted)]">
                لم تحفظ بعد مصادر مرجعية من الأرشيف. استخدم زر &quot;حفظ الأخبار وX&quot; أعلى الصفحة.
              </div>
            )}
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

function SourceIntelPreview({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3">
      <h3 className="text-xs font-extrabold text-[var(--color-text-title)]">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.length ? (
          items.map((item) => (
            <span key={item} className="max-w-full truncate rounded-full bg-white px-2 py-1 text-[10px] font-bold text-[var(--color-text-muted)]">
              {item}
            </span>
          ))
        ) : (
          <span className="text-[10px] font-bold text-[var(--color-text-muted)]">لا توجد اقتراحات كافية</span>
        )}
      </div>
    </div>
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
