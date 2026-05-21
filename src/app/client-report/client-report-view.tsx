"use client";

import { useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  Filter,
  Image as ImageIcon,
  Link2,
  LogOut,
  Maximize2,
  Search,
  X,
  TrendingUp,
  Clock3,
  Heart,
  Sparkles,
} from "lucide-react";
import Image from "next/image";

import type { ClientReportData, ClientReportItem } from "@/lib/client-report-data";
import type { Role } from "@/lib/types";
import AppShell from "@/components/AppShell";
import { BentoCard } from "@/components/BentoGrid";

type Filters = {
  query: string;
  from: string;
  to: string;
  platform: string;
  source: string;
  sentiment: string;
  dataScope: "all" | "archive" | "live";
  readiness: "all" | "ready" | "preparing";
};

type MetricContext = "all" | "latest" | "positive" | "peak";
type ClickableFilterKey = "platform" | "source" | "sentiment" | "from" | "to";

const maxExportItems = 50;

const platformColors: Record<string, string> = {
  X: "#111111",
  Official: "#204733",
  TikTok: "#fe2c55",
  YouTube: "#ff0000",
  Website: "#c0912d",
  News: "#204733",
  Unknown: "#737373",
};

const sentimentIcons: Record<string, string> = {
  positive: "😊",
  neutral: "😐",
  negative: "☹️",
};

export function ClientReportView({ data }: { data: ClientReportData; role: Role }) {
  const [filters, setFilters] = useState<Filters>({
    query: "",
    from: data.summary.dateFrom ?? "",
    to: data.summary.dateTo ?? "",
    platform: "all",
    source: "all",
    sentiment: "all",
    dataScope: "all",
    readiness: "all",
  });
  const [selectedId, setSelectedId] = useState(data.items[0]?.id ?? "");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const sortedItems = useMemo(() => sortItemsByDate(data.items), [data.items]);
  const filteredItems = useMemo(() => applyFilters(sortedItems, filters), [sortedItems, filters]);
  const heatmapItems = useMemo(() => applyFilters(sortedItems, filters, { ignoreDate: true }), [sortedItems, filters]);
  const selectedItem =
    filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? sortedItems[0] ?? null;
  const metrics = useMemo(() => getMetrics(filteredItems), [filteredItems]);
  const heatmap = useMemo(() => getHeatmap(heatmapItems), [heatmapItems]);
  const platformDistribution = useMemo(() => getPlatformDistribution(filteredItems), [filteredItems]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function resetFilters() {
    setFilters({
      query: "",
      from: data.summary.dateFrom ?? "",
      to: data.summary.dateTo ?? "",
      platform: "all",
      source: "all",
      sentiment: "all",
      dataScope: "all",
      readiness: "all",
    });
  }

  function selectItem(item: ClientReportItem | null) {
    if (!item) return;
    setSelectedId(item.id);
    setDetailOpen(true);
    window.setTimeout(() => listRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 20);
  }

  function applyMetric(context: MetricContext) {
    if (context === "all") {
      resetFilters();
      return;
    }

    if (context === "latest") {
      selectItem(metrics.latestItem);
      return;
    }

    if (context === "positive") {
      updateFilter("sentiment", "positive");
      return;
    }

    if (context === "peak" && metrics.peakDay?.date) {
      setFilters((current) => ({ ...current, from: metrics.peakDay?.date ?? "", to: metrics.peakDay?.date ?? "" }));
    }
  }

  async function copyText(value: string, label: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopyState(label);
    window.setTimeout(() => setCopyState(""), 1600);
  }

  function exportCurrentView() {
    if (filteredItems.length > maxExportItems) {
      window.alert(`اختر نطاقًا أضيق. الحد ${maxExportItems.toLocaleString("ar-SA")} مادة.`);
      return;
    }

    const params = new URLSearchParams();
    params.set("ids", filteredItems.map((item) => item.id).join(","));
    window.open(`/api/client-report/hidayathon/export-pdf?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  return (
    <AppShell>
      <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-white/90 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] font-semibold">
              <span>رئاسة الشؤون الدينية بالحرمين</span>
              <span>·</span>
              <span className="text-[#c0912d]">تقرير هاكاثون هداية</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--color-text-title)] md:text-3xl">
              بوابة التقارير الإعلامية والرصد
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#204733] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#1a3829]"
              onClick={exportCurrentView}
              type="button"
            >
              <FileDown size={17} />
              تصدير التقرير PDF
            </button>
            <a
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3.5 text-sm font-semibold text-[var(--color-text-body)] transition hover:bg-[var(--color-bg-hover)]"
              href="/auth/logout"
            >
              <LogOut size={16} />
              خروج
            </a>
          </div>
        </div>
      </header>

      <div className="px-6 py-6 space-y-6">

        {/* Top Bento Row: 4 Metric Cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <BentoCard
            colSpan="col-span-1"
            title="إجمالي التغطية"
            subtitle={`${filteredItems.length.toLocaleString("ar-SA")} من ${data.summary.items.toLocaleString("ar-SA")} مادة`}
            icon={TrendingUp}
            className="cursor-pointer"
          >
            <button
              className="w-full text-right focus:outline-none"
              onClick={() => applyMetric("all")}
              type="button"
            >
              <div className="mt-1 text-3xl font-extrabold text-[var(--color-text-title)] tracking-tight">
                {filteredItems.length.toLocaleString("ar-SA")}
              </div>
              <div className="text-[10px] text-[#204733] font-bold mt-2 bg-[#204733]/5 inline-block px-2 py-0.5 rounded">
                عرض كل المواد
              </div>
            </button>
          </BentoCard>

          <BentoCard
            colSpan="col-span-1"
            title="آخر تحديث"
            subtitle={metrics.latestItem?.authorName ?? "لا توجد مواد"}
            icon={Clock3}
            className="cursor-pointer"
          >
            <button
              className="w-full text-right focus:outline-none"
              onClick={() => applyMetric("latest")}
              type="button"
            >
              <div className="mt-1 text-2xl font-extrabold text-[var(--color-text-title)] tracking-tight truncate">
                {metrics.latestItem?.publishDateLabel ? compactDate(metrics.latestItem.publishDateLabel) : "غير متاح"}
              </div>
              <div className="text-[10px] text-[#c0912d] font-bold mt-2 bg-[#c0912d]/10 inline-block px-2 py-0.5 rounded">
                عرض المادة الأخيرة
              </div>
            </button>
          </BentoCard>

          <BentoCard
            colSpan="col-span-1"
            title="التوجه والمشاعر"
            subtitle={metrics.positiveLabel}
            icon={Heart}
            className="cursor-pointer"
          >
            <button
              className="w-full text-right focus:outline-none"
              onClick={() => applyMetric("positive")}
              type="button"
            >
              <div className="mt-1 text-3xl font-extrabold text-[#00C853] tracking-tight">
                {metrics.sentimentIcon} {metrics.positivePercent.toLocaleString("ar-SA")}%
              </div>
              <div className="text-[10px] text-[#00C853] font-bold mt-2 bg-[#00C853]/10 inline-block px-2 py-0.5 rounded">
                عرض الإيجابي فقط
              </div>
            </button>
          </BentoCard>

          <BentoCard
            colSpan="col-span-1"
            title="أعلى نشاط يومي"
            subtitle={metrics.peakDay?.label ?? "غير متاح"}
            icon={Sparkles}
            className="cursor-pointer"
          >
            <button
              className="w-full text-right focus:outline-none"
              onClick={() => applyMetric("peak")}
              type="button"
            >
              <div className="mt-1 text-3xl font-extrabold text-[var(--color-text-title)] tracking-tight">
                {metrics.peakDay ? metrics.peakDay.count.toLocaleString("ar-SA") : "0"} <span className="text-sm font-semibold text-[var(--color-text-muted)]">مواد</span>
              </div>
              <div className="text-[10px] text-purple-600 font-bold mt-2 bg-purple-50 inline-block px-2 py-0.5 rounded">
                عرض يوم الذروة
              </div>
            </button>
          </BentoCard>

        </section>

        {/* Heatmap Bento Grid */}
        <section className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="text-[#204733]" size={18} />
              <h2 className="font-bold text-sm md:text-base text-[var(--color-text-title)]">خريطة النشاط والتفاعل اليومي</h2>
            </div>
            <button
              className="rounded-xl border border-[var(--color-border)] px-4 py-1.5 text-xs font-semibold text-[#204733] hover:bg-[#204733]/5 transition duration-200"
              onClick={() => setFilters((current) => ({ ...current, from: data.summary.dateFrom ?? "", to: data.summary.dateTo ?? "" }))}
              type="button"
            >
              كل الأيام
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 md:grid-cols-7 xl:grid-cols-12">
            {heatmap.map((day) => (
              <button
                aria-label={`عرض ${day.label}`}
                className={`group min-h-16 rounded-xl border p-2 text-right transition-all duration-200 ${
                  filters.from === day.date && filters.to === day.date
                    ? "border-[#204733] bg-[#204733]/5 shadow-sm"
                    : "border-[var(--color-border)] bg-white hover:border-[#204733]/40 hover:-translate-y-0.5"
                }`}
                key={day.date}
                onClick={() => setFilters((current) => ({ ...current, from: day.date, to: day.date }))}
                type="button"
              >
                <span
                  className="block h-2 rounded-full transition-colors"
                  style={{ backgroundColor: heatColor(day.intensity) }}
                />
                <span className="mt-2 block truncate text-[10px] text-[var(--color-text-muted)] font-semibold">{day.label}</span>
                <span className="mt-1 block text-sm font-bold text-[var(--color-text-title)]">{day.count.toLocaleString("ar-SA")}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Filters Panel Bento Grid */}
        <section className="rounded-3xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
            <label className="block text-xs font-bold text-[var(--color-text-muted)]">
              <span>البحث السريع</span>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={16} />
                <input
                  className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] pr-9 pl-3 text-xs outline-none transition focus:border-[#204733] focus:bg-white font-medium"
                  onChange={(event) => updateFilter("query", event.target.value)}
                  placeholder="ابحث في محتوى التقارير أو الناشر"
                  value={filters.query}
                />
              </div>
            </label>
            <DateInput label="تاريخ البدء" onChange={(value) => updateFilter("from", value)} value={filters.from} />
            <DateInput label="تاريخ الانتهاء" onChange={(value) => updateFilter("to", value)} value={filters.to} />
            <SelectInput
              label="تصفية بالمنصة"
              onChange={(value) => updateFilter("platform", value)}
              options={[
                { label: "كل المنصات", value: "all" },
                ...data.filters.platforms.map((platform) => ({
                  label: data.items.find((item) => item.platform === platform)?.platformLabel ?? platform,
                  value: platform,
                })),
              ]}
              value={filters.platform}
            />
            <button
              className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-4 text-xs font-bold text-[var(--color-text-body)] transition hover:border-[#204733]/45"
              onClick={() => setShowMoreFilters((current) => !current)}
              type="button"
            >
              <Filter size={15} />
              <span>فلاتر متقدمة</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showMoreFilters ? "rotate-180" : ""}`} />
            </button>
          </div>

          {showMoreFilters ? (
            <div className="mt-4 grid gap-4 border-t border-[var(--color-border)] pt-4 md:grid-cols-2 lg:grid-cols-4 animate-fade-in">
              <SelectInput
                label="مصدر التغطية"
                onChange={(value) => updateFilter("source", value)}
                options={[
                  { label: "كل المصادر", value: "all" },
                  ...data.filters.sources.map((source) => ({ label: source, value: source })),
                ]}
                value={filters.source}
              />
              <SelectInput
                label="تصنيف المشاعر"
                onChange={(value) => updateFilter("sentiment", value)}
                options={[
                  { label: "كل التصنيفات", value: "all" },
                  ...data.filters.sentiments.map((sentiment) => ({
                    label: sentimentDisplay(data.items.find((item) => item.sentiment === sentiment)?.sentimentLabel ?? sentiment, sentiment),
                    value: sentiment,
                  })),
                ]}
                value={filters.sentiment}
              />
              <SelectInput
                label="نوع الرصد"
                onChange={(value) => updateFilter("dataScope", value as Filters["dataScope"])}
                options={[
                  { label: "الكل", value: "all" },
                  { label: "الرصد الحي", value: "live" },
                  { label: "الأرشيف التاريخي", value: "archive" },
                ]}
                value={filters.dataScope}
              />
              <SelectInput
                label="حالة التجهيز"
                onChange={(value) => updateFilter("readiness", value as Filters["readiness"])}
                options={[
                  { label: "كل المواد", value: "all" },
                  { label: "جاهزة ومكتملة", value: "ready" },
                  { label: "قيد التجميع والالتقاط", value: "preparing" },
                ]}
                value={filters.readiness}
              />
            </div>
          ) : null}

          {/* Quick Platform Badges Row */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3.5">
            {platformDistribution.map((entry) => (
              <button
                className={`inline-flex h-8 items-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition duration-200 ${
                  filters.platform === entry.platform
                    ? "border-[#204733] bg-[#204733]/5 text-[#204733]"
                    : "border-[var(--color-border)] bg-white hover:border-[#204733]/45"
                }`}
                key={entry.platform}
                onClick={() => updateFilter("platform", entry.platform)}
                type="button"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: platformColors[entry.platform] ?? "#737373" }} />
                <span>{entry.label}</span>
                <span className="text-[10px] opacity-75">({entry.count.toLocaleString("ar-SA")})</span>
              </button>
            ))}
            <button
              className="inline-flex h-8 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3.5 text-xs font-bold text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] transition"
              onClick={resetFilters}
              type="button"
            >
              تصفير الفلاتر
            </button>
          </div>
        </section>

        {/* Content Feed Bento Grid */}
        <section ref={listRef} className="grid gap-6 lg:grid-cols-[1fr_380px]">

          {/* Content List */}
          <div className="min-w-0 rounded-3xl border border-[var(--color-border)] bg-white shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="text-[#204733]" size={18} />
                <h2 className="font-bold text-sm md:text-base text-[var(--color-text-title)]">تدفق المواد المرصودة</h2>
              </div>
              <span className="rounded-xl bg-[#204733]/5 border border-[#204733]/15 px-3 py-1 text-xs font-extrabold text-[#204733]">
                {filteredItems.length.toLocaleString("ar-SA")} مادة
              </span>
            </div>

            <div className="divide-y divide-[#edf0eb]">
              {filteredItems.length ? (
                filteredItems.map((item) => (
                  <ReportRow
                    item={item}
                    key={item.id}
                    onClick={() => selectItem(item)}
                    selected={selectedItem?.id === item.id}
                  />
                ))
              ) : (
                <div className="grid min-h-[300px] place-items-center p-6 text-center">
                  <div>
                    <Search className="mx-auto text-[var(--color-text-muted)]" size={36} />
                    <h3 className="mt-3 font-bold text-sm text-[var(--color-text-title)]">لا توجد نتائج مطابقة</h3>
                    <p className="mt-1.5 max-w-sm text-xs text-[var(--color-text-muted)] leading-relaxed font-semibold">
                      جرّب تغيير كلمات البحث، أو توسيع النطاق الزمني للتاريخ لإظهار مزيد من التغطيات.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Desktop Detail Panel */}
          <DetailPanel
            copyState={copyState}
            item={selectedItem}
            onClose={() => setDetailOpen(false)}
            onCopy={copyText}
            onFilter={(key, value) => updateFilter(key, value)}
            onZoom={setZoomImage}
          />
        </section>
      </div>

      {/* Mobile Detail Overlay */}
      {detailOpen ? (
        <div className="fixed inset-0 z-45 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setDetailOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-auto rounded-t-3xl bg-white p-5 shadow-2xl animate-slide-up"
            onClick={(event) => event.stopPropagation()}
          >
            <DetailPanel
              copyState={copyState}
              item={selectedItem}
              mobile
              onClose={() => setDetailOpen(false)}
              onCopy={copyText}
              onFilter={(key, value) => updateFilter(key, value)}
              onZoom={setZoomImage}
            />
          </div>
        </div>
      ) : null}

      {/* Image Zoom Modal */}
      {zoomImage ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 backdrop-blur p-4" onClick={() => setZoomImage(null)}>
          <button
            aria-label="إغلاق المعاينة"
            className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white text-[var(--color-text-title)] shadow shadow-black/20"
            onClick={() => setZoomImage(null)}
            type="button"
          >
            <X size={18} />
          </button>
          <div className="max-h-[85vh] max-w-4xl overflow-auto rounded-2xl bg-white p-2 border border-white/20" onClick={(event) => event.stopPropagation()}>
            <Image alt="صورة التقرير المكبرة" className="h-auto w-full rounded-lg" height={1400} src={zoomImage} unoptimized width={1000} />
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function ReportRow({ item, selected, onClick }: { item: ClientReportItem; selected: boolean; onClick: () => void }) {
  const imagePath = item.contentImagePath ?? item.evidenceImagePath;
  const isPreparing = !item.originalUrl || !imagePath;

  return (
    <button
      className={`grid w-full gap-4 p-4 text-right transition-all border-r-4 ${
        selected
          ? "bg-[#204733]/5 border-[#204733]"
          : "bg-white hover:bg-[var(--color-bg-hover)] border-transparent"
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="flex flex-col md:flex-row gap-4 w-full">
        {/* Aspect Image Wrapper */}
        <div className="relative w-full md:w-[130px] aspect-[4/3] shrink-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)]">
          {imagePath ? (
            <Image alt="صورة التغطية" className="h-full w-full object-cover object-top" height={180} src={imagePath} unoptimized width={240} />
          ) : (
            <div className="grid h-full place-items-center text-[var(--color-text-muted)]">
              <ImageIcon size={22} />
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {item.publisherProfileImagePath ? (
              <span className="relative h-6 w-6 overflow-hidden rounded-full border border-[var(--color-border)] bg-white shrink-0">
                <Image alt="صورة الحساب" className="h-full w-full object-cover object-top" height={64} src={item.publisherProfileImagePath} unoptimized width={64} />
              </span>
            ) : null}
            <span className="font-bold text-xs text-[var(--color-text-title)]">{item.authorName || item.sourceName}</span>
            <span className="rounded-md bg-[var(--color-bg-main)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--color-text-muted)] border border-[var(--color-border)]">{item.platformLabel}</span>
            <SentimentPill item={item} />
            {isPreparing ? <span className="rounded-md bg-[#fff4c2] px-2 py-0.5 text-[10px] font-extrabold text-[#745f00] border border-[#fbe5c6]">قيد التجهيز</span> : null}
          </div>
          <h3 className="mt-2 line-clamp-2 font-bold text-sm text-[var(--color-text-title)] leading-snug">{item.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-muted)] font-medium">{item.summary}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-extrabold text-[var(--color-text-muted)]">
            <span>{compactDate(item.publishDateLabel)}</span>
            <span>·</span>
            <span>{item.sourceName}</span>
            {item.originalUrl ? (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-[#204733]"><Link2 size={12} /> التغطية الأصلية</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function DetailPanel({
  copyState,
  item,
  mobile = false,
  onClose,
  onCopy,
  onFilter,
  onZoom,
}: {
  copyState: string;
  item: ClientReportItem | null;
  mobile?: boolean;
  onClose: () => void;
  onCopy: (value: string, label: string) => void;
  onFilter: (key: ClickableFilterKey, value: string) => void;
  onZoom: (value: string) => void;
}) {
  if (!item) {
    return (
      <aside className="hidden rounded-3xl border border-[var(--color-border)] bg-white p-5 text-right xl:block xl:sticky xl:top-24 xl:self-start">
        <p className="text-xs font-semibold text-[var(--color-text-muted)] leading-relaxed">
          يرجى اختيار مادة من قائمة الرصد لإظهار تفاصيلها الكاملة وإجراءات النسخ والتحميل هنا.
        </p>
      </aside>
    );
  }

  const imagePath = item.contentImagePath ?? item.evidenceImagePath;
  const publishDateIso = item.publishDateIso;

  return (
    <aside className={mobile ? "" : "hidden lg:block lg:sticky lg:top-24 lg:self-start shrink-0"}>
      <div className={mobile ? "" : "rounded-3xl border border-[var(--color-border)] bg-white p-5"}>
        <div className="mb-4 flex items-center justify-between gap-3 select-none">
          <h2 className="font-bold text-sm text-[var(--color-text-title)]">معاينة تفاصيل المادة</h2>
          <button
            aria-label="إغلاق لوحة التفاصيل"
            className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--color-border)] bg-white transition hover:bg-[var(--color-bg-hover)] lg:hidden"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {imagePath ? (
            <button
              className="group relative block w-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-main)] shadow-sm hover:shadow"
              onClick={() => onZoom(imagePath)}
              type="button"
            >
              <Image alt="صورة التغطية المحددة" className="h-auto w-full rounded-xl transition group-hover:scale-[1.01]" height={1200} priority src={imagePath} unoptimized width={900} />
              <span className="absolute left-3 top-3 inline-flex h-8 items-center gap-1.5 rounded-xl bg-white/95 px-3 text-[10px] font-bold shadow-sm select-none border border-stone-100">
                <Maximize2 size={12} />
                تكبير الصورة
              </span>
            </button>
          ) : (
            <div className="grid min-h-36 place-items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-main)] text-[var(--color-text-muted)] font-semibold text-xs">
              صورة المعاينة قيد التجهيز
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-3">
            {item.publisherProfileImagePath ? (
              <span className="relative h-8 w-8 overflow-hidden rounded-full border border-[var(--color-border)] bg-white shrink-0">
                <Image alt="صورة الناشر" className="h-full w-full object-cover object-top" height={80} src={item.publisherProfileImagePath} unoptimized width={80} />
              </span>
            ) : null}
            <button
              className="font-extrabold text-xs text-[#204733] hover:underline"
              onClick={() => onFilter("source", item.sourceName)}
              type="button"
            >
              {item.authorName || item.sourceName}
            </button>
          </div>

          <h3 className="text-base font-extrabold text-[var(--color-text-title)] leading-snug">{item.title}</h3>
          <p className="text-xs leading-relaxed text-[var(--color-text-body)] font-medium bg-[var(--color-bg-main)] p-3 rounded-2xl border border-[var(--color-border)]">{item.summary}</p>

          <div className="flex flex-wrap gap-1.5 select-none">
            <InfoChip label={item.platformLabel} onClick={() => onFilter("platform", item.platform)} />
            {publishDateIso ? <InfoChip label={compactDate(item.publishDateLabel)} onClick={() => onFilterDate(publishDateIso, onFilter)} /> : null}
            <InfoChip label={sentimentDisplay(item.sentimentLabel, item.sentiment)} onClick={() => onFilter("sentiment", item.sentiment)} />
            <InfoChip label={item.sourceName} onClick={() => onFilter("source", item.sourceName)} />
          </div>

          <div className="grid gap-2 border-t border-[var(--color-border)] pt-4 select-none">
            {item.originalUrl ? (
              <a
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#204733] hover:bg-[#1a3829] text-white flex items-center justify-center gap-2 text-xs font-bold shadow-md hover:shadow-lg transition-all"
                href={item.originalUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink size={15} />
                فتح التغطية الأصلية
              </a>
            ) : (
              <div className="rounded-2xl bg-[#fff4c2] px-3.5 py-3 text-xs font-bold text-[#745f00] border border-[#fbe5c6] text-center">الرابط المباشر قيد التجهيز والالتقاط</div>
            )}

            <div className="grid grid-cols-2 gap-2 mt-1">
              <ActionButton icon={<Copy size={14} />} label={copyState === "link" ? "تم نسخ الرابط" : "نسخ رابط التغطية"} onClick={() => onCopy(item.originalUrl ?? item.contentUrl ?? item.title, "link")} />
              <ActionButton icon={<Copy size={14} />} label={copyState === "summary" ? "تم نسخ الملخص" : "نسخ ملخص المادة"} onClick={() => onCopy(item.summary, "summary")} />
              {imagePath ? (
                <>
                  <ActionButton icon={<Maximize2 size={14} />} label="تكبير الصورة" onClick={() => onZoom(imagePath)} />
                  <a
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 text-xs font-bold text-[var(--color-text-body)] hover:bg-[var(--color-bg-hover)] transition"
                    download
                    href={imagePath}
                  >
                    <Download size={14} />
                    تحميل الصورة
                  </a>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SelectInput({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  value: string;
}) {
  return (
    <label className="block text-xs font-bold text-[var(--color-text-muted)]">
      <span>{label}</span>
      <select
        className="mt-2 h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 text-xs outline-none transition focus:border-[#204733] focus:bg-white font-medium cursor-pointer"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block text-xs font-bold text-[var(--color-text-muted)]">
      <span>{label}</span>
      <input
        className="mt-2 h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 text-xs outline-none transition focus:border-[#204733] focus:bg-white font-medium"
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}

function SentimentPill({ item }: { item: ClientReportItem }) {
  return (
    <span className="rounded-md bg-[#e8f6ed] px-2 py-0.5 text-[10px] font-extrabold text-[#116a5c] border border-[#d1e9e0]">
      {sentimentDisplay(item.sentimentLabel, item.sentiment)}
    </span>
  );
}

function InfoChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-1.5 text-[10px] font-bold text-[var(--color-text-body)] transition hover:border-[#204733]/45 hover:text-[#204733] hover:bg-white"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 text-xs font-bold text-[var(--color-text-body)] hover:bg-[var(--color-bg-hover)] transition"
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function applyFilters(items: ClientReportItem[], filters: Filters, options?: { ignoreDate?: boolean }) {
  const query = filters.query.trim().toLowerCase();

  return items.filter((item) => {
    const imagePath = item.contentImagePath ?? item.evidenceImagePath;
    const isReady = Boolean(item.originalUrl && imagePath);
    const dataScope = item.sourcePdf === "live-hidayathon" ? "live" : "archive";
    const matchesQuery =
      !query ||
      [item.title, item.summary, item.authorName, item.sourceName, item.platformLabel]
        .join(" ")
        .toLowerCase()
        .includes(query);

    return (
      matchesQuery &&
      (filters.platform === "all" || item.platform === filters.platform) &&
      (filters.source === "all" || item.sourceName === filters.source || item.authorName === filters.source) &&
      (filters.sentiment === "all" || item.sentiment === filters.sentiment) &&
      (filters.dataScope === "all" || dataScope === filters.dataScope) &&
      (filters.readiness === "all" || (filters.readiness === "ready" ? isReady : !isReady)) &&
      (options?.ignoreDate || !filters.from || (item.publishDateIso && item.publishDateIso >= filters.from)) &&
      (options?.ignoreDate || !filters.to || (item.publishDateIso && item.publishDateIso <= filters.to))
    );
  });
}

function sortItemsByDate(items: ClientReportItem[]) {
  return [...items].sort((a, b) => itemTimestamp(b) - itemTimestamp(a));
}

function itemTimestamp(item: ClientReportItem) {
  const value = item.publishDateIso ?? item.captureDateIso;
  return value ? new Date(value).getTime() : 0;
}

function getMetrics(items: ClientReportItem[]) {
  const latestItem = items[0] ?? null;
  const positiveCount = items.filter((item) => item.sentiment === "positive").length;
  const positivePercent = items.length ? Math.round((positiveCount / items.length) * 100) : 0;
  const sentimentIcon = positivePercent >= 70 ? "😊" : positivePercent >= 35 ? "😐" : "☹️";
  const peakDay = getHeatmap(items).sort((a, b) => b.count - a.count)[0] ?? null;

  return {
    latestItem,
    peakDay,
    positiveLabel: positivePercent >= 70 ? "إيجابي وداعم" : positivePercent >= 35 ? "متوازن ومحايد" : "تحديات ورسائل سلبية",
    positivePercent,
    sentimentIcon,
  };
}

function getHeatmap(items: ClientReportItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.publishDateIso) continue;
    counts.set(item.publishDateIso, (counts.get(item.publishDateIso) ?? 0) + 1);
  }

  const max = Math.max(...counts.values(), 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      date,
      label: shortDate(date),
      count,
      intensity: count / max,
    }));
}

function getPlatformDistribution(items: ClientReportItem[]) {
  const map = new Map<string, { platform: string; label: string; count: number }>();
  for (const item of items) {
    const current = map.get(item.platform) ?? { platform: item.platform, label: item.platformLabel, count: 0 };
    current.count += 1;
    map.set(item.platform, current);
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
}

function heatColor(intensity: number) {
  if (intensity >= 0.8) return "#204733";
  if (intensity >= 0.55) return "#2e6449";
  if (intensity >= 0.3) return "#c0912d";
  return "#E6E6E6";
}

function compactDate(label: string) {
  return label.split("·")[0]?.trim() ?? label;
}

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    calendar: "gregory",
  }).format(new Date(iso));
}

function sentimentDisplay(label: string, sentiment: string) {
  return `${sentimentIcons[sentiment] ?? "😊"} ${label}`;
}

function onFilterDate(value: string, onFilter: (key: ClickableFilterKey, value: string) => void) {
  onFilter("from", value);
  onFilter("to", value);
}
