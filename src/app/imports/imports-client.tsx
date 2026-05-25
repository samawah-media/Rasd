"use client";

import { type SyntheticEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  CircleDot,
  Database,
  Filter,
  Layers3,
  RefreshCw,
  Search,
  Sparkles,
  Wrench,
  X,
  Copy,
  Check,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type {
  ImportedReportsDataset,
  ImportReviewState,
} from "@/lib/imported-reports";

import type { MonitoringItem } from "@/lib/types";

type Filters = {
  report: string;
  platform: string;
  confidence: string;
  page: string;
  query: string;
  triageState: string;
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

const sentimentStyles: Record<string, string> = {
  positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  neutral: "bg-slate-50 text-slate-600 border-slate-200",
  negative: "bg-rose-50 text-rose-700 border-rose-200",
};

export function ImportsClient({ dataset }: { dataset: ImportedReportsDataset }) {
  // --- States ---
  const [filters, setFilters] = useState<Filters>({
    report: "all",
    platform: "all",
    confidence: "all",
    page: "all",
    query: "",
    triageState: "all",
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [stateById, setStateById] = useState<Record<string, ImportReviewState>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Backend Sync Statuses
  const [legacyStatus, setLegacyStatus] = useState<LegacyImportStatus | null>(null);
  const [supabasePlan, setSupabasePlan] = useState<SupabaseImportPlan | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus | null>(null);
  const [dbItems, setDbItems] = useState<MonitoringItem[]>([]);

  // Action Pending/Error States
  const [isImporting, setIsImporting] = useState(false);
  const [isCheckingSupabasePlan, setIsCheckingSupabasePlan] = useState(false);
  const [isLoadingDb, setIsLoadingDb] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  // --- Mount Loading ---
  useEffect(() => {
    fetchLegacyStatus();
    fetchPersistenceStatus();
    fetchDbItems();
    refreshSupabasePlan();
  }, []);

  const fetchLegacyStatus = () => {
    fetch("/api/imports/legacy/status")
      .then((res) => res.json())
      .then((json) => setLegacyStatus(json.legacy_import))
      .catch(() => setImportError("تعذر قراءة حالة الاستيراد الحالية."));
  };

  const fetchPersistenceStatus = () => {
    fetch("/api/admin/persistence")
      .then((res) => res.json())
      .then((json) => setPersistenceStatus(json.persistence))
      .catch(() => setImportError("تعذر قراءة حالة اتصال Supabase الحالية."));
  };

  const fetchDbItems = async () => {
    try {
      const res = await fetch("/api/items");
      const json = await res.json();
      if (json.items) {
        setDbItems(json.items);
      }
    } catch (e) {
      console.error("Failed to fetch live DB items", e);
    } finally {
      setIsLoadingDb(false);
    }
  };

  // --- Helper Sets & Maps ---
  const importedSet = useMemo(() => {
    return new Set(
      dbItems.filter((item) => item.sourceItemId).map((item) => item.sourceItemId)
    );
  }, [dbItems]);

  // --- Filters Handling ---
  const filteredItems = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return dataset.items.filter((item) => {
      const reviewState = stateById[item.id] ?? item.initialState;

      const matchesReport = filters.report === "all" || item.sourcePdf === filters.report;
      const matchesPlatform = filters.platform === "all" || item.platform === filters.platform;
      const matchesConfidence =
        filters.confidence === "all" || item.confidence === filters.confidence;
      const matchesPage = filters.page === "all" || String(item.page) === filters.page;
      const matchesTriage = filters.triageState === "all" || reviewState === filters.triageState;
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

      return (
        matchesReport &&
        matchesPlatform &&
        matchesConfidence &&
        matchesPage &&
        matchesTriage &&
        matchesQuery
      );
    });
  }, [dataset.items, filters, stateById]);

  // Selected item object reference
  const selectedItem = useMemo(() => {
    if (!selectedId) return null;
    return dataset.items.find((item) => item.id === selectedId) ?? null;
  }, [dataset.items, selectedId]);

  // Stats computed from current state
  const stateCounts = useMemo(() => {
    return dataset.items.reduce(
      (acc, item) => {
        const state = stateById[item.id] ?? item.initialState;
        acc[state] += 1;
        return acc;
      },
      { approved: 0, needs_cleaning: 0, ready: 0 } satisfies Record<ImportReviewState, number>
    );
  }, [dataset.items, stateById]);

  const stats = useMemo(() => {
    const total = dataset.items.length;
    const approved = dataset.items.filter((item) => (stateById[item.id] ?? item.initialState) === "approved").length;
    const ready = dataset.items.filter((item) => (stateById[item.id] ?? item.initialState) === "ready").length;
    const needsCleaning = dataset.items.filter((item) => (stateById[item.id] ?? item.initialState) === "needs_cleaning").length;

    return {
      total,
      approved,
      ready,
      needsCleaning,
      lowConfidence: dataset.lowConfidenceItems,
      importedCount: dataset.items.filter((item) => importedSet.has(item.id)).length,
    };
  }, [dataset.items, stateById, importedSet, dataset.lowConfidenceItems]);

  // --- Row Checkbox Actions ---
  const isAllSelected = useMemo(() => {
    return filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id));
  }, [filteredItems, selectedIds]);

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredItems.forEach((item) => next.delete(item.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredItems.forEach((item) => next.add(item.id));
        return next;
      });
    }
  };

  const toggleSelectRow = (id: string, e: SyntheticEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // --- Bulk Action Handlers ---
  const handleBulkReviewStateChange = (state: ImportReviewState) => {
    setStateById((prev) => {
      const next = { ...prev };
      selectedIds.forEach((id) => {
        next[id] = state;
      });
      return next;
    });
    setSelectedIds(new Set());
  };

  const handleBulkApproveAllReady = () => {
    setStateById((prev) => {
      const next = { ...prev };
      dataset.items.forEach((item) => {
        const currentState = prev[item.id] ?? item.initialState;
        if (currentState === "ready") {
          next[item.id] = "approved";
        }
      });
      return next;
    });
  };

  // --- Import / Sync Handlers ---
  async function importApprovedLegacyData() {
    setIsImporting(true);
    setImportError(null);

    try {
      const response = await fetch("/api/imports/legacy", { method: "POST" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "legacy_import_failed");
      setLegacyStatus(json.legacy_import);
      await fetchDbItems(); // reload live database state
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

  // --- Text Copy Helper ---
  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // --- Triage Badge Class Generator ---
  const getReviewBadgeStyle = (state: ImportReviewState) => {
    if (state === "approved") return "bg-indigo-50 border-indigo-200 text-indigo-700";
    if (state === "needs_cleaning") return "bg-amber-50 border-amber-200 text-amber-700";
    return "bg-emerald-50 border-emerald-200 text-emerald-700";
  };

  return (
    <div className="mx-auto min-h-screen max-w-[1720px] px-4 py-6 md:px-8 bg-slate-50/50 text-[#1e293b]" style={{ direction: "rtl" }}>
      
      {/* HEADER SECTION */}
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-emerald-50 w-max px-3 py-1 rounded-full border border-emerald-100">
            <Sparkles size={14} className="animate-pulse" />
            <span>عمليات استيراد البيانات القديمة</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            لوحة triage واستيراد الأرشيف القديم
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            راجع البيانات المستخرجة من التقارير القديمة، وعالج الروابط الناقصة، وقم بمزامنة الأرشيف الحصري بنجاح.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleBulkApproveAllReady}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium transition shadow-sm text-slate-700"
            type="button"
          >
            <BadgeCheck size={16} className="text-indigo-600" />
            <span>اعتماد كافة المواد الجاهزة</span>
          </button>
          
          <button
            onClick={importApprovedLegacyData}
            disabled={isImporting}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition shadow-md shadow-slate-950/10"
            type="button"
          >
            {isImporting ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Database size={16} />
            )}
            <span>
              {isImporting
                ? "جاري الاستيراد..."
                : legacyStatus?.imported
                ? "تحديث ومزامنة الأرشيف"
                : "بدء استيراد الأرشيف المعتمد"}
            </span>
          </button>
        </div>
      </header>

      {/* SYSTEM STATS OVERVIEW CARDS */}
      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">إجمالي الأرشيف</span>
          <div className="mt-1 text-2xl font-bold text-slate-900">{stats.total.toLocaleString("ar-EG")}</div>
          <div className="mt-1 text-[11px] text-slate-400">مواد مستخرجة فريدة</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-semibold text-emerald-600">جاهزة للمراجعة</span>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{stats.ready.toLocaleString("ar-EG")}</div>
          <div className="mt-1 text-[11px] text-slate-400">في انتظار القرار</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-semibold text-amber-600">تحتاج تنظيف</span>
          <div className="mt-1 text-2xl font-bold text-amber-700">{stats.needsCleaning.toLocaleString("ar-EG")}</div>
          <div className="mt-1 text-[11px] text-slate-400">أخطاء OCR أو روابط معطلة</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-semibold text-indigo-600">معتمدة للاستيراد</span>
          <div className="mt-1 text-2xl font-bold text-indigo-700">{stats.approved.toLocaleString("ar-EG")}</div>
          <div className="mt-1 text-[11px] text-slate-400">أكّدها المحرر</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-semibold text-rose-600">منخفضة الثقة</span>
          <div className="mt-1 text-2xl font-bold text-rose-700">{stats.lowConfidence.toLocaleString("ar-EG")}</div>
          <div className="mt-1 text-[11px] text-rose-500 font-medium">تحذيرات جودة OCR</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 shadow-sm">
          <span className="text-xs font-semibold text-slate-700">مستورد بالكامل حياً</span>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {isLoadingDb ? (
              <span className="text-slate-400 text-sm animate-pulse">جاري التحقق...</span>
            ) : (
              stats.importedCount.toLocaleString("ar-EG")
            )}
          </div>
          <div className="mt-1 text-[11px] text-emerald-700 font-medium">داخل قاعدة البيانات</div>
        </div>
      </section>

      {/* CORE CONTENT LAYOUT */}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        
        {/* SIDEBAR: PERSISTENCE & QUICK SYNC CHECKS */}
        <aside className="flex flex-col gap-6">
          
          {/* PERSISTENCE CONFIG STATUS */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
              <Database size={18} className="text-slate-700" />
              <h2 className="font-bold text-slate-800 text-sm">بيئة التخزين الحية</h2>
            </div>

            {persistenceStatus ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">وضع العمل الحالي:</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded ${
                    persistenceStatus.mode === "supabase" 
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                      : "bg-amber-50 text-amber-700 border border-amber-100"
                  }`}>
                    {persistenceStatus.mode === "supabase" ? "Supabase (سحابي)" : "Memory (ذاكرة مؤقتة)"}
                  </span>
                </div>
                
                <div className="space-y-2 border-t border-slate-100 pt-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">معرف المشروع:</span>
                    <span className="font-semibold text-slate-700 truncate max-w-[130px]" title={persistenceStatus.projectRef ?? ""}>
                      {persistenceStatus.projectRef ?? "المحلي"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">اتصال المفتاح العام:</span>
                    <span className={`font-semibold ${persistenceStatus.publicConfigured ? "text-emerald-600" : "text-rose-500"}`}>
                      {persistenceStatus.publicConfigured ? "نشط" : "غير متصل"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">مفاتيح السيرفر:</span>
                    <span className={`font-semibold ${persistenceStatus.serverConfigured ? "text-emerald-600" : "text-rose-500"}`}>
                      {persistenceStatus.serverConfigured ? "متوفرة" : "غير متوفرة"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-20 flex items-center justify-center text-xs text-slate-400 animate-pulse">
                جاري فحص الاتصال...
              </div>
            )}

            {/* Error notifications */}
            {importError && (
              <div className="mt-4 rounded-lg bg-rose-50 border border-rose-100 p-3 text-xs text-rose-700 flex gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{importError}</span>
              </div>
            )}
          </section>

          {/* SUPABASE DEPLOYMENT PLAN */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Layers3 size={18} className="text-slate-700" />
                <h2 className="font-bold text-slate-800 text-sm">مستند خطة المزامنة</h2>
              </div>
              <button 
                onClick={refreshSupabasePlan} 
                disabled={isCheckingSupabasePlan}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
                title="تحديث الخطة"
              >
                <RefreshCw size={14} className={isCheckingSupabasePlan ? "animate-spin" : ""} />
              </button>
            </div>

            {supabasePlan ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 p-2 rounded">
                    <span className="text-[10px] text-slate-400 block">تقارير مدعومة</span>
                    <span className="font-bold text-slate-800 text-sm">{supabasePlan.summary.reports}</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded">
                    <span className="text-[10px] text-slate-400 block">مواد الأرشيف</span>
                    <span className="font-bold text-slate-800 text-sm">{supabasePlan.summary.monitoringItems}</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded">
                    <span className="text-[10px] text-slate-400 block">لقطات الدليل</span>
                    <span className="font-bold text-slate-800 text-sm">{supabasePlan.summary.captures}</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded">
                    <span className="text-[10px] text-slate-400 block">روابط صالحة</span>
                    <span className="font-bold text-slate-800 text-sm">{supabasePlan.summary.openableOriginalUrls}</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-2 space-y-1 text-slate-500 leading-relaxed">
                  <div className="flex justify-between">
                    <span>روابط معطوبة:</span>
                    <span className="font-medium text-amber-700">{supabasePlan.summary.invalidOriginalUrls}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>روابط مفقودة:</span>
                    <span className="font-medium text-slate-600">{supabasePlan.summary.missingOriginalUrls}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-xs text-slate-400">
                لم يتم تحليل خطة المزامنة بعد.
              </div>
            )}
          </section>

          {/* TRIAGE LEADER BOARD STATS */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-800 text-sm mb-3">حالات المواد الحالية</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs p-2 rounded bg-slate-50 border border-slate-100">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  جاهزة للمراجعة
                </span>
                <span className="font-bold text-slate-700">{stateCounts.ready}</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 rounded bg-slate-50 border border-slate-100">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  تحتاج تنظيف
                </span>
                <span className="font-bold text-slate-700">{stateCounts.needs_cleaning}</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 rounded bg-slate-50 border border-slate-100">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                  معتمدة للاستيراد
                </span>
                <span className="font-bold text-slate-700">{stateCounts.approved}</span>
              </div>
            </div>
          </section>
        </aside>

        {/* MAIN PANEL: FILTERS & DATA TABLE */}
        <main className="min-w-0 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col">
          
          {/* SEARCH & HORIZONTAL FILTERS BAR */}
          <section className="p-4 border-b border-slate-200/80 bg-slate-50/30 flex flex-col gap-4">
            
            {/* Search row */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                className="w-full h-11 bg-white border border-slate-200 rounded-lg pr-10 pl-4 text-sm focus:border-slate-400 outline-none transition placeholder-slate-400 text-slate-800"
                placeholder="ابحث عن كلمة رئيسية، كاتب، عنوان أو محتوى OCR..."
                type="text"
                value={filters.query}
                onChange={(e) => setFilters(f => ({ ...f, query: e.target.value }))}
              />
            </div>

            {/* Dropdowns row */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
              
              <div className="flex flex-col gap-1.5 min-w-[120px]">
                <label className="text-[11px] font-bold text-slate-400">التقرير</label>
                <div className="relative">
                  <select
                    value={filters.report}
                    onChange={(e) => setFilters(f => ({ ...f, report: e.target.value }))}
                    className="w-full h-9 bg-white border border-slate-200 rounded-md px-2.5 pl-7 text-xs focus:border-slate-400 outline-none appearance-none text-slate-700"
                  >
                    <option value="all">كل التقارير</option>
                    {dataset.reports
                      .filter((report) => !report.duplicateOf && report.extractedItemCount > 0)
                      .map((report) => (
                        <option key={report.sourcePdf} value={report.sourcePdf}>
                          الإصدار {report.issue ?? "-"} ({report.extractedItemCount} مادة)
                        </option>
                      ))}
                  </select>
                  <ChevronDown size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-[100px]">
                <label className="text-[11px] font-bold text-slate-400">المنصة</label>
                <div className="relative">
                  <select
                    value={filters.platform}
                    onChange={(e) => setFilters(f => ({ ...f, platform: e.target.value }))}
                    className="w-full h-9 bg-white border border-slate-200 rounded-md px-2.5 pl-7 text-xs focus:border-slate-400 outline-none appearance-none text-slate-700"
                  >
                    <option value="all">كل المنصات</option>
                    {dataset.platforms.map((platform) => (
                      <option key={platform} value={platform}>{platformLabel(platform)}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-[100px]">
                <label className="text-[11px] font-bold text-slate-400">حالة التصفية</label>
                <div className="relative">
                  <select
                    value={filters.triageState}
                    onChange={(e) => setFilters(f => ({ ...f, triageState: e.target.value }))}
                    className="w-full h-9 bg-white border border-slate-200 rounded-md px-2.5 pl-7 text-xs focus:border-slate-400 outline-none appearance-none text-slate-700"
                  >
                    <option value="all">كل الحالات</option>
                    <option value="ready">جاهزة للمراجعة</option>
                    <option value="needs_cleaning">تحتاج تنظيف</option>
                    <option value="approved">معتمدة</option>
                  </select>
                  <ChevronDown size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-[90px]">
                <label className="text-[11px] font-bold text-slate-400">دقة OCR</label>
                <div className="relative">
                  <select
                    value={filters.confidence}
                    onChange={(e) => setFilters(f => ({ ...f, confidence: e.target.value }))}
                    className="w-full h-9 bg-white border border-slate-200 rounded-md px-2.5 pl-7 text-xs focus:border-slate-400 outline-none appearance-none text-slate-700"
                  >
                    <option value="all">كل المستويات</option>
                    <option value="high">عالية</option>
                    <option value="medium">متوسطة</option>
                    <option value="low">منخفضة الثقة</option>
                  </select>
                  <ChevronDown size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-[80px]">
                <label className="text-[11px] font-bold text-slate-400">الصفحة</label>
                <div className="relative">
                  <select
                    value={filters.page}
                    onChange={(e) => setFilters(f => ({ ...f, page: e.target.value }))}
                    className="w-full h-9 bg-white border border-slate-200 rounded-md px-2.5 pl-7 text-xs focus:border-slate-400 outline-none appearance-none text-slate-700"
                  >
                    <option value="all">الكل</option>
                    {dataset.pages.map((p) => (
                      <option key={p} value={String(p)}>صفحة {p}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setFilters({
                  report: "all",
                  platform: "all",
                  confidence: "all",
                  page: "all",
                  query: "",
                  triageState: "all",
                })}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-200 hover:bg-slate-50 text-xs text-slate-600 mt-auto font-medium transition"
              >
                <Filter size={13} />
                تصفير الفلاتر
              </button>
            </div>
          </section>

          {/* HIGH EFFICIENCY DATA TABLE */}
          <div className="overflow-x-auto min-h-[480px]">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="py-3 px-4 min-w-[280px]">العنوان وتفاصيل السياق</th>
                  <th className="py-3 px-4 w-24">المنصة</th>
                  <th className="py-3 px-4 w-20">الصفحة</th>
                  <th className="py-3 px-4 w-28">دقة OCR</th>
                  <th className="py-3 px-4 w-36">حالة المراجعة</th>
                  <th className="py-3 px-4 w-36 text-center">الربط بالخادم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredItems.length > 0 ? (
                  filteredItems.map((item) => {
                    const reviewState = stateById[item.id] ?? item.initialState;
                    const isSelected = selectedIds.has(item.id);
                    const isImported = importedSet.has(item.id);
                    const isLowConfidence = item.confidence === "low";

                    return (
                      <tr
                        key={item.id}
                        onClick={() => {
                          setSelectedId(item.id);
                          setIsDrawerOpen(true);
                        }}
                        className={`hover:bg-slate-50/70 transition cursor-pointer select-none ${
                          selectedId === item.id ? "bg-slate-50/90 font-medium" : ""
                        } ${isSelected ? "bg-indigo-50/20" : ""}`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => toggleSelectRow(item.id, e)}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>

                        {/* Title & Context */}
                        <td className="py-3.5 px-4 max-w-sm">
                          <div className="flex items-start gap-2">
                            {isLowConfidence && (
                              <span title="تحذير: ثقة OCR منخفضة">
                                <AlertTriangle 
                                  size={16} 
                                  className="text-amber-500 shrink-0 mt-0.5" 
                                />
                              </span>
                            )}
                            <div className="min-w-0">
                              <h4 className="font-semibold text-slate-800 truncate" title={item.title}>
                                {item.title}
                              </h4>
                              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-400">
                                <span>الكاتب: <strong className="text-slate-500 font-normal">{item.authorName}</strong></span>
                                <span>•</span>
                                <span>التقرير: <strong className="text-slate-500 font-normal">{reportLabel(item.reportIssue)}</strong></span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Platform */}
                        <td className="py-3.5 px-4">
                          <PlatformBadge platform={item.platform} />
                        </td>

                        {/* Page */}
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                          ص {item.page}
                        </td>

                        {/* Confidence */}
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                            item.confidence === "high" 
                              ? "bg-emerald-50 text-emerald-700" 
                              : item.confidence === "medium" 
                              ? "bg-blue-50 text-blue-700" 
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}>
                            {confidenceLabels[item.confidence]}
                          </span>
                        </td>

                        {/* Triage Review state */}
                        <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                          <div className="relative group">
                            <select
                              value={reviewState}
                              onChange={(e) => setStateById(prev => ({ ...prev, [item.id]: e.target.value as ImportReviewState }))}
                              className={`h-8 w-full rounded border px-2.5 py-0.5 text-xs font-semibold focus:outline-none appearance-none cursor-pointer ${getReviewBadgeStyle(reviewState)}`}
                            >
                              <option value="ready">جاهزة للمراجعة</option>
                              <option value="needs_cleaning">تحتاج تنظيف</option>
                              <option value="approved">معتمدة</option>
                            </select>
                            <ChevronDown size={12} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                          </div>
                        </td>

                        {/* Live DB Import Status */}
                        <td className="py-3.5 px-4 text-center">
                          {isImported ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                              <BadgeCheck size={14} />
                              <span>مستوردة</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-500 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                              <CircleDot size={12} />
                              <span>غير مستوردة</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-20 text-center">
                      <div className="max-w-md mx-auto">
                        <Search className="mx-auto text-slate-300 mb-3" size={36} />
                        <h4 className="font-bold text-slate-800">لا توجد مواد مطابقة للفلاتر</h4>
                        <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                          حاول تقليل قيود التصفية أو البحث بعبارات بديلة للعثور على المحتوى المطلوب.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* TABLE FOOTER */}
          <footer className="border-t border-slate-200 px-6 py-4 flex items-center justify-between text-xs text-slate-400 bg-slate-50/20 rounded-b-xl">
            <div>
              يظهر حالياً <strong className="text-slate-600 font-bold">{filteredItems.length}</strong> مادة من أصل <strong className="text-slate-600 font-bold">{dataset.uniqueExtractedItems}</strong>
            </div>
            <div>
              الأرشيف القديم • RASD Platform Operations Dashboard
            </div>
          </footer>
        </main>
      </div>

      {/* FLOATING ACTION BAR FOR BULK ACTIONS */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/95 border border-slate-200 rounded-full py-3 px-6 shadow-xl shadow-slate-950/20 backdrop-blur-md flex items-center gap-5 transition-all duration-300 animate-slide-up">
          <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
            <span className="inline-flex items-center justify-center bg-indigo-600 text-white font-bold text-xs w-6 h-6 rounded-full">
              {selectedIds.size}
            </span>
            <span className="text-xs font-medium text-slate-500">تم اختيارها</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkReviewStateChange("approved")}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-sm"
              type="button"
            >
              <BadgeCheck size={14} />
              <span>اعتماد كلي</span>
            </button>
            <button
              onClick={() => handleBulkReviewStateChange("needs_cleaning")}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition bg-white"
              type="button"
            >
              <Wrench size={14} />
              <span>تعليم للتنظيف</span>
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-slate-400 hover:text-slate-600 px-3 transition"
              type="button"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      {/* SLIDE-OVER DETAILS DRAWER */}
      {isDrawerOpen && selectedItem && (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
          <div className="absolute inset-0 overflow-hidden">
            
            {/* Backdrop blur overlay */}
            <div 
              onClick={() => setIsDrawerOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
            ></div>

            {/* Slide-over panel container */}
            <div className="absolute inset-y-0 right-0 max-w-full flex pl-10" style={{ right: 0 }}>
              <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col h-full border-l border-slate-200 animate-slide-over">
                
                {/* Header */}
                <header className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={selectedItem.platform} />
                    <h2 className="font-bold text-slate-800 text-base" id="slide-over-title">
                      تفاصيل المادة المستخرجة
                    </h2>
                  </div>
                  <button
                    onClick={() => setIsDrawerOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/50 transition"
                    type="button"
                  >
                    <X size={20} />
                  </button>
                </header>

                {/* Body (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  
                  {/* Title & Stats */}
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 leading-snug">
                      {selectedItem.title}
                    </h3>
                    
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-400 block mb-0.5">التقرير التاريخي</span>
                        <strong className="text-slate-800 font-semibold">{reportLabel(selectedItem.reportIssue)}</strong>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-400 block mb-0.5">الصفحة بالأرشيف</span>
                        <strong className="text-slate-800 font-semibold">صفحة {selectedItem.page}</strong>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-400 block mb-0.5">الكاتب الأصلي</span>
                        <strong className="text-slate-800 font-semibold truncate block" title={selectedItem.authorName}>{selectedItem.authorName}</strong>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-400 block mb-0.5">تاريخ النشر</span>
                        <strong className="text-slate-800 font-semibold">{selectedItem.publishedDateText}</strong>
                      </div>
                    </div>
                  </div>

                  {/* LOW CONFIDENCE ALERT BOX */}
                  {selectedItem.confidence === "low" && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 flex gap-3 text-sm text-amber-800">
                      <AlertTriangle size={20} className="shrink-0 text-amber-600 mt-0.5" />
                      <div className="space-y-1">
                        <strong className="font-bold text-amber-900 block">تحذير جودة استخراج منخفضة!</strong>
                        <p className="leading-relaxed text-xs text-amber-700">
                          نظام OCR واجه صعوبة في تحليل نصوص هذه المادة. يرجى مطابقتها بعناية مع صورة التقرير وتصحيح النص أو الروابط المفقودة قبل الاعتماد النهائي.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* EVIDENCE IMAGE (CROP OR FALLBACK) */}
                  {selectedItem.evidenceImagePath ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400">لقطة الدليل التاريخي</span>
                        <span className="text-[11px] text-slate-400 font-mono">صفحة {selectedItem.page}</span>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm relative group">
                        <Image
                          alt={`صورة صفحة ${selectedItem.page} من التقرير القديم`}
                          className="h-auto w-full max-h-[360px] object-contain mx-auto"
                          height={1200}
                          priority
                          src={selectedItem.evidenceImagePath}
                          unoptimized
                          width={900}
                        />
                      </div>
                    </div>
                  ) : null}

                  {/* LINKS & OVERRIDES BACKFILL */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/30 p-4 space-y-3">
                    <span className="text-xs font-bold text-slate-400 block">وصلات الربط الخارجية</span>
                    
                    {selectedItem.originalUrl ? (
                      <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-100 text-xs">
                        <div className="min-w-0">
                          <span className="text-[10px] text-slate-400 block mb-0.5">الرابط المستخرج الأصلي:</span>
                          <a 
                            href={selectedItem.originalUrl} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="font-semibold text-indigo-600 hover:text-indigo-500 truncate block hover:underline"
                          >
                            {selectedItem.originalUrl}
                          </a>
                        </div>
                        <a 
                          href={selectedItem.originalUrl} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="shrink-0 p-1.5 rounded-md hover:bg-slate-50 border border-slate-100 transition text-slate-500"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    ) : (
                      <div className="bg-amber-50/30 border border-amber-100 p-4 rounded-lg flex flex-col gap-3">
                        <p className="text-xs text-amber-700 leading-relaxed">
                          لا يوجد رابط أصلي نشط داخل التقرير القديم لهذه المادة. يتم استخدام صورة صفحة التقرير كدليل متاح. يمكنك إدخال الرابط يدوياً الآن.
                        </p>
                        <Link
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white px-4 transition self-start"
                          href={`/imports/backfill?item=${encodeURIComponent(selectedItem.id)}`}
                        >
                          <span>فتح تذكرة استكمال الرابط</span>
                          <ArrowRight size={13} className="rotate-180" />
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* SUMMARY & OCR TEXT */}
                  <div className="space-y-4">
                    
                    {/* Sentiment and Warnings */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                        <span className="text-slate-400 block mb-1">تصنيف المحتوى</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${sentimentStyles[selectedItem.sentiment] ?? sentimentStyles.neutral}`}>
                          {sentimentLabels[selectedItem.sentiment] ?? selectedItem.sentiment}
                        </span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                        <span className="text-slate-400 block mb-1">عدد الصور المستخرجة</span>
                        <strong className="text-slate-700">{selectedItem.imageCount} صور</strong>
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-slate-400 block">ملخص التقرير المعتمد</span>
                      <p className="text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100 leading-relaxed">
                        {selectedItem.summary}
                      </p>
                    </div>

                    {/* OCR Text with Copy */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400">النص الخام المستخرج (OCR)</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(selectedItem.rawText)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-500 bg-indigo-50 px-2 py-1 rounded"
                        >
                          {copiedText ? <Check size={11} /> : <Copy size={11} />}
                          <span>{copiedText ? "تم النسخ" : "نسخ النص"}</span>
                        </button>
                      </div>
                      <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-900 text-slate-200 p-4 text-right text-xs leading-relaxed font-mono">
                        {selectedItem.rawText}
                      </pre>
                    </div>

                    {/* Triage Warnings list */}
                    {selectedItem.warnings.length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
                        <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                          <AlertTriangle size={14} className="text-slate-500" />
                          تحذيرات جودة النظام:
                        </span>
                        <ul className="list-disc list-inside text-xs text-slate-500 space-y-1 pr-2 leading-relaxed">
                          {selectedItem.warnings.map((w, idx) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer (Quick Actions) */}
                <footer className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex gap-2">
                  <button
                    onClick={() => {
                      setStateById(prev => ({ ...prev, [selectedItem.id]: "approved" }));
                      setIsDrawerOpen(false);
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition"
                    type="button"
                  >
                    <BadgeCheck size={16} />
                    <span>اعتماد المادة</span>
                  </button>
                  <button
                    onClick={() => {
                      setStateById(prev => ({ ...prev, [selectedItem.id]: "needs_cleaning" }));
                      setIsDrawerOpen(false);
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold bg-white transition"
                    type="button"
                  >
                    <Wrench size={16} />
                    <span>تعليم للتنظيف</span>
                  </button>
                  <button
                    onClick={() => setIsDrawerOpen(false)}
                    className="h-11 px-4 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 text-sm font-semibold bg-white transition"
                    type="button"
                  >
                    إغلاق
                  </button>
                </footer>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const classes: Record<string, string> = {
    X: "bg-slate-900 text-white border-slate-950",
    Official: "bg-indigo-50 text-indigo-700 border-indigo-100",
    YouTube: "bg-rose-50 text-rose-700 border-rose-100",
    TikTok: "bg-slate-100 text-slate-800 border-slate-200",
    Unknown: "bg-amber-50 text-amber-700 border-amber-200",
  };

  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded border ${classes[platform] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
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
