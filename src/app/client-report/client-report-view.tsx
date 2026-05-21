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
} from "lucide-react";
import Image from "next/image";

import type { ClientReportData, ClientReportItem } from "@/lib/client-report-data";
import type { Role } from "@/lib/types";

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
  X: "#171819",
  Official: "#116A5C",
  TikTok: "#22C59E",
  YouTube: "#C74646",
  Website: "#E1A900",
  News: "#277466",
  Unknown: "#66736D",
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
    <main className="min-h-screen bg-[#f6f5ef] text-[#111816]" dir="rtl">
      <header className="border-b border-[#dfe3d9] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-4 lg:px-8">
          <div>
            <p className="text-xs font-semibold text-[#66736d]">منصة خاصة</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal md:text-3xl">رصد هداية هاكاثون</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#116a5c] px-4 text-sm font-semibold text-white shadow-sm shadow-[#116a5c]/15 transition hover:bg-[#0f594e]"
              onClick={exportCurrentView}
              type="button"
            >
              <FileDown size={17} />
              تصدير PDF
            </button>
            <a
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dfe3d9] bg-white px-3 text-sm font-semibold text-[#17201d] transition hover:border-[#c8cec4]"
              href="/auth/logout"
            >
              <LogOut size={16} />
              خروج
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-5 lg:px-8">
        <section className="grid gap-3 lg:grid-cols-[1.25fr_1.25fr_0.8fr_0.8fr]">
          <MetricCard
            context="all"
            label="إجمالي التغطية"
            onClick={applyMetric}
            size="large"
            sublabel={`${filteredItems.length.toLocaleString("ar-SA")} من ${data.summary.items.toLocaleString("ar-SA")}`}
            value={filteredItems.length.toLocaleString("ar-SA")}
          />
          <MetricCard
            context="latest"
            label="آخر تحديث"
            onClick={applyMetric}
            size="large"
            sublabel={metrics.latestItem?.authorName ?? "لا توجد مواد"}
            value={metrics.latestItem?.publishDateLabel ? compactDate(metrics.latestItem.publishDateLabel) : "غير متاح"}
          />
          <MetricCard
            context="positive"
            label="التوجه العام"
            onClick={applyMetric}
            sublabel={metrics.positiveLabel}
            value={`${metrics.sentimentIcon} ${metrics.positivePercent.toLocaleString("ar-SA")}%`}
          />
          <MetricCard
            context="peak"
            label="أعلى يوم نشاط"
            onClick={applyMetric}
            sublabel={metrics.peakDay?.label ?? "غير متاح"}
            value={metrics.peakDay ? metrics.peakDay.count.toLocaleString("ar-SA") : "0"}
          />
        </section>

        <section className="mt-4 rounded-lg border border-[#dfe3d9] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="text-[#116a5c]" size={18} />
              <h2 className="font-semibold">نشاط الأيام</h2>
            </div>
            <button
              className="rounded-md border border-[#dfe3d9] px-3 py-1.5 text-sm font-semibold text-[#116a5c] transition hover:bg-[#ecf5f1]"
              onClick={() => setFilters((current) => ({ ...current, from: data.summary.dateFrom ?? "", to: data.summary.dateTo ?? "" }))}
              type="button"
            >
              كل الأيام
            </button>
          </div>
          <div className="grid grid-cols-7 gap-2 md:grid-cols-[repeat(14,minmax(0,1fr))] xl:grid-cols-[repeat(21,minmax(0,1fr))]">
            {heatmap.map((day) => (
              <button
                aria-label={`عرض ${day.label}`}
                className={`group min-h-16 rounded-lg border p-2 text-right transition ${
                  filters.from === day.date && filters.to === day.date
                    ? "border-[#116a5c] bg-[#e7f3ee]"
                    : "border-[#e3e7df] bg-[#fbfbf8] hover:border-[#116a5c]/45"
                }`}
                key={day.date}
                onClick={() => setFilters((current) => ({ ...current, from: day.date, to: day.date }))}
                type="button"
              >
                <span
                  className="block h-2 rounded-full"
                  style={{ backgroundColor: heatColor(day.intensity) }}
                />
                <span className="mt-2 block truncate text-xs text-[#66736d]">{day.label}</span>
                <span className="mt-1 block text-sm font-semibold">{day.count.toLocaleString("ar-SA")}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-[#dfe3d9] bg-white p-4">
          <div className="grid gap-3 lg:grid-cols-[1.25fr_0.8fr_0.8fr_0.8fr_auto]">
            <label className="block text-sm">
              <span className="text-[#66736d]">بحث</span>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#66736d]" size={16} />
                <input
                  className="h-10 w-full rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] pr-9 pl-3 text-sm outline-none transition focus:border-[#116a5c]"
                  onChange={(event) => updateFilter("query", event.target.value)}
                  placeholder="ابحث في المحتوى أو المصدر"
                  value={filters.query}
                />
              </div>
            </label>
            <DateInput label="من" onChange={(value) => updateFilter("from", value)} value={filters.from} />
            <DateInput label="إلى" onChange={(value) => updateFilter("to", value)} value={filters.to} />
            <SelectInput
              label="المنصة"
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
              className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] px-3 text-sm font-semibold transition hover:border-[#116a5c]/45"
              onClick={() => setShowMoreFilters((current) => !current)}
              type="button"
            >
              <Filter size={16} />
              المزيد
              <ChevronDown className={showMoreFilters ? "rotate-180 transition" : "transition"} size={16} />
            </button>
          </div>

          {showMoreFilters ? (
            <div className="mt-3 grid gap-3 border-t border-[#edf0eb] pt-3 md:grid-cols-2 xl:grid-cols-4">
              <SelectInput
                label="المصدر"
                onChange={(value) => updateFilter("source", value)}
                options={[
                  { label: "كل المصادر", value: "all" },
                  ...data.filters.sources.map((source) => ({ label: source, value: source })),
                ]}
                value={filters.source}
              />
              <SelectInput
                label="التصنيف"
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
                label="النوع"
                onChange={(value) => updateFilter("dataScope", value as Filters["dataScope"])}
                options={[
                  { label: "الكل", value: "all" },
                  { label: "الرصد الحي", value: "live" },
                  { label: "الأرشيف", value: "archive" },
                ]}
                value={filters.dataScope}
              />
              <SelectInput
                label="العرض"
                onChange={(value) => updateFilter("readiness", value as Filters["readiness"])}
                options={[
                  { label: "كل المواد", value: "all" },
                  { label: "جاهزة", value: "ready" },
                  { label: "قيد التجهيز", value: "preparing" },
                ]}
                value={filters.readiness}
              />
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {platformDistribution.map((entry) => (
              <button
                className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${
                  filters.platform === entry.platform
                    ? "border-[#116a5c] bg-[#e7f3ee] text-[#116a5c]"
                    : "border-[#dfe3d9] bg-[#fbfbf8] hover:border-[#116a5c]/45"
                }`}
                key={entry.platform}
                onClick={() => updateFilter("platform", entry.platform)}
                type="button"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: platformColors[entry.platform] ?? "#66736D" }} />
                {entry.label}
                <span>{entry.count.toLocaleString("ar-SA")}</span>
              </button>
            ))}
            <button
              className="inline-flex h-8 items-center gap-2 rounded-full border border-[#dfe3d9] bg-white px-3 text-xs font-semibold text-[#66736d] transition hover:border-[#116a5c]/45"
              onClick={resetFilters}
              type="button"
            >
              تصفير
            </button>
          </div>
        </section>

        <section ref={listRef} className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_410px]">
          <div className="min-w-0 rounded-lg border border-[#dfe3d9] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0eb] px-4 py-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="text-[#116a5c]" size={18} />
                <h2 className="font-semibold">المحتوى</h2>
              </div>
              <span className="rounded-md bg-[#f0f3ee] px-3 py-1.5 text-sm font-semibold">
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
                <div className="grid min-h-72 place-items-center p-6 text-center">
                  <div>
                    <Search className="mx-auto text-[#8a928d]" size={34} />
                    <h3 className="mt-3 font-semibold">لا توجد نتائج</h3>
                    <p className="mt-2 max-w-md text-sm leading-6 text-[#66736d]">
                      جرّب توسيع التاريخ أو تخفيف الفلاتر.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

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

      {detailOpen ? (
        <div className="fixed inset-0 z-40 bg-black/30 xl:hidden" onClick={() => setDetailOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-auto rounded-t-2xl bg-white p-4 shadow-2xl"
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

      {zoomImage ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" onClick={() => setZoomImage(null)}>
          <button
            aria-label="إغلاق"
            className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white text-[#111816]"
            onClick={() => setZoomImage(null)}
            type="button"
          >
            <X size={18} />
          </button>
          <div className="max-h-[90vh] max-w-5xl overflow-auto rounded-lg bg-white p-2" onClick={(event) => event.stopPropagation()}>
            <Image alt="صورة المحتوى" className="h-auto w-full" height={1400} src={zoomImage} unoptimized width={1000} />
          </div>
        </div>
      ) : null}
    </main>
  );
}

function MetricCard({
  context,
  label,
  onClick,
  size = "small",
  sublabel,
  value,
}: {
  context: MetricContext;
  label: string;
  onClick: (context: MetricContext) => void;
  size?: "small" | "large";
  sublabel: string;
  value: string;
}) {
  return (
    <button
      className={`rounded-lg border border-[#dfe3d9] bg-white p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-[#116a5c]/50 hover:shadow-md ${
        size === "large" ? "min-h-32" : "min-h-32"
      }`}
      onClick={() => onClick(context)}
      type="button"
    >
      <span className="text-sm font-semibold text-[#66736d]">{label}</span>
      <span className={`mt-3 block font-semibold tracking-normal ${size === "large" ? "text-3xl" : "text-2xl"}`}>
        {value}
      </span>
      <span className="mt-3 block truncate text-sm text-[#66736d]">{sublabel}</span>
    </button>
  );
}

function ReportRow({ item, selected, onClick }: { item: ClientReportItem; selected: boolean; onClick: () => void }) {
  const imagePath = item.contentImagePath ?? item.evidenceImagePath;
  const isPreparing = !item.originalUrl || !imagePath;

  return (
    <button
      className={`grid w-full gap-3 p-4 text-right transition md:grid-cols-[116px_1fr] ${
        selected ? "bg-[#eef7f2]" : "bg-white hover:bg-[#fbfbf8]"
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-[#dfe3d9] bg-[#f2f4ef]">
        {imagePath ? (
          <Image alt="صورة المحتوى" className="h-full w-full object-cover object-top" height={180} src={imagePath} unoptimized width={240} />
        ) : (
          <div className="grid h-full place-items-center text-[#8a928d]">
            <ImageIcon size={24} />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {item.publisherProfileImagePath ? (
            <span className="relative h-8 w-8 overflow-hidden rounded-full border border-[#dfe3d9] bg-white">
              <Image alt="صورة الناشر" className="h-full w-full object-cover object-top" height={64} src={item.publisherProfileImagePath} unoptimized width={64} />
            </span>
          ) : null}
          <span className="font-semibold">{item.authorName || item.sourceName}</span>
          <span className="rounded-full bg-[#f0f3ee] px-2 py-1 text-xs font-semibold text-[#66736d]">{item.platformLabel}</span>
          <SentimentPill item={item} />
          {isPreparing ? <span className="rounded-full bg-[#fff4c2] px-2 py-1 text-xs font-semibold text-[#745f00]">قيد التجهيز</span> : null}
        </div>
        <h3 className="mt-2 line-clamp-2 font-semibold leading-7">{item.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#66736d]">{item.summary}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-[#66736d]">
          <span>{compactDate(item.publishDateLabel)}</span>
          <span>{item.sourceName}</span>
          {item.originalUrl ? <span className="inline-flex items-center gap-1 text-[#116a5c]"><Link2 size={13} /> رابط أصلي</span> : null}
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
      <aside className="hidden rounded-lg border border-[#dfe3d9] bg-white p-4 xl:block">
        <p className="text-sm text-[#66736d]">اختر مادة لعرض التفاصيل.</p>
      </aside>
    );
  }

  const imagePath = item.contentImagePath ?? item.evidenceImagePath;
  const publishDateIso = item.publishDateIso;

  return (
    <aside className={mobile ? "" : "hidden xl:sticky xl:top-5 xl:block xl:self-start"}>
      <div className={mobile ? "" : "rounded-lg border border-[#dfe3d9] bg-white p-4"}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">تفاصيل المادة</h2>
          <button
            aria-label="إغلاق"
            className="grid h-9 w-9 place-items-center rounded-lg border border-[#dfe3d9] bg-white transition hover:bg-[#f6f5ef] xl:hidden"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </div>

        <div className="space-y-3">
          {imagePath ? (
            <button
              className="group relative block w-full overflow-hidden rounded-lg border border-[#dfe3d9] bg-[#f2f4ef]"
              onClick={() => onZoom(imagePath)}
              type="button"
            >
              <Image alt="صورة المحتوى" className="h-auto w-full" height={1200} priority src={imagePath} unoptimized width={900} />
              <span className="absolute left-3 top-3 inline-flex h-9 items-center gap-2 rounded-lg bg-white/95 px-3 text-xs font-semibold shadow-sm">
                <Maximize2 size={14} />
                تكبير
              </span>
            </button>
          ) : (
            <div className="grid min-h-48 place-items-center rounded-lg border border-[#dfe3d9] bg-[#f2f4ef] text-[#66736d]">
              قيد التجهيز
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {item.publisherProfileImagePath ? (
              <span className="relative h-10 w-10 overflow-hidden rounded-full border border-[#dfe3d9] bg-white">
                <Image alt="صورة الناشر" className="h-full w-full object-cover object-top" height={80} src={item.publisherProfileImagePath} unoptimized width={80} />
              </span>
            ) : null}
            <button className="font-semibold text-[#116a5c]" onClick={() => onFilter("source", item.sourceName)} type="button">
              {item.authorName || item.sourceName}
            </button>
          </div>

          <h3 className="text-lg font-semibold leading-8">{item.title}</h3>
          <p className="text-sm leading-7 text-[#4f5a55]">{item.summary}</p>

          <div className="flex flex-wrap gap-2">
            <InfoChip label={item.platformLabel} onClick={() => onFilter("platform", item.platform)} />
            {publishDateIso ? <InfoChip label={compactDate(item.publishDateLabel)} onClick={() => onFilterDate(publishDateIso, onFilter)} /> : null}
            <InfoChip label={sentimentDisplay(item.sentimentLabel, item.sentiment)} onClick={() => onFilter("sentiment", item.sentiment)} />
            <InfoChip label={item.sourceName} onClick={() => onFilter("source", item.sourceName)} />
          </div>

          <div className="grid gap-2">
            {item.originalUrl ? (
              <a
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#116a5c] px-3 text-sm font-semibold text-white transition hover:bg-[#0f594e]"
                href={item.originalUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink size={16} />
                فتح الرابط الأصلي
              </a>
            ) : (
              <div className="rounded-lg bg-[#fff4c2] px-3 py-2 text-sm font-semibold text-[#745f00]">الرابط قيد التجهيز</div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon={<Copy size={15} />} label={copyState === "link" ? "تم النسخ" : "نسخ الرابط"} onClick={() => onCopy(item.originalUrl ?? item.contentUrl ?? item.title, "link")} />
              <ActionButton icon={<Copy size={15} />} label={copyState === "summary" ? "تم النسخ" : "نسخ الملخص"} onClick={() => onCopy(item.summary, "summary")} />
              {imagePath ? (
                <>
                  <ActionButton icon={<Maximize2 size={15} />} label="تكبير الصورة" onClick={() => onZoom(imagePath)} />
                  <a
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] px-3 text-sm font-semibold transition hover:border-[#116a5c]/45"
                    download
                    href={imagePath}
                  >
                    <Download size={15} />
                    تنزيل الصورة
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
    <label className="block text-sm">
      <span className="text-[#66736d]">{label}</span>
      <select
        className="mt-2 h-10 w-full rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#116a5c]"
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
    <label className="block text-sm">
      <span className="text-[#66736d]">{label}</span>
      <input
        className="mt-2 h-10 w-full rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#116a5c]"
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}

function SentimentPill({ item }: { item: ClientReportItem }) {
  return (
    <span className="rounded-full bg-[#e8f5ef] px-2 py-1 text-xs font-semibold text-[#116a5c]">
      {sentimentDisplay(item.sentimentLabel, item.sentiment)}
    </span>
  );
}

function InfoChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="rounded-full border border-[#dfe3d9] bg-[#fbfbf8] px-3 py-1.5 text-xs font-semibold text-[#4f5a55] transition hover:border-[#116a5c]/45 hover:text-[#116a5c]"
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
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] px-3 text-sm font-semibold transition hover:border-[#116a5c]/45"
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
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
    positiveLabel: positivePercent >= 70 ? "إيجابي" : positivePercent >= 35 ? "متوازن" : "منخفض",
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
  if (intensity >= 0.8) return "#116A5C";
  if (intensity >= 0.55) return "#22C59E";
  if (intensity >= 0.3) return "#F3C744";
  return "#DFE3D9";
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
