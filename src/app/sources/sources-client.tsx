"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Database,
  Globe,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { ConnectorRun, KeywordRule, MonitoringItem, Source, SourceRule } from "@/lib/types";
import type { LegacySourceIntelligence } from "@/lib/legacy-source-intelligence";
import AppShell from "@/components/AppShell";
import { BrandIcon, brandFromLabel } from "@/components/BrandIcon";

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
type SourceSection = "keywords" | "news" | "social" | "x" | "archive";

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

const sourceSections: Array<{ id: SourceSection; label: string; description: string }> = [
  { id: "keywords", label: "الكلمات", description: "قواعد المطابقة" },
  { id: "news", label: "الأخبار", description: "RSS والمواقع" },
  { id: "social", label: "TikTok / Instagram", description: "حسابات ومنشورات" },
  { id: "x", label: "X", description: "بحث وحسابات" },
  { id: "archive", label: "سجل الفحص", description: "آخر النتائج" },
];

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
  if (!run) return "لم يتم فحصه بعد";
  if (run.status === "success") return `آخر فحص ناجح · ${run.fetchedCount.toLocaleString("ar-SA")} مادة جديدة`;
  if (run.status === "failed") return `يحتاج انتباه · ${friendlyConnectorFailure(run.failureReason)}`;
  return run.status;
}

function friendlyConnectorFailure(reason?: string | null) {
  if (!reason) return "تعذر الفحص، جرّب تشغيل المصدر مرة أخرى.";
  if (reason.includes("input.username is required")) return "حساب Instagram يحتاج اسم مستخدم واضح بدل رابط غير مكتمل.";
  if (reason.includes("apify_http_400")) return "مزود Instagram رفض بيانات الحساب. راجع الرابط أو اسم المستخدم.";
  if (reason.includes("apify_instagram_fetch_failed")) return "تعذر جلب حساب Instagram من المزود.";
  return reason.length > 120 ? `${reason.slice(0, 120)}...` : reason;
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
  const [section, setSection] = useState<SourceSection>("social");
  const [sourceSearch, setSourceSearch] = useState("");

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

  const xReferenceSources = useMemo(
    () =>
      referenceSources.filter(
        (source) =>
          source.type === "x_recent_search" ||
          source.url.includes("x.com") ||
          source.url.includes("twitter.com") ||
          source.name.toLowerCase().includes("x"),
      ),
    [referenceSources],
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
    setMessage("جاري فحص مصادر TikTok/Instagram الجاهزة...");
    setMessageType("info");

    try {
      const result = await apiJson<RunDueResponse>("/api/source-rules/run-due", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refreshSilently();
      const checked = result.dueRulesCount.toLocaleString("ar-SA");
      const executed = result.executedCount.toLocaleString("ar-SA");
      const failed = result.failedCount.toLocaleString("ar-SA");
      setMessage(
        result.failedCount
          ? `فحصنا ${checked} مصدر جاهز، اكتملت ${executed} عملية، وتعثر ${failed}.`
          : `فحصنا ${checked} مصدر جاهز، واكتملت ${executed} عملية فحص.`,
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

  const searchTerm = sourceSearch.trim().toLowerCase();
  const matchesSearch = (values: Array<string | null | undefined>) =>
    !searchTerm || values.some((value) => value?.toLowerCase().includes(searchTerm));
  const visibleSocialRules = state.sourceRules.filter((rule) => matchesSearch([sourceRulePlatform(rule), sourceRuleTarget(rule)]));
  const visibleRssSources = rssSources.filter((source) => matchesSearch([source.name, source.feedUrl, source.url]));
  const visibleXSources = xReferenceSources.filter((source) => matchesSearch([source.name, source.url, source.handle]));
  const visibleArchiveSources = referenceSources.filter((source) => matchesSearch([source.name, source.url, source.handle]));
  const failedRuns = state.connectorRuns.filter((run) => run.status === "failed").length;

  return (
    <AppShell>
      <div className="min-h-screen bg-[#f7f8fa] p-4 md:p-5" dir="rtl">
        <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.84fr)_minmax(520px,1.35fr)_minmax(300px,0.86fr)]">
          <section className="rounded-lg border border-[var(--color-border)] bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--color-text-muted)]">
                  <Sparkles className="h-4 w-4 text-[#2383E2]" />
                  <span>من التقارير الأصلية</span>
                </div>
                <h2 className="mt-2 text-xl font-black text-[var(--color-text-title)]">مصادر جاهزة للرصد</h2>
                <p className="mt-1 text-xs font-semibold leading-6 text-[var(--color-text-muted)]">
                  طبّق الكلمات والحسابات والمواقع المستخرجة ثم عدّلها من القائمة.
                </p>
              </div>
              <button
                type="button"
                onClick={refresh}
                disabled={pending !== null}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] transition hover:border-[#2383E2]/40 hover:text-[#2383E2] disabled:opacity-50"
                title="تحديث"
              >
                <RefreshCw className={`h-4 w-4 ${pending === "refresh" ? "animate-spin" : ""}`} />
              </button>
            </div>

            {message && (
              <div className={`mb-4 rounded-lg border p-3 text-xs font-bold leading-5 ${messageClass(messageType)}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{message}</span>
                </div>
                <button type="button" onClick={() => setMessage(null)} className="mt-2 text-[10px] font-extrabold underline">
                  إغلاق التنبيه
                </button>
              </div>
            )}

            <div className="grid gap-3">
              <MiniMetric label="كلمات فعالة" value={(activeKeywordRule?.requiredTerms.length ?? 0).toLocaleString("ar-SA")} tone="blue" />
              <MiniMetric label="حسابات اجتماعية" value={state.sourceRules.length.toLocaleString("ar-SA")} tone="green" />
              <MiniMetric label="أخبار RSS" value={rssSources.length.toLocaleString("ar-SA")} tone="orange" />
              <MiniMetric label="فشل يحتاج انتباه" value={failedRuns.toLocaleString("ar-SA")} tone="red" />
            </div>

            {state.sourceIntelligence && (
              <div className="mt-4 space-y-3">
                <SourceIntelPreview
                  title="كلمات دالة"
                  items={[...state.sourceIntelligence.intelligence.keywords.requiredTerms, ...state.sourceIntelligence.intelligence.keywords.hashtags].slice(0, 8)}
                />
                <SourceIntelPreview
                  title="حسابات ومنصات"
                  items={[
                    ...state.sourceIntelligence.intelligence.tiktokProfiles.slice(0, 3),
                    ...state.sourceIntelligence.intelligence.instagramProfiles.slice(0, 3),
                    ...state.sourceIntelligence.intelligence.xAccounts.slice(0, 2),
                  ].map((source) => `${source.label} (${source.count})`)}
                />
                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => applySourceIntelligence("apply_social_watchlists")}
                    disabled={pending !== null}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1f6feb] px-3 text-xs font-extrabold text-white transition hover:bg-[#195ec9] disabled:opacity-50"
                  >
                    {pending === "source-intelligence-apply_social_watchlists" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    إضافة حسابات التواصل
                  </button>
                  <button
                    type="button"
                    onClick={() => applySourceIntelligence("apply_keywords")}
                    disabled={pending !== null}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs font-bold text-[var(--color-text-title)] transition hover:border-[#2383E2]/40 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    تحديث الكلمات الدالة
                  </button>
                  <button
                    type="button"
                    onClick={() => applySourceIntelligence("apply_reference_sources")}
                    disabled={pending !== null}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs font-bold text-[var(--color-text-title)] transition hover:border-[#2383E2]/40 disabled:opacity-50"
                  >
                    <Globe className="h-4 w-4" />
                    حفظ الأخبار وX
                  </button>
                </div>
              </div>
            )}
          </section>

          <main className="rounded-lg border border-[var(--color-border)] bg-white p-4 shadow-sm">
            <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Database className="h-7 w-7 text-[var(--color-text-muted)]" />
                  <h1 className="text-2xl font-black tracking-tight text-[var(--color-text-title)]">المصادر</h1>
                </div>
                <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">إدارة جميع مصادر الرصد والقواعد والكلمات المفتاحية.</p>
              </div>
              <button
                type="button"
                onClick={() => setSection(section === "social" ? "news" : "social")}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1f6feb] px-4 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#195ec9]"
              >
                <Plus className="h-4 w-4" />
                إضافة مصدر
              </button>
            </header>

            <div className="mb-4 border-b border-[var(--color-border)]">
              <div className="flex gap-1 overflow-x-auto">
                {sourceSections.map((sourceSection) => (
                  <button
                    key={sourceSection.id}
                    type="button"
                    onClick={() => setSection(sourceSection.id)}
                    className={`h-10 shrink-0 border-b-2 px-4 text-xs font-extrabold transition ${
                      section === sourceSection.id
                        ? "border-[#1f6feb] text-[#1f6feb]"
                        : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-title)]"
                    }`}
                  >
                    {sourceSection.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_140px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  value={sourceSearch}
                  onChange={(event) => setSourceSearch(event.target.value)}
                  placeholder="ابحث في المصادر..."
                  className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-white pr-9 pl-3 text-xs font-semibold outline-none transition focus:border-[#1f6feb]"
                />
              </label>
              <select className="h-10 rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs font-bold outline-none">
                <option>كل المنصات</option>
                <option>TikTok</option>
                <option>Instagram</option>
                <option>X</option>
                <option>الأخبار</option>
              </select>
              <select className="h-10 rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs font-bold outline-none">
                <option>كل الحالات</option>
                <option>يعمل</option>
                <option>يحتاج تعديل</option>
                <option>متوقف</option>
              </select>
            </div>

            <div className="space-y-3">
              {section === "social" &&
                (visibleSocialRules.length ? (
                  visibleSocialRules.map((rule) => {
                    const latestRun = latestRunForRule(rule, state.connectorRuns);
                    return (
                      <SourceListRow
                        key={rule.id}
                        logo={sourceRulePlatform(rule)}
                        title={sourceRuleTarget(rule)}
                        platform={sourceRulePlatform(rule)}
                        status={rule.active ? (latestRun?.status === "failed" ? "attention" : "active") : "paused"}
                        statusText={rule.active ? (latestRun?.status === "failed" ? "يحتاج تعديل" : "يعمل") : "متوقف"}
                        detail={`آخر نتيجة: ${connectorRunLabel(latestRun)}`}
                        target={sourceRuleTarget(rule)}
                        schedule={scheduleLabel(rule.pollIntervalMinutes)}
                        actions={
                          <>
                            <select
                              value={rule.pollIntervalMinutes}
                              onChange={(event) => updateWatchlistSchedule(rule, Number(event.target.value))}
                              disabled={pending !== null}
                              className="h-9 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[10px] font-bold outline-none disabled:opacity-50"
                            >
                              {watchlistScheduleOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => toggleWatchlistRule(rule)}
                              disabled={pending !== null}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#f1b6aa] bg-[#fff8f6] px-3 text-[11px] font-extrabold text-[#9a341f] disabled:opacity-50"
                            >
                              {rule.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                              {rule.active ? "إيقاف" : "تفعيل"}
                            </button>
                            <button
                              type="button"
                              onClick={runDueWatchlists}
                              disabled={pending !== null}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#c7d8f3] bg-[#f6f9ff] px-3 text-[11px] font-extrabold text-[#1f6feb] disabled:opacity-50"
                            >
                              <Play className="h-3.5 w-3.5" />
                              اختبر الآن
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteWatchlistRule(rule)}
                              disabled={pending !== null}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] transition hover:border-[#f1b6aa] hover:text-[#9a341f] disabled:opacity-50"
                              title="حذف"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        }
                      />
                    );
                  })
                ) : (
                  <EmptySources label="لا توجد قواعد TikTok أو Instagram مطابقة." />
                ))}

              {section === "news" &&
                (visibleRssSources.length ? (
                  visibleRssSources.map((source) => (
                    <SourceListRow
                      key={source.id}
                      logo="News"
                      title={source.name}
                      platform="الأخبار"
                      status={source.isActive ? (source.lastError ? "attention" : "active") : "paused"}
                      statusText={source.isActive ? (source.lastError ? "يحتاج تعديل" : "يعمل") : "متوقف"}
                      detail={source.lastError ? friendlyConnectorFailure(source.lastError) : `آخر فحص: ${source.lastCheckedAt ? new Date(source.lastCheckedAt).toLocaleString("ar-SA", { hour12: false }) : "لم يفحص بعد"}`}
                      target={source.feedUrl ?? source.url}
                      schedule={scheduleLabel(source.pollIntervalMinutes)}
                      actions={
                        <>
                          <select
                            value={source.pollIntervalMinutes}
                            onChange={(event) => updateSourceSchedule(source, { pollIntervalMinutes: Number(event.target.value) })}
                            disabled={pending !== null}
                            className="h-9 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[10px] font-bold outline-none disabled:opacity-50"
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
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#f1b6aa] bg-[#fff8f6] px-3 text-[11px] font-extrabold text-[#9a341f] disabled:opacity-50"
                          >
                            {source.isActive ? "إيقاف" : "تفعيل"}
                          </button>
                          <button
                            type="button"
                            onClick={() => pollSource(source)}
                            disabled={pending !== null || !source.isActive}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#c7d8f3] bg-[#f6f9ff] px-3 text-[11px] font-extrabold text-[#1f6feb] disabled:opacity-50"
                          >
                            <Play className="h-3.5 w-3.5" />
                            اختبر الآن
                          </button>
                        </>
                      }
                    />
                  ))
                ) : (
                  <EmptySources label="لا توجد مصادر أخبار مطابقة." />
                ))}

              {section === "x" &&
                (visibleXSources.length ? (
                  visibleXSources.map((source) => (
                    <SourceListRow
                      key={source.id}
                      logo="X"
                      title={source.name}
                      platform="X"
                      status={source.isActive ? "active" : "paused"}
                      statusText={source.isActive ? "يعمل" : "مرجعي"}
                      detail={source.lastError ? friendlyConnectorFailure(source.lastError) : "بحث X محفوظ ضمن مصادر التقارير الأصلية."}
                      target={source.url}
                      schedule={scheduleLabel(source.pollIntervalMinutes)}
                      actions={
                        <button
                          type="button"
                          onClick={() => updateSourceSchedule(source, { isActive: !source.isActive })}
                          disabled={pending !== null}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#f1b6aa] bg-[#fff8f6] px-3 text-[11px] font-extrabold text-[#9a341f] disabled:opacity-50"
                        >
                          {source.isActive ? "إيقاف" : "تفعيل"}
                        </button>
                      }
                    />
                  ))
                ) : (
                  <EmptySources label="لا توجد مصادر X مطابقة." />
                ))}

              {section === "keywords" && (
                <form onSubmit={submitKeywordRule} className="grid gap-3">
                  <KeywordBox label="إشارات رئيسية" value={requiredTerms} onChange={setRequiredTerms} placeholder={"هداية\nهاكاثون هداية"} />
                  <KeywordBox label="كلمات سياق" value={optionalTerms} onChange={setOptionalTerms} placeholder={"الابتكار\nالحرمين\nالشؤون الدينية"} />
                  <KeywordBox label="استبعاد" value={excludeTerms} onChange={setExcludeTerms} placeholder={"وظائف\nإعلان ممول"} />
                  <button
                    type="submit"
                    disabled={pending !== null}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#111111] text-xs font-extrabold text-white transition hover:bg-stone-900 disabled:opacity-50"
                  >
                    {pending === "keywords" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    حفظ الكلمات
                  </button>
                </form>
              )}

              {section === "archive" && (
                <>
                  {visibleArchiveSources.length ? (
                    visibleArchiveSources.map((source) => (
                      <SourceListRow
                        key={source.id}
                        logo={source.type === "x_recent_search" ? "X" : "News"}
                        title={source.name}
                        platform={source.type === "x_recent_search" ? "X" : "مرجعي"}
                        status={source.isActive ? "active" : "paused"}
                        statusText={source.isActive ? "يعمل" : "مرجعي"}
                        detail={source.lastError ? friendlyConnectorFailure(source.lastError) : "محفوظ من التقارير الأصلية."}
                        target={source.url}
                        schedule={scheduleLabel(source.pollIntervalMinutes)}
                        actions={
                          <button
                            type="button"
                            onClick={() => updateSourceSchedule(source, { isActive: !source.isActive })}
                            disabled={pending !== null}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3 text-[11px] font-bold disabled:opacity-50"
                          >
                            {source.isActive ? "إيقاف" : "تفعيل مرجعي"}
                          </button>
                        }
                      />
                    ))
                  ) : (
                    <EmptySources label="لا توجد مصادر مرجعية محفوظة." />
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    <AdvancedLink href="/imports" title="استيراد التقارير القديمة" description="مراجعة بيانات التقارير قبل اعتمادها داخل المنصة." />
                    <AdvancedLink href="/imports/backfill" title="استكمال روابط التقارير" description="تنظيف الروابط القديمة والروابط الناقصة من ملفات التقارير." />
                  </div>
                </>
              )}
            </div>
          </main>

          <aside className="rounded-lg border border-[var(--color-border)] bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-[var(--color-text-title)]">إضافة وتشغيل</h2>
                <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">كل أوامر التشغيل السريعة في مكان واحد.</p>
              </div>
              <Link
                href="/ops"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] transition hover:border-[#2383E2]/40 hover:text-[#2383E2]"
                title="الرصد اليومي"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </div>

            <div className="space-y-5">
              <div className="rounded-lg border border-[var(--color-border)] bg-[#fbfbfc] p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <SourceLogo label={watchlistType === "tiktok_research" ? "TikTok" : "Instagram"} />
                    <div>
                      <h3 className="text-sm font-black text-[var(--color-text-title)]">TikTok / Instagram</h3>
                      <p className="text-[10px] font-bold text-[var(--color-text-muted)]">حسابات وقواعد آلية</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={runDueWatchlists}
                    disabled={pending !== null || state.sourceRules.length === 0}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#c7d8f3] bg-white px-2 text-[10px] font-extrabold text-[#1f6feb] disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" />
                    اختبر الكل
                  </button>
                </div>
                <form onSubmit={submitWatchlistRule} className="space-y-2">
                  <select
                    value={watchlistType}
                    onChange={(event) => setWatchlistType(event.target.value as WatchlistType)}
                    className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs font-bold outline-none focus:border-[#1f6feb]"
                  >
                    <option value="tiktok_research">TikTok Research</option>
                    <option value="instagram_public_profile">Instagram Profile</option>
                  </select>
                  <input
                    value={watchlistQuery}
                    onChange={(event) => setWatchlistQuery(event.target.value)}
                    placeholder={watchlistType === "tiktok_research" ? "كلمة بحث أو هاشتاق..." : "استعلام اختياري للفلترة..."}
                    className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs outline-none focus:border-[#1f6feb]"
                  />
                  <input
                    value={watchlistUrl}
                    onChange={(event) => setWatchlistUrl(event.target.value)}
                    placeholder={watchlistType === "instagram_public_profile" ? "https://instagram.com/profile" : "رابط TikTok اختياري..."}
                    className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-left text-xs outline-none focus:border-[#1f6feb]"
                    dir="ltr"
                    required={watchlistType === "instagram_public_profile"}
                  />
                  <select
                    value={watchlistIntervalMinutes}
                    onChange={(event) => setWatchlistIntervalMinutes(Number(event.target.value))}
                    className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs font-bold outline-none focus:border-[#1f6feb]"
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
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#111111] text-xs font-extrabold text-white transition hover:bg-stone-900 disabled:opacity-50"
                  >
                    {pending === "watchlist-rule" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    إضافة قاعدة رصد
                  </button>
                </form>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[#fbfbfc] p-3">
                <div className="mb-3 flex items-center gap-2">
                  <SourceLogo label="News" />
                  <div>
                    <h3 className="text-sm font-black text-[var(--color-text-title)]">مصدر أخبار</h3>
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)]">RSS وجدولة فحص</p>
                  </div>
                </div>
              <form onSubmit={submitRssSource} className="grid gap-2 md:grid-cols-[minmax(160px,220px)_1fr_auto]">
                <input
                  value={rssName}
                  onChange={(event) => setRssName(event.target.value)}
                  placeholder="اسم المصدر"
                  className="h-10 rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs outline-none transition focus:border-[#1f6feb]"
                />
                <input
                  value={rssFeedUrl}
                  onChange={(event) => setRssFeedUrl(event.target.value)}
                  placeholder="رابط موجز RSS..."
                  className="h-10 rounded-lg border border-[var(--color-border)] bg-white px-3 text-left text-xs outline-none transition focus:border-[#1f6feb]"
                  dir="ltr"
                  required
                />
                <button
                  type="submit"
                  disabled={pending !== null}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#111111] px-4 text-xs font-extrabold text-white transition hover:bg-stone-900 disabled:opacity-50"
                >
                  {pending === "rss-source" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  إضافة
                </button>
              </form>
              <button
                type="button"
                onClick={pollActiveSources}
                disabled={pending !== null || !activeRssSources.length}
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#b7ddce] bg-[#ecf7f2] text-xs font-extrabold text-[#0f6b57] transition hover:bg-[#d4f2e4] disabled:opacity-50"
              >
                {pending === "poll-active" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                فحص كل المصادر النشطة
              </button>
            </div>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone: "blue" | "green" | "orange" | "red" }) {
  const toneClass = {
    blue: "border-[#c7d8f3] bg-[#f6f9ff] text-[#1f6feb]",
    green: "border-[#b7ddce] bg-[#ecf7f2] text-[#0f6b57]",
    orange: "border-[#efd4ad] bg-[#fff8ec] text-[#9a5b00]",
    red: "border-[#f1b6aa] bg-[#fff1ed] text-[#9a341f]",
  }[tone];

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <span className="block text-[10px] font-extrabold opacity-80">{label}</span>
      <span className="mt-1 block text-xl font-black">{value}</span>
    </div>
  );
}

function SourceListRow({
  logo,
  title,
  platform,
  status,
  statusText,
  detail,
  target,
  schedule,
  actions,
}: {
  logo: string;
  title: string;
  platform: string;
  status: "active" | "attention" | "paused";
  statusText: string;
  detail: string;
  target: string;
  schedule: string;
  actions: ReactNode;
}) {
  const statusClass =
    status === "active"
      ? "bg-[#ecf7f2] text-[#0f6b57]"
      : status === "attention"
        ? "bg-[#fff8ec] text-[#9a5b00]"
        : "bg-stone-100 text-stone-500";

  return (
    <article className="rounded-lg border border-[var(--color-border)] bg-white p-3 shadow-[0_1px_8px_rgba(15,23,42,0.03)]">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <SourceLogo label={logo} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-black text-[var(--color-text-title)]">{title}</h3>
              <span className="rounded-full border border-[var(--color-border)] bg-[#fbfbfc] px-2 py-0.5 text-[10px] font-bold text-[var(--color-text-muted)]">
                {platform}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${statusClass}`}>{statusText}</span>
            </div>
            <p className="mt-1 text-xs font-semibold leading-5 text-[var(--color-text-muted)]">{detail}</p>
            <p className="mt-2 truncate text-left text-[10px] font-semibold text-[var(--color-text-muted)]" dir="ltr">
              {target}
            </p>
            <p className="mt-2 text-[10px] font-extrabold text-[#0f6b57]">جدولة الفحص: {schedule}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>
      </div>
    </article>
  );
}

function SourceLogo({ label }: { label: string }) {
  return <BrandIcon brand={brandFromLabel(label)} size="lg" />;
}

function EmptySources({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[#fbfbfc] p-8 text-center text-xs font-bold text-[var(--color-text-muted)]">
      {label}
    </div>
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
