"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Database,
  FileText,
  Filter,
  Layers3,
  RefreshCw,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type {
  ImportedReportItem,
  ImportedReportsDataset,
  ImportReviewState,
} from "@/lib/imported-reports";

type Filters = {
  report: string;
  platform: string;
  confidence: string;
  page: string;
  query: string;
};

type LegacyImportStatus = {
  imported: boolean;
  importedItems: number;
  importedReports: number;
  linkedReportItems: number;
  sourceItems: number;
  reportsCreated?: number;
  itemsCreated?: number;
  capturesCreated?: number;
  linksCreated?: number;
  duplicatesSkipped?: number;
};

type SupabaseImportPlan = {
  summary: {
    reports: number;
    monitoringItems: number;
    reportItems: number;
    captures: number;
    sources: number;
    openableOriginalUrls: number;
    missingOriginalUrls: number;
    invalidOriginalUrls: number;
  };
  batches: Array<{
    table: string;
    rows: number;
    onConflict: string;
  }>;
};

type PersistenceStatus = {
  mode: "memory" | "supabase";
  ok: boolean;
  publicConfigured: boolean;
  serverConfigured: boolean;
  projectRef: string | null;
  message: string;
  missing?: {
    serviceRoleKey?: boolean;
  };
};

const reviewStateLabels: Record<ImportReviewState, string> = {
  ready: "جاهزة للمراجعة",
  needs_cleaning: "تحتاج تنظيف",
  approved: "معتمدة للاستيراد",
};

const reviewStateStyles: Record<ImportReviewState, string> = {
  ready: "bg-[#e8f3ef] text-[#1f675d] border-[#cfe7df]",
  needs_cleaning: "bg-[#fff1df] text-[#9a5522] border-[#f4d7b0]",
  approved: "bg-[#eef0ff] text-[#554bc2] border-[#d8daf7]",
};

const confidenceLabels: Record<string, string> = {
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
};

const sentimentLabels: Record<string, string> = {
  positive: "إيجابي",
  neutral: "محايد",
  negative: "سلبي",
};

export function ImportsClient({ dataset }: { dataset: ImportedReportsDataset }) {
  const [filters, setFilters] = useState<Filters>({
    report: "all",
    platform: "all",
    confidence: "all",
    page: "all",
    query: "",
  });
  const [selectedId, setSelectedId] = useState(dataset.items[0]?.id ?? "");
  const [stateById, setStateById] = useState<Record<string, ImportReviewState>>({});
  const [legacyStatus, setLegacyStatus] = useState<LegacyImportStatus | null>(null);
  const [supabasePlan, setSupabasePlan] = useState<SupabaseImportPlan | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isCheckingSupabasePlan, setIsCheckingSupabasePlan] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const selectedItem =
    dataset.items.find((item) => item.id === selectedId) ?? dataset.items[0] ?? null;

  const filteredItems = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return dataset.items.filter((item) => {
      const matchesReport = filters.report === "all" || item.sourcePdf === filters.report;
      const matchesPlatform = filters.platform === "all" || item.platform === filters.platform;
      const matchesConfidence =
        filters.confidence === "all" || item.confidence === filters.confidence;
      const matchesPage = filters.page === "all" || String(item.page) === filters.page;
      const matchesQuery =
        !query ||
        [
          item.title,
          item.summary,
          item.authorName,
          item.sourceName,
          item.publishedDateText,
          item.capturedAtText,
          item.rawText,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesReport && matchesPlatform && matchesConfidence && matchesPage && matchesQuery;
    });
  }, [dataset.items, filters]);

  const stateCounts = useMemo(() => {
    return dataset.items.reduce(
      (acc, item) => {
        const state = stateById[item.id] ?? item.initialState;
        acc[state] += 1;
        return acc;
      },
      { approved: 0, needs_cleaning: 0, ready: 0 } satisfies Record<ImportReviewState, number>,
    );
  }, [dataset.items, stateById]);

  useEffect(() => {
    fetch("/api/imports/legacy/status")
      .then((response) => response.json())
      .then((json) => setLegacyStatus(json.legacy_import))
      .catch(() => setImportError("تعذر قراءة حالة الاستيراد الحالية."));
    fetch("/api/admin/persistence")
      .then((response) => response.json())
      .then((json) => setPersistenceStatus(json.persistence))
      .catch(() => setImportError("تعذر قراءة حالة اتصال Supabase الحالية."));
    refreshSupabasePlan();
  }, []);

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function setReviewState(itemId: string, state: ImportReviewState) {
    setStateById((current) => ({ ...current, [itemId]: state }));
  }

  async function importApprovedLegacyData() {
    setIsImporting(true);
    setImportError(null);

    try {
      const response = await fetch("/api/imports/legacy", { method: "POST" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "legacy_import_failed");
      setLegacyStatus(json.legacy_import);
    } catch {
      setImportError("فشل استيراد البيانات القديمة. جرّب مرة أخرى أو راجع سجلات الخادم.");
    } finally {
      setIsImporting(false);
    }
  }

  async function refreshSupabasePlan() {
    setIsCheckingSupabasePlan(true);

    try {
      const response = await fetch("/api/imports/legacy/supabase-plan");
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "supabase_plan_failed");
      setSupabasePlan(json.supabase_import);
    } catch {
      setImportError("تعذر تجهيز خطة النقل إلى Supabase. راجع سجلات الخادم أو أعد المحاولة.");
    } finally {
      setIsCheckingSupabasePlan(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1540px] gap-5 px-4 py-5 lg:grid-cols-[300px_1fr_370px] lg:px-7">
      <aside className="space-y-5">
        <section className="rounded-lg border border-[#dfe3de] bg-white p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="text-[#277466]" size={18} />
            <h2 className="font-semibold">ملخص الاستيراد</h2>
          </div>
          <div className="mt-4 grid gap-3">
            <SummaryStat label="التقارير الموجودة" value={dataset.reportCount} />
            <SummaryStat label="التقارير الفريدة" value={dataset.uniqueReportCount} />
            <SummaryStat label="المواد الفريدة" value={dataset.uniqueExtractedItems} />
            <SummaryStat label="مواد منخفضة الثقة" value={dataset.lowConfidenceItems} danger />
          </div>
          <div className="mt-4 rounded-lg bg-[#f7f8f6] p-3 text-sm leading-6 text-[#5f6662]">
            تم استبعاد {dataset.duplicateReportCount} تقرير مكرر من قائمة المواد، ويعادل ذلك{" "}
            {dataset.duplicateItemCount} مادة خام لم تدخل في العد الفريد.
          </div>
          <div className="mt-3 rounded-lg border border-[#cfe7df] bg-[#e8f3ef] p-3 text-sm leading-6 text-[#1f675d]">
            كل البيانات القديمة معتمدة مسبقًا لأنها صادرة من تقارير منشورة. التحذيرات هنا تخص
            جودة الاستخراج فقط ولا تمنع الاستيراد.
          </div>
          <button
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#18201e] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isImporting}
            onClick={importApprovedLegacyData}
            type="button"
          >
            <CheckCircle2 size={17} />
            {isImporting
              ? "جار استيراد الداتا القديمة..."
              : legacyStatus?.imported
                ? "إعادة فحص الاستيراد بدون تكرار"
                : "استيراد الداتا القديمة المعتمدة"}
          </button>
          {legacyStatus ? (
            <div className="mt-3 grid gap-2 text-sm">
              <ImportFact label="تقارير مستوردة" value={legacyStatus.importedReports} />
              <ImportFact label="مواد مستوردة" value={legacyStatus.importedItems} />
              <ImportFact label="روابط تقرير" value={legacyStatus.linkedReportItems} />
              <ImportFact label="تكرارات متروكة" value={legacyStatus.duplicatesSkipped ?? 0} />
            </div>
          ) : null}
          {importError ? (
            <div className="mt-3 rounded-lg border border-[#f4d7b0] bg-[#fff1df] p-3 text-sm text-[#9a5522]">
              {importError}
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-[#dfe3de] bg-white p-4">
          <div className="flex items-center gap-2">
            <Database className="text-[#277466]" size={18} />
            <h2 className="font-semibold">جاهزية Supabase</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#69716d]">
            هذه الخطة لا تكتب في قاعدة البيانات من الواجهة؛ هي فحص آمن لما سيُحفظ لاحقًا عند تفعيل مفاتيح السيرفر.
          </p>

          {persistenceStatus ? (
            <div className="mt-4 rounded-lg border border-[#dfe3de] bg-[#fbfbfa] p-3 text-sm leading-6 text-[#4d5652]">
              <div className="flex items-center justify-between gap-3">
                <span>حالة التخزين</span>
                <span className="font-semibold text-[#18201e]">
                  {persistenceStatus.mode === "supabase" ? "Supabase" : "ذاكرة محلية"}
                </span>
              </div>
              <div className="mt-2 grid gap-1">
                <ImportFact label="المشروع" value={persistenceStatus.projectRef ?? "غير محدد"} />
                <ImportFact label="المفتاح العام" value={persistenceStatus.publicConfigured ? "موجود" : "ناقص"} />
                <ImportFact label="مفتاح السيرفر" value={persistenceStatus.serverConfigured ? "موجود" : "ناقص"} />
              </div>
            </div>
          ) : null}

          {supabasePlan ? (
            <div className="mt-4 grid gap-2 text-sm">
              <ImportFact label="تقارير للحفظ" value={supabasePlan.summary.reports} />
              <ImportFact label="مواد للحفظ" value={supabasePlan.summary.monitoringItems} />
              <ImportFact label="لقطات دليل" value={supabasePlan.summary.captures} />
              <ImportFact label="روابط صالحة" value={supabasePlan.summary.openableOriginalUrls} />
              <ImportFact label="روابط ناقصة" value={supabasePlan.summary.missingOriginalUrls} />
              <ImportFact label="روابط معطوبة" value={supabasePlan.summary.invalidOriginalUrls} />
            </div>
          ) : (
            <div className="mt-4 rounded-lg bg-[#f7f8f6] p-3 text-sm text-[#69716d]">
              لم يتم تحميل خطة Supabase بعد.
            </div>
          )}

          <button
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#dfe3de] bg-[#fbfbfa] px-3 text-sm font-semibold text-[#18201e] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isCheckingSupabasePlan}
            onClick={refreshSupabasePlan}
            type="button"
          >
            <RefreshCw className={isCheckingSupabasePlan ? "animate-spin" : ""} size={16} />
            {isCheckingSupabasePlan ? "جاري الفحص..." : "تحديث خطة Supabase"}
          </button>
        </section>

        <section className="rounded-lg border border-[#dfe3de] bg-white p-4">
          <div className="flex items-center gap-2">
            <Filter className="text-[#277466]" size={18} />
            <h2 className="font-semibold">الفلاتر</h2>
          </div>

          <div className="mt-4 space-y-4">
            <label className="block text-sm">
              <span className="text-[#69716d]">بحث نصي</span>
              <div className="relative mt-2">
                <Search
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#69716d]"
                  size={16}
                />
                <input
                  className="h-10 w-full rounded-lg border border-[#dfe3de] bg-[#fbfbfa] pr-9 pl-3 text-sm outline-none focus:border-[#277466]"
                  onChange={(event) => updateFilter("query", event.target.value)}
                  placeholder="ابحث في العنوان أو الكاتب أو النص الخام"
                  value={filters.query}
                />
              </div>
            </label>

            <SelectFilter
              label="التقرير"
              onChange={(value) => updateFilter("report", value)}
              options={[
                { label: "كل التقارير", value: "all" },
                ...dataset.reports
                  .filter((report) => !report.duplicateOf && report.extractedItemCount > 0)
                  .map((report) => ({
                    label: `الإصدار ${report.issue ?? "-"} - ${report.extractedItemCount} مادة`,
                    value: report.sourcePdf,
                  })),
              ]}
              value={filters.report}
            />

            <SelectFilter
              label="المنصة"
              onChange={(value) => updateFilter("platform", value)}
              options={[
                { label: "كل المنصات", value: "all" },
                ...dataset.platforms.map((platform) => ({
                  label: platformLabel(platform),
                  value: platform,
                })),
              ]}
              value={filters.platform}
            />

            <SelectFilter
              label="مستوى الثقة"
              onChange={(value) => updateFilter("confidence", value)}
              options={[
                { label: "كل المستويات", value: "all" },
                ...dataset.confidenceLevels.map((confidence) => ({
                  label: confidenceLabels[confidence],
                  value: confidence,
                })),
              ]}
              value={filters.confidence}
            />

            <SelectFilter
              label="رقم الصفحة"
              onChange={(value) => updateFilter("page", value)}
              options={[
                { label: "كل الصفحات", value: "all" },
                ...dataset.pages.map((page) => ({
                  label: `صفحة ${page}`,
                  value: String(page),
                })),
              ]}
              value={filters.page}
            />
          </div>
        </section>

        <section className="rounded-lg border border-[#dfe3de] bg-white p-4">
          <div className="flex items-center gap-2">
            <Layers3 className="text-[#277466]" size={18} />
            <h2 className="font-semibold">حالات المراجعة</h2>
          </div>
          <div className="mt-4 space-y-2">
            <StateCount state="ready" value={stateCounts.ready} />
            <StateCount state="needs_cleaning" value={stateCounts.needs_cleaning} />
            <StateCount state="approved" value={stateCounts.approved} />
          </div>
        </section>
      </aside>

      <section className="min-w-0 rounded-lg border border-[#dfe3de] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e9e5] px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="text-[#277466]" size={19} />
              <h2 className="font-semibold">مواد التقارير</h2>
            </div>
            <p className="mt-1 text-sm text-[#69716d]">
              يظهر الآن {filteredItems.length} من {dataset.uniqueExtractedItems} مادة فريدة.
            </p>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dfe3de] bg-[#fbfbfa] px-3 text-sm"
            onClick={() =>
              setFilters({
                report: "all",
                platform: "all",
                confidence: "all",
                page: "all",
                query: "",
              })
            }
            type="button"
          >
            <Filter size={16} />
            تصفير الفلاتر
          </button>
        </div>

        <div className="max-h-[calc(100vh-170px)] overflow-auto">
          {filteredItems.length > 0 ? (
            <div className="divide-y divide-[#edf0eb]">
              {filteredItems.map((item) => {
                const reviewState = stateById[item.id] ?? item.initialState;

                return (
                  <ImportItemCard
                    item={item}
                    key={item.id}
                    onSelect={() => setSelectedId(item.id)}
                    onStateChange={(state) => setReviewState(item.id, state)}
                    reviewState={reviewState}
                    selected={selectedItem?.id === item.id}
                  />
                );
              })}
            </div>
          ) : (
            <div className="grid min-h-80 place-items-center p-6 text-center">
              <div>
                <Search className="mx-auto text-[#8a928d]" size={34} />
                <h3 className="mt-3 font-semibold">لا توجد مواد مطابقة</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-[#69716d]">
                  جرّب تقليل الفلاتر أو البحث باسم الكاتب أو رقم الصفحة أو كلمة من الملخص.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-5">
        {selectedItem ? (
          <DetailsPanel
            item={selectedItem}
            onStateChange={(state) => setReviewState(selectedItem.id, state)}
            reviewState={stateById[selectedItem.id] ?? selectedItem.initialState}
          />
        ) : null}
      </aside>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#f7f8f6] px-3 py-3">
      <span className="text-sm text-[#5f6662]">{label}</span>
      <span className={`text-xl font-semibold ${danger ? "text-[#b42323]" : ""}`}>
        {value.toLocaleString("ar")}
      </span>
    </div>
  );
}

function ImportFact({ label, value }: { label: string; value: number | string }) {
  const displayValue = typeof value === "number" ? value.toLocaleString("ar") : value;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2">
      <span className="text-[#5f6662]">{label}</span>
      <span className="font-semibold">{displayValue}</span>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[#69716d]">{label}</span>
      <div className="relative mt-2">
        <select
          className="h-10 w-full appearance-none rounded-lg border border-[#dfe3de] bg-[#fbfbfa] px-3 pl-9 text-sm outline-none focus:border-[#277466]"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#69716d]"
          size={16}
        />
      </div>
    </label>
  );
}

function StateCount({ state, value }: { state: ImportReviewState; value: number }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${reviewStateStyles[state]}`}>
      <span>{reviewStateLabels[state]}</span>
      <span className="font-semibold">{value.toLocaleString("ar")}</span>
    </div>
  );
}

function ImportItemCard({
  item,
  reviewState,
  selected,
  onSelect,
  onStateChange,
}: {
  item: ImportedReportItem;
  reviewState: ImportReviewState;
  selected: boolean;
  onSelect: () => void;
  onStateChange: (state: ImportReviewState) => void;
}) {
  return (
    <article
      className={`grid gap-4 px-4 py-4 transition hover:bg-[#fbfcfb] xl:grid-cols-[1fr_190px] ${
        selected ? "bg-[#fbfcfb]" : ""
      }`}
    >
      <button className="min-w-0 text-right" onClick={onSelect} type="button">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#69716d]">
          <PlatformBadge platform={item.platform} />
          <span>{reportLabel(item.reportIssue)}</span>
          <span>صفحة {item.page}</span>
          <span>·</span>
          <span>{item.authorName}</span>
        </div>
        <h3 className="mt-2 text-lg font-semibold leading-7 text-[#171819]">{item.title}</h3>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#5f6662]">{item.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <MetaPill label="التاريخ" value={item.publishedDateText} />
          <MetaPill label="الالتقاط" value={item.capturedAtText} />
          <MetaPill label="الثقة" value={confidenceLabels[item.confidence]} />
        </div>
      </button>

      <div className="grid content-start gap-2 text-sm">
        <span className={`rounded-lg border px-3 py-2 text-center font-semibold ${reviewStateStyles[reviewState]}`}>
          {reviewStateLabels[reviewState]}
        </span>
        <Fact label="المنصة" value={platformLabel(item.platform)} />
        <Fact label="المشاعر" value={sentimentLabels[item.sentiment] ?? item.sentiment} />
        <div className="grid grid-cols-3 gap-1">
          {(["ready", "needs_cleaning", "approved"] as ImportReviewState[]).map((state) => (
            <button
              aria-label={reviewStateLabels[state]}
              className={`grid h-9 place-items-center rounded-lg border ${
                reviewState === state
                  ? reviewStateStyles[state]
                  : "border-[#dfe3de] bg-white text-[#69716d]"
              }`}
              key={state}
              onClick={() => onStateChange(state)}
              title={reviewStateLabels[state]}
              type="button"
            >
              {state === "ready" ? <CircleDot size={15} /> : null}
              {state === "needs_cleaning" ? <Wrench size={15} /> : null}
              {state === "approved" ? <BadgeCheck size={15} /> : null}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function DetailsPanel({
  item,
  reviewState,
  onStateChange,
}: {
  item: ImportedReportItem;
  reviewState: ImportReviewState;
  onStateChange: (state: ImportReviewState) => void;
}) {
  return (
    <section className="sticky top-5 rounded-lg border border-[#dfe3de] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-[#69716d]">
            <FileText size={16} />
            لوحة التفاصيل
          </div>
          <h2 className="mt-2 font-semibold leading-7">{item.title}</h2>
        </div>
        <PlatformBadge platform={item.platform} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <Fact label="التقرير" value={reportLabel(item.reportIssue)} />
        <Fact label="الصفحة" value={String(item.page)} />
        <Fact label="المصدر" value={item.sourceName} />
        <Fact label="الكاتب" value={item.authorName} />
        <Fact label="تاريخ النشر" value={item.publishedDateText} />
        <Fact label="تاريخ الالتقاط" value={item.capturedAtText} />
        <Fact label="الثقة" value={confidenceLabels[item.confidence]} />
        <Fact label="الصور" value={String(item.imageCount)} />
      </div>

      {item.evidenceImagePath ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-[#dfe3de] bg-[#f7f8f6]">
          <Image
            alt={`صورة صفحة ${item.page} من التقرير القديم`}
            className="h-auto w-full"
            height={1200}
            priority
            src={item.evidenceImagePath}
            unoptimized
            width={900}
          />
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-[#dfe3de] bg-[#fbfbfa] p-3 text-sm leading-6">
        {item.originalUrl ? (
          <a className="font-semibold text-[#1f675d]" href={item.originalUrl} rel="noreferrer" target="_blank">
            فتح الرابط الأصلي المستخرج
          </a>
        ) : (
          <div className="grid gap-2">
            <span className="text-[#69716d]">
              لا يوجد رابط أصلي داخل التقرير القديم لهذه المادة؛ صورة الصفحة هي الدليل المتاح حاليًا.
            </span>
            <Link
              className="inline-flex h-9 items-center justify-center rounded-lg bg-[#18201e] px-3 text-sm font-semibold text-white"
              href={`/imports/backfill?item=${encodeURIComponent(item.id)}`}
            >
              فتح مهمة استكمال الرابط
            </Link>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-[#dfe3de] bg-[#fbfbfa] p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className={item.warnings.length ? "text-[#b45a21]" : "text-[#277466]"} size={16} />
          التحذيرات
        </div>
        <p className="mt-2 text-sm leading-6 text-[#5f6662]">
          {item.warnings.length ? item.warnings.join("، ") : "لا توجد تحذيرات في الاستخراج."}
        </p>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">النص الخام المستخرج</h3>
          <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${reviewStateStyles[reviewState]}`}>
            {reviewStateLabels[reviewState]}
          </span>
        </div>
        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg border border-[#dfe3de] bg-[#f7f8f6] p-3 text-right text-xs leading-6 text-[#333837]">
          {item.rawText}
        </pre>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <ReviewButton
          active={reviewState === "ready"}
          icon={<CircleDot size={16} />}
          label="جاهزة"
          onClick={() => onStateChange("ready")}
          state="ready"
        />
        <ReviewButton
          active={reviewState === "needs_cleaning"}
          icon={<Wrench size={16} />}
          label="تنظيف"
          onClick={() => onStateChange("needs_cleaning")}
          state="needs_cleaning"
        />
        <ReviewButton
          active={reviewState === "approved"}
          icon={<CheckCircle2 size={16} />}
          label="اعتماد"
          onClick={() => onStateChange("approved")}
          state="approved"
        />
      </div>
    </section>
  );
}

function ReviewButton({
  label,
  icon,
  state,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  state: ImportReviewState;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-2 text-sm font-semibold ${
        active ? reviewStateStyles[state] : "border-[#dfe3de] bg-white text-[#333837]"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md bg-[#f0f2ef] px-2 py-1 text-xs">
      <span className="text-[#69716d]">{label}: </span>
      {value}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f7f8f6] px-3 py-2">
      <div className="text-xs text-[#69716d]">{label}</div>
      <div className="mt-1 truncate font-semibold" title={value}>
        {value}
      </div>
    </div>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const classes: Record<string, string> = {
    X: "bg-[#191919] text-white",
    Official: "bg-[#eef0ff] text-[#554bc2]",
    YouTube: "bg-[#feecec] text-[#b42323]",
    TikTok: "bg-[#f0f2ef] text-[#171819]",
    Unknown: "bg-[#fff1df] text-[#9a5522]",
  };

  return (
    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${classes[platform] ?? "bg-[#f0f2ef]"}`}>
      {platformLabel(platform)}
    </span>
  );
}

function platformLabel(platform: string) {
  const labels: Record<string, string> = {
    X: "منصة X",
    Official: "رسمي",
    YouTube: "YouTube",
    TikTok: "TikTok",
    Unknown: "غير معروف",
  };

  return labels[platform] ?? platform;
}

function reportLabel(issue: number | null) {
  return issue ? `الإصدار ${issue}` : "تقرير غير مرقم";
}
