"use client";

import React, { useState, useMemo } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowUpDown,
  BarChart3,
  Camera,
  CheckCircle2,
  Clock3,
  Eye,
  FilePlus2,
  Inbox,
  Link2,
  Search,
  SlidersHorizontal,
  Sparkles,
  XCircle,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { MonitoringItem, Sentiment, ItemState } from "@/lib/types";

interface FeedClientProps {
  initialItems: MonitoringItem[];
}

export default function FeedClient({ initialItems }: FeedClientProps) {
  // Local state for items to support real-time UI updates after API actions
  const [items, setItems] = useState<MonitoringItem[]>(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialItems.length > 0 ? initialItems[0].id : null
  );
  
  // Filtering & Sorting State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedSentiments, setSelectedSentiments] = useState<Sentiment[]>([]);
  const [sortBy, setSortBy] = useState<"newest" | "relevance" | "reach">("newest");
  
  // API interaction states
  const [actionLoading, setActionLoading] = useState<string | null>(null); // "approve", "reject", "capture", "archive"
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);

  // Find currently selected item
  const selectedItem = useMemo(() => {
    return items.find((item) => item.id === selectedId) || null;
  }, [items, selectedId]);

  const recentActivityItems = useMemo(() => {
    return [...items]
      .sort((a, b) => new Date(b.publishedAt || "").getTime() - new Date(a.publishedAt || "").getTime())
      .slice(0, 3);
  }, [items]);

  // Handle checking platforms
  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  // Handle checking sentiments
  const toggleSentiment = (sentiment: Sentiment) => {
    setSelectedSentiments((prev) =>
      prev.includes(sentiment)
        ? prev.filter((s) => s !== sentiment)
        : [...prev, sentiment]
    );
  };

  // Quick reset filters
  const resetFilters = () => {
    setSearchTerm("");
    setSelectedPlatforms([]);
    setSelectedSentiments([]);
  };

  // Map backend sourceType to user friendly platform name
  const getPlatformLabel = (item: MonitoringItem): string => {
    const url = item.originalUrl || "";
    if (item.sourceType.startsWith("x_") || url.includes("x.com") || url.includes("twitter.com")) {
      return "X";
    }
    if (url.includes("tiktok.com")) {
      return "TikTok";
    }
    if (url.includes("instagram.com") || url.includes("instagr.am")) {
      return "Instagram";
    }
    if (item.sourceType === "rss") {
      return "صحيفة رقمية";
    }
    if (item.sourceType === "manual_url") {
      return "رابط يدوي";
    }
    return "موقع ويب";
  };

  // Normalize platform string for filtering
  const getPlatformKey = (item: MonitoringItem): string => {
    const url = item.originalUrl || "";
    if (item.sourceType.startsWith("x_") || url.includes("x.com") || url.includes("twitter.com")) {
      return "X";
    }
    if (url.includes("tiktok.com")) {
      return "TikTok";
    }
    if (url.includes("instagram.com") || url.includes("instagr.am")) {
      return "Instagram";
    }
    if (item.sourceType === "rss") return "News";
    if (item.sourceType === "manual_url") return "Manual";
    return "Web";
  };

  // Filtered and sorted items
  const filteredAndSortedItems = useMemo(() => {
    let result = [...items];

    // 1. Text Search Filter
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      result = result.filter(
        (item) =>
          item.title?.toLowerCase().includes(query) ||
          item.summary?.toLowerCase().includes(query) ||
          item.authorName?.toLowerCase().includes(query) ||
          item.authorHandle?.toLowerCase().includes(query) ||
          item.originalUrl?.toLowerCase().includes(query)
      );
    }

    // 2. Platform Filter
    if (selectedPlatforms.length > 0) {
      result = result.filter((item) => {
        const key = getPlatformKey(item);
        return selectedPlatforms.includes(key);
      });
    }
    // 3. Sentiment Filter
    if (selectedSentiments.length > 0) {
      result = result.filter((item) => selectedSentiments.includes(item.sentiment));
    }

    // 4. Sorting
    result.sort((a, b) => {
      if (sortBy === "relevance") {
        return (b.relevanceScore || 0) - (a.relevanceScore || 0);
      }
      if (sortBy === "reach") {
        return (b.sentimentConfidence || 0) - (a.sentimentConfidence || 0);
      }
      // Default: newest first
      const timeA = new Date(a.publishedAt || "").getTime();
      const timeB = new Date(b.publishedAt || "").getTime();
      return timeB - timeA;
    });

    return result;
  }, [items, searchTerm, selectedPlatforms, selectedSentiments, sortBy]);

  // Quick summary stats computed dynamically
  const stats = useMemo(() => {
    const todayCount = items.filter(item => {
      const today = new Date().toDateString();
      const itemDate = new Date(item.publishedAt).toDateString();
      return today === itemDate;
    }).length;

    const needsReview = items.filter(item => item.state === "needs_review").length;
    const approved = items.filter(item => ["report_ready", "added_to_report", "approved_pending_capture"].includes(item.state)).length;
    const failedCapture = items.filter(item => item.state === "capture_failed").length;

    return {
      todayCount,
      needsReview,
      approved,
      failedCapture,
    };
  }, [items]);

  // API Client Call: Review Item (Approve / Reject)
  const handleReview = async (id: string, action: "approve" | "reject") => {
    setActionLoading(action);
    setActionSuccessMessage(null);

    setActionErrorMessage(null);
    try {
      const response = await fetch(`/api/items/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (response.ok) {
        const data = await response.json();
        // Update local items state
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, state: data.item.state } : item))
        );
        setActionSuccessMessage(
          action === "approve"
            ? "تم اعتماد المادة بنجاح! ونقلها لمرحلة الالتقاط"
            : "تم استبعاد المادة ورفضها بنجاح"
        );
        setTimeout(() => setActionSuccessMessage(null), 4000);
      } else {
        setActionErrorMessage("تعذر تحديث حالة المادة. حاول مرة أخرى.");

        console.error("Failed to review item");
      }
    } catch (error) {
      setActionErrorMessage("حدث خطأ أثناء إرسال إجراء المراجعة. حاول مرة أخرى.");

      console.error("Error during review API call:", error);
    } finally {
      setActionLoading(null);
    }
  };

  // API Client Call: Trigger Capture
  const handleCapture = async (id: string) => {
    setActionLoading("capture");
    setActionSuccessMessage(null);

    setActionErrorMessage(null);
    try {
      const response = await fetch(`/api/items/${id}/capture-report-grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        const data = await response.json();
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  state: data.item.state,
                  hasReportGradeCapture: data.item.hasReportGradeCapture,
                }
              : item
          )
        );
        setActionSuccessMessage("تم التقاط لقطة شاشة رسمية بجودة التقرير!");
        setTimeout(() => setActionSuccessMessage(null), 4000);
      } else {
        setActionErrorMessage("تعذر بدء التقاط الدليل. حاول مرة أخرى.");

        console.error("Failed to capture");
      }
    } catch (error) {
      setActionErrorMessage("حدث خطأ أثناء طلب التقاط الدليل. حاول مرة أخرى.");

      console.error("Error during capture API call:", error);
    } finally {
      setActionLoading(null);
    }
  };

  // API Client Call: Archive Item
  const handleArchive = async (id: string) => {
    setActionLoading("archive");
    setActionSuccessMessage(null);

    setActionErrorMessage(null);
    try {
      const response = await fetch(`/api/items/${id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "أرشفة يدوية من بث الرصد المباشر." }),
      });
      if (response.ok) {
        const data = await response.json();
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, state: data.item.state } : item))
        );
        setActionSuccessMessage("تمت أرشفة المادة وحفظها في الأرشيف الآمن");
        setTimeout(() => setActionSuccessMessage(null), 4000);
      } else {
        setActionErrorMessage("تعذر أرشفة المادة. حاول مرة أخرى.");

        console.error("Failed to archive");
      }
    } catch (error) {
      setActionErrorMessage("حدث خطأ أثناء طلب الأرشفة. حاول مرة أخرى.");

      console.error("Error during archive API call:", error);
    } finally {
      setActionLoading(null);
    }
  };

  // Map state to Saudi Arabic badge styling
  const getStateBadge = (state: ItemState) => {
    const configs: Record<ItemState, { bg: string; text: string; label: string }> = {
      ingested: { bg: "bg-[#eef2f6]", text: "text-[#475569]", label: "مستوردة حديثاً" },
      normalized: { bg: "bg-[#f1f5f9]", text: "text-[#334155]", label: "محللة" },
      deduped: { bg: "bg-[#e2e8f0]", text: "text-[#64748b]", label: "مكررة ومدمجة" },
      candidate: { bg: "bg-[#fef3c7]", text: "text-[#d97706]", label: "مرشحة للرصد" },
      needs_review: { bg: "bg-[#fffbeb] text-[#b45309]", text: "text-[#b45309]", label: "تنتظر المراجعة" },
      rejected: { bg: "bg-[#fee2e2]", text: "text-[#dc2626]", label: "مستبعدة" },
      approved_pending_capture: { bg: "bg-[#ecfdf5]", text: "text-[#059669]", label: "معتمدة (جاري الالتقاط)" },
      capture_pending: { bg: "bg-[#eff6ff]", text: "text-[#2563eb]", label: "في قائمة الالتقاط" },
      capture_failed: { bg: "bg-[#fef2f2]", text: "text-[#b91c1c]", label: "فشل الالتقاط" },
      report_ready: { bg: "bg-[#f0fdf4]", text: "text-[#16a34a]", label: "جاهزة للتقرير" },
      added_to_report: { bg: "bg-[#e0e7ff]", text: "text-[#4f46e5]", label: "أضيفت للتقرير" },
      published: { bg: "bg-[#f5f3ff]", text: "text-[#7c3aed]", label: "منشورة بالتقرير" },
      archived: { bg: "bg-[#f8fafc]", text: "text-[#64748b]", label: "مؤرشفة" },
    };

    const config = configs[state] || { bg: "bg-[#f1f5f9]", text: "text-[#334155]", label: state };
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const getSentimentBadge = (sentiment: Sentiment) => {
    const configs: Record<Sentiment, { bg: string; text: string; label: string }> = {
      positive: { bg: "bg-emerald-50", text: "text-emerald-700", label: "إيجابي" },
      neutral: { bg: "bg-slate-100", text: "text-slate-600", label: "محايد" },
      negative: { bg: "bg-rose-50", text: "text-rose-700", label: "سلبي" },
    };
    const config = configs[sentiment] ?? configs.neutral;

    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  // Format Sentiment Saudi Style
  return (
    <main className="min-h-screen bg-[#f5f6f4] text-[#171819] font-sans antialiased">
      {/* Dynamic glow decoration */}
      <div className="absolute top-0 right-1/4 -z-10 h-72 w-96 rounded-full bg-gradient-to-tr from-[#1f675d]/5 to-transparent blur-3xl pointer-events-none" />

      {/* Header Container */}
      <header className="border-b border-[#dfe3de] bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 lg:px-8">
          <div>
            <div className="flex items-center gap-2 text-xs md:text-sm text-[#69716d]">
              <Link className="hover:text-[#1f675d] transition-colors" href="/">
                منصة رصد الإعلامية
              </Link>
              <span>/</span>
              <span className="font-medium text-[#171819] flex items-center gap-1">
                المواد المرصودة والمراجعة <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl text-slate-800 tracking-tight">
              لوحة مراجعة المواد المرصودة
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={resetFilters}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#dfe3de] bg-white px-4 text-sm font-semibold text-[#333837] hover:bg-slate-50 transition-colors active:scale-[0.97] transition-transform duration-100"
            >
              <SlidersHorizontal size={15} />
              إعادة تعيين الفلاتر
            </button>
            <Link
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#18201e] hover:bg-[#273431] px-5 text-sm font-semibold text-white transition-all shadow-md hover:shadow-lg active:scale-[0.97] transition-transform duration-100"
              href="/ops"
            >
              <FilePlus2 size={17} />
              إدخال رابط عاجل
            </Link>
          </div>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 lg:grid-cols-[300px_1fr_380px] lg:px-8">
        
        {/* Left Aside: Advanced Filters */}
        <aside className="space-y-6">
          {/* Card: Live Search */}
          <section className="rounded-2xl border border-[#dfe3de] bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
              <Search className="text-[#1f675d]" size={18} />
              <h2 className="font-bold text-slate-800">البحث في المواد المرصودة</h2>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#69716d]" htmlFor="feed-search">
                ابحث بكلمة، كاتب أو رابط
              </label>
              <div className="relative mt-2">
                <input
                  type="text"
                  placeholder="مثال: هداية، هاكاثون..."
                  className="h-10 w-full rounded-xl border border-[#dfe3de] bg-[#fbfbfa] pl-3 pr-9 text-sm focus:border-[#1f675d] focus:outline-none focus:ring-1 focus:ring-[#1f675d] transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  id="feed-search"
                />
                <Search className="absolute right-3 top-3 text-slate-400" size={15} />
              </div>
            </div>

            {/* Platform Checkbox Filter */}
            <div className="mt-6 border-t border-slate-100 pt-4">
              <div className="flex items-center gap-1 mb-3 text-sm font-bold text-slate-700">
                <SlidersHorizontal size={14} className="text-[#1f675d]" />
                <span>حسب المنصة</span>
              </div>
              <div className="space-y-2.5">
                {[
                  { key: "X", label: "منصة X (تويتر)" },
                  { key: "TikTok", label: "تيك توك (TikTok)" },
                  { key: "Instagram", label: "انستقرام (Instagram)" },
                  { key: "News", label: "صحافة إلكترونية" },
                  { key: "Web", label: "مواقع ويب" },
                  { key: "Manual", label: "إدخال يدوي" },
                ].map((plat) => {
                  const isChecked = selectedPlatforms.includes(plat.key);
                  return (
                    <label
                      key={plat.key}
                      className="flex items-center justify-between gap-3 text-sm cursor-pointer select-none group"
                    >
                      <span className="flex items-center gap-2 text-slate-600 group-hover:text-slate-900 transition-colors">
                        <input
                          type="checkbox"
                          className="size-4 rounded accent-[#1f675d]"
                          checked={isChecked}
                          onChange={() => togglePlatform(plat.key)}
                        />
                        {plat.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            {/* Content Classification Filter */}
            <div className="mt-6 border-t border-slate-100 pt-4">
              <div className="flex items-center gap-1 mb-3 text-sm font-bold text-slate-700">
                <Sparkles size={14} className="text-[#1f675d]" />
                <span>حسب تصنيف المحتوى</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "positive" as Sentiment, label: "إيجابي" },
                  { key: "neutral" as Sentiment, label: "محايد" },
                  { key: "negative" as Sentiment, label: "سلبي" },
                ].map((sentiment) => {
                  const isChecked = selectedSentiments.includes(sentiment.key);
                  return (
                    <button
                      key={sentiment.key}
                      type="button"
                      onClick={() => toggleSentiment(sentiment.key)}
                      className={`rounded-xl border px-2.5 py-2 text-xs font-bold transition-all ${
                        isChecked
                          ? "border-[#1f675d] bg-[#e8f3ef] text-[#1f675d]"
                          : "border-[#dfe3de] bg-[#fbfbfa] text-slate-600 hover:border-[#1f675d]/50"
                      }`}
                    >
                      {sentiment.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Sorting Dropdown */}
            <div className="mt-6 border-t border-slate-100 pt-4">
              <div className="flex items-center gap-1 mb-3 text-sm font-bold text-slate-700">
                <ArrowUpDown size={14} className="text-[#1f675d]" />
                <span>الترتيب حسب</span>
              </div>
              <select
                className="h-10 w-full rounded-xl border border-[#dfe3de] bg-[#fbfbfa] px-3 text-sm focus:border-[#1f675d] focus:outline-none transition-all"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "newest" | "relevance" | "reach")}
              >
                <option value="newest">الأحدث أولاً</option>
                <option value="relevance">الأكثر صلة</option>
                <option value="reach">ثقة تصنيف المحتوى</option>
              </select>
            </div>
          </section>

          {/* Card: Live Stats Summary */}
          <section className="rounded-2xl border border-[#dfe3de] bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
              <BarChart3 className="text-[#1f675d]" size={18} />
              <h2 className="font-bold text-slate-800">موجز الرصد اليوم</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#f7f8f6] p-3 text-center">
                <div className="text-[10px] md:text-xs text-[#69716d]">إجمالي المحتوى اليوم</div>
                <div className="mt-1 text-2xl font-bold text-slate-800">{stats.todayCount}</div>
              </div>
              <div className="rounded-xl bg-[#fffbeb] p-3 text-center border border-amber-100">
                <div className="text-[10px] md:text-xs text-amber-800">تحتاج مراجعة</div>
                <div className="mt-1 text-2xl font-bold text-amber-700">{stats.needsReview}</div>
              </div>
              <div className="rounded-xl bg-[#f0fdf4] p-3 text-center border border-emerald-100">
                <div className="text-[10px] md:text-xs text-emerald-800">المعتمدة</div>
                <div className="mt-1 text-2xl font-bold text-emerald-700">{stats.approved}</div>
              </div>
              <div className="rounded-xl bg-[#fef2f2] p-3 text-center border border-rose-100">
                <div className="text-[10px] md:text-xs text-rose-800">مشاكل التقاط</div>
                <div className="mt-1 text-2xl font-bold text-rose-700">{stats.failedCapture}</div>
              </div>
            </div>
          </section>
        </aside>

        {/* Center Section: List of Monitored Items */}
        <section className="min-w-0 rounded-2xl border border-[#dfe3de] bg-white shadow-sm flex flex-col">
          {/* List Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e9e5] px-5 py-4">
            <div className="flex items-center gap-2">
              <Inbox className="text-[#1f675d]" size={20} />
              <h2 className="font-bold text-slate-800 text-lg">المواد المرصودة في المنصة</h2>
              <span className="rounded-lg bg-[#eef3ef] px-2.5 py-1 text-xs font-semibold text-[#1f675d]">
                {filteredAndSortedItems.length} مواد مطابقة
              </span>
            </div>
            {searchTerm.trim() || selectedPlatforms.length > 0 || selectedSentiments.length > 0 ? (
              <span className="text-xs text-[#69716d]">فلاتر نشطة</span>
            ) : null}
          </div>

          {/* Items Divider or Empty State */}
          {filteredAndSortedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="size-16 rounded-full bg-[#f5f6f4] flex items-center justify-center text-slate-400 mb-4 animate-bounce">
                <Inbox size={28} />
              </div>
              <h3 className="text-lg font-bold text-slate-700">لا توجد مواد تطابق البحث</h3>
              <p className="text-sm text-[#69716d] max-w-sm mt-2 leading-relaxed">
                لا توجد مواد رصد تطابق الفلاتر النشطة حالياً. جرّب تعديل فلاتر البحث أو إضافة رابط يدوي.
              </p>
              <button
                onClick={resetFilters}
                className="mt-5 inline-flex items-center gap-1 px-4 py-2 bg-[#1f675d] text-white rounded-xl text-sm font-semibold hover:bg-[#1a554d] transition-colors"
              >
                إعادة تعيين كل الفلاتر
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#edf0eb] overflow-y-auto max-h-[800px]">
              {filteredAndSortedItems.map((item) => {
                const isSelected = item.id === selectedId;
                const platform = getPlatformLabel(item);
                const isX = platform === "X";

                return (
                  <article
                    onClick={() => setSelectedId(item.id)}
                    className={`grid gap-4 px-5 py-5 cursor-pointer transition-all duration-200 border-r-4 ${
                      isSelected
                        ? "bg-gradient-to-l from-[#1f675d]/5 to-transparent border-r-[#1f675d]"
                        : "border-r-transparent hover:bg-slate-50/50"
                    }`}
                    key={item.id}
                  >
                    <div className="min-w-0">
                      {/* Meta information row */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#69716d] mb-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          isX ? "bg-black text-white" : "bg-[#eef3ef] text-[#1f675d]"
                        }`}>
                          {platform}
                        </span>
                        <span className="font-bold text-[#171819]">{item.sourceName}</span>
                        {item.authorHandle && <span className="direction-ltr">{item.authorHandle}</span>}
                        <span>·</span>
                        <span>{new Date(item.publishedAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</span>
                        <span>·</span>
                        {getSentimentBadge(item.sentiment)}
                      </div>

                      {/* Title */}
                      <h3 className="text-base font-bold leading-normal text-slate-800 hover:text-[#1f675d] transition-colors">
                        {item.title}
                      </h3>

                      {/* Excerpt Summary */}
                      <p className="mt-2 text-xs md:text-sm leading-relaxed text-[#5f6662] line-clamp-2">
                        {item.summary || "لا يوجد ملخص متاح لهذه المادة المرصودة."}
                      </p>

                      {/* Highlighted keyword terms matched */}
                      {item.matchedTerms && item.matchedTerms.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {item.matchedTerms.map((term) => (
                            <span
                              className="inline-flex items-center gap-0.5 rounded bg-[#f0f2ef] px-2 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200/50"
                              key={term}
                            >
                              <Sparkles size={8} className="text-[#1f675d]" />
                              {term}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Badge panel & quick stats for card */}
                    <div className="flex flex-wrap items-center justify-between border-t border-slate-100/80 pt-3 mt-1 gap-2">
                      <div className="flex items-center gap-2">
                        {getStateBadge(item.state)}
                        {item.hasReportGradeCapture && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600 border border-indigo-100">
                            <Camera size={10} />
                            لقطة جاهزة
                          </span>
                        )}
                        {item.warning?.includes("ملاءمة منخفضة") && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-100">
                            <AlertTriangle size={10} />
                            مراجعة ملاءمة
                          </span>
                        )}
                      </div>

                      <div className="flex gap-4 text-[11px] text-[#69716d]">
                        <span>الملاءمة: <strong className="text-slate-700">{item.relevanceScore}%</strong></span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Aside: Detailed Selected Item Review Console */}
        <aside className="space-y-6">
          {selectedItem ? (
            <section className="rounded-2xl border border-[#dfe3de] bg-white p-5 shadow-sm relative overflow-hidden">
              {/* Glowing header accent for selected console */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#1f675d] to-[#1f675d]/20" />
              
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#69716d]">
                    <Eye size={14} className="text-[#1f675d]" />
                    لوحة التحكم والمراجعة
                  </div>
                  <h2 className="mt-2 text-base font-bold leading-snug text-slate-800 line-clamp-3">
                    {selectedItem.title}
                  </h2>
                </div>
              </div>

              {/* Toast Success Message */}
              {actionSuccessMessage && (
                <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 font-semibold shadow-sm animate-fade-in">
                  {actionSuccessMessage}
                </div>
              )}
              {actionErrorMessage && (
                <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 font-semibold shadow-sm animate-fade-in">
                  {actionErrorMessage}
                </div>
              )}

              {/* Status and Telemetry list */}
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <div className="flex justify-between items-center bg-[#f7f8f6] rounded-xl px-3 py-2 text-xs">
                  <span className="text-[#69716d]">حالة المادة الآن:</span>
                  <span className="font-bold">{getStateBadge(selectedItem.state)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#f7f8f6] rounded-xl px-3 py-2">
                    <span className="block text-[10px] text-[#69716d]">درجة الصلة بالهاكاثون</span>
                    <strong className="block mt-0.5 text-slate-800">{selectedItem.relevanceScore}%</strong>
                  </div>
                  <div className="bg-[#f7f8f6] rounded-xl px-3 py-2">
                    <span className="block text-[10px] text-[#69716d]">نوع الدليل الحالي</span>
                    <strong className="block mt-0.5 text-slate-800">
                      {selectedItem.hasReportGradeCapture ? "تقرير رسمي" : "مسودة خفيفة"}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Reason card */}
              <div className="mt-4 rounded-xl border border-[#dfe3de] bg-[#fbfbfa] p-4 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-700 mb-1.5">
                  <Sparkles size={14} className="text-[#1f675d]" />
                  تحليل الملاءمة والتصنيف
                </div>
                <p className="leading-relaxed text-[#5f6662]">
                  {selectedItem.relevanceReason || "تم استيراد المادة وتصنيفها كشكل من أشكال الرصد والتوثيق للفعاليات والشركاء."}
                </p>
                {selectedItem.warning && (
                  <div className="mt-2.5 flex items-start gap-1 p-2 rounded bg-rose-50 border border-rose-100 text-rose-800 text-[11px]">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span>{selectedItem.warning}</span>
                  </div>
                )}
              </div>

              {/* Quick links to original source */}
              {selectedItem.originalUrl && (
                <div className="mt-4">
                  <a
                    href={selectedItem.originalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1f675d] hover:underline"
                  >
                    <Link2 size={13} />
                    فتح رابط المادة الأصلي في نافذة جديدة
                  </a>
                </div>
              )}

              {/* Review console Action Buttons */}
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="text-xs font-bold text-[#333837] mb-3">اتخاذ إجراء تحريري:</div>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={actionLoading !== null || selectedItem.state === "report_ready" || selectedItem.state === "added_to_report"}
                    onClick={() => handleReview(selectedItem.id, "approve")}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#1f675d] hover:bg-[#1a554d] text-white text-xs font-bold transition-all shadow active:scale-[0.97] transition-transform duration-100 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {actionLoading === "approve" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    اعتماد المادة
                  </button>

                  <button
                    disabled={actionLoading !== null || selectedItem.state === "rejected"}
                    onClick={() => handleReview(selectedItem.id, "reject")}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-all active:scale-[0.97] transition-transform duration-100 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {actionLoading === "reject" ? (
                      <Loader2 size={14} className="animate-spin text-red-600" />
                    ) : (
                      <XCircle size={14} />
                    )}
                    استبعاد المادة
                  </button>

                  <button
                    disabled={actionLoading !== null || selectedItem.hasReportGradeCapture}
                    onClick={() => handleCapture(selectedItem.id)}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#dfe3de] bg-white hover:bg-slate-50 text-[#333837] text-xs font-bold transition-all active:scale-[0.97] transition-transform duration-100 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {actionLoading === "capture" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Camera size={14} />
                    )}
                    التقاط فوري
                  </button>

                  <button
                    disabled={actionLoading !== null || selectedItem.state === "archived"}
                    onClick={() => handleArchive(selectedItem.id)}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#dfe3de] bg-white hover:bg-slate-50 text-[#333837] text-xs font-bold transition-all active:scale-[0.97] transition-transform duration-100 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {actionLoading === "archive" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Archive size={14} />
                    )}
                    أرشفة المادة
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <div className="rounded-2xl border border-[#dfe3de] bg-white p-5 text-center text-xs text-[#69716d] py-12 shadow-sm">
              <Eye size={20} className="mx-auto mb-2 text-slate-300" />
              حدد مادة رصد من القائمة لعرض تفاصيل التقييم واتخاذ الإجراءات التحريرية.
            </div>
          )}

          {/* Card: System Timeline */}
          <section className="rounded-2xl border border-[#dfe3de] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
              <Clock3 className="text-[#1f675d]" size={18} />
              <h2 className="font-bold text-slate-800">آخر نشاط فعلي</h2>
            </div>
            <div className="space-y-3 text-xs text-slate-600">
              {recentActivityItems.length > 0 ? (
                recentActivityItems.map((activity) => (
                  <div className="flex items-start gap-2" key={activity.id}>
                    <span className="mt-1.5 size-1.5 rounded-full bg-[#1f675d] shrink-0" />
                    <span className="leading-snug">
                      <span className="font-semibold text-slate-700 line-clamp-1">{activity.title}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        {getPlatformLabel(activity)} · {new Date(activity.publishedAt || "").toLocaleDateString("ar-SA")}
                      </span>
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 rounded-full bg-[#1f675d] shrink-0" />
                  <span className="leading-snug">لا توجد مواد مرصودة لعرض نشاط فعلي حالياً.</span>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
