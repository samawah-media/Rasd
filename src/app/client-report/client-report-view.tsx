"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Filter,
  Link2,
  LogOut,
  Search,
  Share2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { ClientReportData, ClientReportItem } from "@/lib/client-report-data";
import type { Role } from "@/lib/types";

type Filters = {
  report: string;
  platform: string;
  source: string;
  sentiment: string;
  confidence: string;
  linkStatus: string;
  screenshotStatus: string;
  from: string;
  to: string;
  query: string;
};

const platformColors: Record<string, string> = {
  X: "#171819",
  Official: "#7568d8",
  TikTok: "#2e9f91",
  YouTube: "#ef6262",
  Unknown: "#b45a21",
};

const linkStatusLabels: Record<ClientReportItem["linkStatus"], string> = {
  openable: "رابط أصلي متاح",
  malformed: "رابط يحتاج تصحيح",
  legacy_evidence_only: "دليل من التقرير القديم",
};

const screenshotStatusLabels: Record<ClientReportItem["screenshotStatus"], string> = {
  available: "لقطة متاحة",
  missing: "لقطة غير متاحة",
};

export function ClientReportView({ data, role }: { data: ClientReportData; role: Role }) {
  const [filters, setFilters] = useState<Filters>({
    report: "all",
    platform: "all",
    source: "all",
    sentiment: "all",
    confidence: "all",
    linkStatus: "all",
    screenshotStatus: "all",
    from: data.summary.dateFrom ?? "",
    to: data.summary.dateTo ?? "",
    query: "",
  });
  const [selectedId, setSelectedId] = useState(data.items[0]?.id ?? "");
  const [showRaw, setShowRaw] = useState(false);

  const filteredItems = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return data.items.filter((item) => {
      const matchesReport = filters.report === "all" || item.sourcePdf === filters.report;
      const matchesPlatform = filters.platform === "all" || item.platform === filters.platform;
      const matchesSource = filters.source === "all" || item.sourceName === filters.source;
      const matchesSentiment = filters.sentiment === "all" || item.sentiment === filters.sentiment;
      const matchesConfidence = filters.confidence === "all" || item.confidence === filters.confidence;
      const matchesLinkStatus = filters.linkStatus === "all" || item.linkStatus === filters.linkStatus;
      const matchesScreenshotStatus =
        filters.screenshotStatus === "all" || item.screenshotStatus === filters.screenshotStatus;
      const matchesFrom = !filters.from || (item.publishDateIso && item.publishDateIso >= filters.from);
      const matchesTo = !filters.to || (item.publishDateIso && item.publishDateIso <= filters.to);
      const matchesQuery =
        !query ||
        [item.title, item.summary, item.authorName, item.sourceName, item.platformLabel, item.rawText]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return (
        matchesReport &&
        matchesPlatform &&
        matchesSource &&
        matchesSentiment &&
        matchesConfidence &&
        matchesLinkStatus &&
        matchesScreenshotStatus &&
        matchesFrom &&
        matchesTo &&
        matchesQuery
      );
    });
  }, [data.items, filters]);

  const selectedItem =
    filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? data.items[0] ?? null;

  const visibleStats = useMemo(() => getVisibleStats(filteredItems), [filteredItems]);
  const canManage = role === "owner" || role === "editor";

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function pickDay(iso: string) {
    setFilters((current) => ({ ...current, from: iso, to: iso }));
  }

  function resetFilters() {
    setFilters({
      report: "all",
      platform: "all",
      source: "all",
      sentiment: "all",
      confidence: "all",
      linkStatus: "all",
      screenshotStatus: "all",
      from: data.summary.dateFrom ?? "",
      to: data.summary.dateTo ?? "",
      query: "",
    });
  }

  return (
    <main className="min-h-screen bg-[#f5f6f4] text-[#171819]">
      <header className="border-b border-[#dfe3de] bg-[#fbfbfa]">
        <div className="mx-auto flex max-w-[1540px] flex-wrap items-center justify-between gap-4 px-4 py-5 lg:px-7">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[#69716d]">
              <span>بوابة العميل</span>
              <span className="rounded-md bg-[#e8f3ef] px-2 py-1 text-xs font-semibold text-[#1f675d]">
                داتا قديمة معتمدة
              </span>
              <span>{data.summary.dateFrom} - {data.summary.dateTo}</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal md:text-3xl">
              تقرير رصد هاكاثون هداية التفاعلي
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ToolButton icon={<Share2 size={17} />} label="مشاركة آمنة" />
            <ToolButton icon={<Download size={17} />} label="PDF" />
            {canManage ? (
              <a
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#18201e] px-4 text-sm font-semibold text-white"
                href="/imports"
              >
                <FileText size={17} />
                بيانات الاستيراد
              </a>
            ) : null}
            <a
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dfe3de] bg-white px-3 text-sm font-semibold"
              href="/auth/logout"
            >
              <LogOut size={16} />
              خروج
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1540px] gap-5 px-4 py-5 lg:grid-cols-[300px_1fr_360px] lg:px-7">
        <aside className="space-y-5">
          <section className="rounded-lg border border-[#dfe3de] bg-white p-4">
            <div className="flex items-center gap-2">
              <Filter className="text-[#277466]" size={18} />
              <h2 className="font-semibold">فلاتر التقرير</h2>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block text-sm">
                <span className="text-[#69716d]">بحث</span>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#69716d]" size={16} />
                  <input
                    className="h-10 w-full rounded-lg border border-[#dfe3de] bg-[#fbfbfa] pr-9 pl-3 text-sm outline-none focus:border-[#277466]"
                    onChange={(event) => updateFilter("query", event.target.value)}
                    placeholder="ابحث في المصدر أو الملخص"
                    value={filters.query}
                  />
                </div>
              </label>

              <SelectField
                label="التقرير"
                onChange={(value) => updateFilter("report", value)}
                options={[
                  { label: "كل الإصدارات", value: "all" },
                  ...data.reports.map((report) => ({
                    label: `${report.label} (${report.count})`,
                    value: report.sourcePdf,
                  })),
                ]}
                value={filters.report}
              />

              <SelectField
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

              <SelectField
                label="المصدر"
                onChange={(value) => updateFilter("source", value)}
                options={[
                  { label: "كل المصادر", value: "all" },
                  ...data.filters.sources.map((source) => ({
                    label: source,
                    value: source,
                  })),
                ]}
                value={filters.source}
              />

              <SelectField
                label="المشاعر"
                onChange={(value) => updateFilter("sentiment", value)}
                options={[
                  { label: "كل التصنيفات", value: "all" },
                  ...data.filters.sentiments.map((sentiment) => ({
                    label: data.items.find((item) => item.sentiment === sentiment)?.sentimentLabel ?? sentiment,
                    value: sentiment,
                  })),
                ]}
                value={filters.sentiment}
              />

              <SelectField
                label="الثقة"
                onChange={(value) => updateFilter("confidence", value)}
                options={[
                  { label: "كل المستويات", value: "all" },
                  ...data.filters.confidenceLevels.map((confidence) => ({
                    label: data.items.find((item) => item.confidence === confidence)?.confidenceLabel ?? confidence,
                    value: confidence,
                  })),
                ]}
                value={filters.confidence}
              />

              <SelectField
                label="حالة الرابط"
                onChange={(value) => updateFilter("linkStatus", value)}
                options={[
                  { label: "كل حالات الروابط", value: "all" },
                  ...data.filters.linkStatuses.map((status) => ({
                    label: linkStatusLabels[status],
                    value: status,
                  })),
                ]}
                value={filters.linkStatus}
              />

              <SelectField
                label="حالة اللقطة"
                onChange={(value) => updateFilter("screenshotStatus", value)}
                options={[
                  { label: "كل حالات اللقطات", value: "all" },
                  ...data.filters.screenshotStatuses.map((status) => ({
                    label: screenshotStatusLabels[status],
                    value: status,
                  })),
                ]}
                value={filters.screenshotStatus}
              />

              <div className="grid grid-cols-2 gap-2">
                <DateField label="من" onChange={(value) => updateFilter("from", value)} value={filters.from} />
                <DateField label="إلى" onChange={(value) => updateFilter("to", value)} value={filters.to} />
              </div>

              <button
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#dfe3de] bg-[#fbfbfa] px-3 text-sm font-semibold"
                onClick={resetFilters}
                type="button"
              >
                <Filter size={16} />
                تصفير الفلاتر
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-[#dfe3de] bg-white p-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="text-[#277466]" size={18} />
              <h2 className="font-semibold">تقويم النشر</h2>
            </div>
            <div className="mt-4 grid max-h-[340px] gap-2 overflow-auto">
              {data.filters.dates.map((day) => (
                <button
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                    filters.from === day.iso && filters.to === day.iso
                      ? "border-[#277466] bg-[#e8f3ef] text-[#1f675d]"
                      : "border-[#dfe3de] bg-[#fbfbfa]"
                  }`}
                  key={day.iso}
                  onClick={() => pickDay(day.iso)}
                  type="button"
                >
                  <span>{day.label}</span>
                  <span className="font-semibold">{day.count.toLocaleString("ar")}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="min-w-0 space-y-5">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Kpi label="المواد المعروضة" value={filteredItems.length} icon={<FileText size={22} />} />
            <Kpi label="كل المواد المعتمدة" value={data.summary.items} icon={<CheckCircle2 size={22} />} />
            <Kpi label="منخفضة الثقة" value={visibleStats.lowConfidence} icon={<AlertTriangle size={22} />} warning />
            <Kpi label="مصادر فريدة" value={visibleStats.publishers} icon={<Sparkles size={22} />} />
          </section>

          <section className="grid min-w-0 gap-5 xl:grid-cols-[1.25fr_0.75fr]">
            <Panel title="التوزيع اليومي" icon={<BarChart3 size={18} />}>
              <DailyBars items={filteredItems} />
            </Panel>
            <Panel title="حصة المنصات" icon={<TrendingUp size={18} />}>
              <DistributionList items={visibleStats.platforms} colors={platformColors} />
            </Panel>
          </section>

          <section className="rounded-lg border border-[#dfe3de] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e9e5] px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <Eye className="text-[#277466]" size={18} />
                  <h2 className="font-semibold">مواد التقرير</h2>
                </div>
                <p className="mt-1 text-sm text-[#69716d]">
                  اختر يومًا أو مدى زمنيًا لعرض ما نُشر عن هداية في تلك الفترة.
                </p>
              </div>
              <span className="rounded-lg bg-[#f0f2ef] px-3 py-2 text-sm font-semibold">
                {filteredItems.length.toLocaleString("ar")} مادة
              </span>
            </div>

            <div className="divide-y divide-[#edf0eb]">
              {filteredItems.length ? (
                filteredItems.map((item) => (
                  <ReportItemCard
                    item={item}
                    key={item.id}
                    onSelect={() => {
                      setSelectedId(item.id);
                      setShowRaw(false);
                    }}
                    selected={selectedItem?.id === item.id}
                  />
                ))
              ) : (
                <div className="grid min-h-72 place-items-center p-6 text-center">
                  <div>
                    <Search className="mx-auto text-[#8a928d]" size={34} />
                    <h3 className="mt-3 font-semibold">لا توجد مواد مطابقة</h3>
                    <p className="mt-2 max-w-md text-sm leading-6 text-[#69716d]">
                      وسّع مدى التاريخ أو خفف فلتر المنصة/الثقة لرؤية مواد أكثر.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </section>

        <aside className="space-y-5">
          <Panel title="ملخص التقرير" icon={<FileText size={18} />}>
            <div className="grid gap-2 text-sm">
              <Fact label="الإصدارات" value={String(data.summary.reports)} />
              <Fact label="مواد بها تحذيرات استخراج" value={String(data.summary.warnings)} />
              <Fact label="بداية الفترة" value={data.summary.dateFrom ?? "غير محدد"} />
              <Fact label="نهاية الفترة" value={data.summary.dateTo ?? "غير محدد"} />
            </div>
          </Panel>

          <Panel title="أبرز الناشرين" icon={<Sparkles size={18} />}>
            <div className="space-y-2">
              {visibleStats.topPublishers.map((publisher) => (
                <div className="rounded-lg bg-[#f7f8f6] px-3 py-2 text-sm" key={publisher.name}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-semibold" title={publisher.name}>{publisher.name}</span>
                    <span>{publisher.count.toLocaleString("ar")}</span>
                  </div>
                  <div className="mt-1 text-xs text-[#69716d]">{publisher.platform}</div>
                </div>
              ))}
            </div>
          </Panel>

          {selectedItem ? (
            <Panel title="تفاصيل المادة" icon={<Link2 size={18} />}>
  <div className="space-y-3">
                {selectedItem.evidenceImagePath ? (
                  <div className="overflow-hidden rounded-lg border border-[#dfe3de] bg-[#f7f8f6]">
                    <Image
                      alt={`صورة صفحة ${selectedItem.page} من ${selectedItem.reportLabel}`}
                      className="h-auto w-full"
                      height={1200}
                      priority
                      src={selectedItem.evidenceImagePath}
                      unoptimized
                      width={900}
                    />
                  </div>
                ) : null}
                <PlatformPill item={selectedItem} />
                <h3 className="font-semibold leading-7">{selectedItem.title}</h3>
                <p className="text-sm leading-6 text-[#5f6662]">{selectedItem.summary}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Fact label="التقرير" value={selectedItem.reportLabel} />
                  <Fact label="الصفحة" value={String(selectedItem.page)} />
                  <Fact label="الكاتب" value={selectedItem.authorName} />
                  <Fact label="النشر" value={selectedItem.publishDateLabel} />
                  <Fact label="الالتقاط" value={selectedItem.captureDateLabel} />
                  <Fact label="الثقة" value={selectedItem.confidenceLabel} />
                  <Fact label="حالة الرابط" value={linkStatusLabels[selectedItem.linkStatus]} />
                  <Fact label="حالة اللقطة" value={screenshotStatusLabels[selectedItem.screenshotStatus]} />
                </div>
                {selectedItem.warnings.length ? (
                  <div className="rounded-lg border border-[#f4d7b0] bg-[#fff1df] p-3 text-sm leading-6 text-[#9a5522]">
                    {selectedItem.warnings.join("، ")}
                  </div>
                ) : null}
                <div className="grid gap-2 text-sm">
                  {selectedItem.originalUrl ? (
                    <a
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#18201e] px-3 font-semibold text-white"
                      href={selectedItem.originalUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <Link2 size={16} />
                      فتح الرابط الأصلي
                    </a>
                  ) : (
                    <div className="rounded-lg border border-[#f4d7b0] bg-[#fff1df] p-3 leading-6 text-[#9a5522]">
                      <p>
                        لا يوجد رابط أصلي داخل PDF لهذه المادة. نعرض صورة صفحة التقرير كدليل، ونحتاج مطابقة لاحقة عبر X API أو إدخال يدوي للرابط.
                      </p>
                      {canManage ? (
                        <Link
                          className="mt-2 inline-flex h-9 items-center justify-center rounded-lg bg-[#18201e] px-3 text-sm font-semibold text-white"
                          href={`/imports/backfill?item=${encodeURIComponent(selectedItem.id)}`}
                        >
                          فتح مهمة استكمال الرابط
                        </Link>
                      ) : (
                        <div className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-sm font-semibold">
                          الرابط الأصلي قيد الاستكمال من فريق رصد.
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {canManage ? (
                  <>
                    <button
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#dfe3de] bg-[#fbfbfa] px-3 text-sm font-semibold"
                      onClick={() => setShowRaw((current) => !current)}
                      type="button"
                    >
                      <Eye size={16} />
                      {showRaw ? "إخفاء النص الخام" : "عرض النص الخام"}
                    </button>
                    {showRaw ? (
                      <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-lg border border-[#dfe3de] bg-[#f7f8f6] p-3 text-right text-xs leading-6">
                        {selectedItem.rawText}
                      </pre>
                    ) : null}
                  </>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function getVisibleStats(items: ClientReportItem[]) {
  const platforms = distribution(items, (item) => item.platform, (item) => item.platformLabel);
  const topPublishers = distribution(items, (item) => item.authorName || item.sourceName, (item) => item.platformLabel)
    .map((entry) => ({ name: entry.key, count: entry.count, platform: entry.label }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    lowConfidence: items.filter((item) => item.confidence === "low").length,
    publishers: new Set(items.map((item) => item.authorName || item.sourceName)).size,
    platforms,
    topPublishers,
  };
}

function distribution(items: ClientReportItem[], getKey: (item: ClientReportItem) => string, getLabel: (item: ClientReportItem) => string) {
  const map = new Map<string, { key: string; label: string; count: number }>();
  for (const item of items) {
    const key = getKey(item) || "غير محدد";
    const current = map.get(key) ?? { key, label: getLabel(item), count: 0 };
    current.count += 1;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function ToolButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dfe3de] bg-white px-3 text-sm font-semibold" type="button">
      {icon}
      {label}
    </button>
  );
}

function SelectField({
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
      <select
        className="mt-2 h-10 w-full rounded-lg border border-[#dfe3de] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-[#277466]"
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

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-[#69716d]">{label}</span>
      <input
        className="mt-2 h-10 w-full rounded-lg border border-[#dfe3de] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-[#277466]"
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}

function Kpi({ label, value, icon, warning = false }: { label: string; value: number; icon: React.ReactNode; warning?: boolean }) {
  return (
    <div className="rounded-lg border border-[#dfe3de] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-[#69716d]">{label}</div>
          <div className="mt-3 text-3xl font-semibold">{value.toLocaleString("ar")}</div>
        </div>
        <span className={warning ? "text-[#b45a21]" : "text-[#277466]"}>{icon}</span>
      </div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-[#dfe3de] bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[#277466]">{icon}</span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DailyBars({ items }: { items: ClientReportItem[] }) {
  const entries = distribution(items.filter((item) => item.publishDateIso), (item) => item.publishDateIso ?? "", (item) => item.publishDateLabel)
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-14);
  const max = Math.max(1, ...entries.map((entry) => entry.count));

  return (
    <div className="flex h-64 w-full max-w-full items-end gap-2 overflow-x-auto rounded-lg bg-[#fbfcfb] p-3">
      {entries.map((entry) => (
        <div className="flex w-12 shrink-0 flex-col items-center gap-2" key={entry.key}>
          <div className="text-xs font-semibold">{entry.count}</div>
          <div
            className="w-full rounded-t-md bg-[#2e9f91]"
            style={{ height: `${Math.max(12, (entry.count / max) * 180)}px` }}
            title={`${entry.label}: ${entry.count}`}
          />
          <div className="max-w-14 truncate text-xs text-[#69716d]" title={entry.label}>
            {entry.key.slice(5)}
          </div>
        </div>
      ))}
    </div>
  );
}

function DistributionList({ items, colors }: { items: { key: string; label: string; count: number }[]; colors: Record<string, string> }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.key}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span>{item.label}</span>
            <span className="font-semibold">{item.count.toLocaleString("ar")}</span>
          </div>
          <div className="h-2 rounded-full bg-[#edf0eb]">
            <div
              className="h-2 rounded-full"
              style={{
                backgroundColor: colors[item.key] ?? "#2e9f91",
                width: `${Math.max(6, (item.count / max) * 100)}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportItemCard({ item, selected, onSelect }: { item: ClientReportItem; selected: boolean; onSelect: () => void }) {
  return (
    <button
      className={`grid w-full gap-4 px-4 py-4 text-right transition hover:bg-[#fbfcfb] md:grid-cols-[1fr_180px] ${
        selected ? "bg-[#fbfcfb]" : ""
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#69716d]">
          <PlatformPill item={item} />
          <span>{item.reportLabel}</span>
          <span>صفحة {item.page}</span>
          <span>{item.authorName}</span>
        </div>
        <h3 className="mt-2 text-lg font-semibold leading-7">{item.title}</h3>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#5f6662]">{item.summary}</p>
      </div>
      <div className="grid content-start gap-2 text-sm">
        <Fact label="تاريخ النشر" value={item.publishDateLabel} />
        <Fact label="التقاط المصدر" value={item.captureDateLabel} />
        <Fact label="المشاعر" value={item.sentimentLabel} />
      </div>
    </button>
  );
}

function PlatformPill({ item }: { item: ClientReportItem }) {
  return (
    <span
      className="rounded-md px-2 py-1 text-xs font-semibold text-white"
      style={{ backgroundColor: platformColors[item.platform] ?? "#69716d" }}
    >
      {item.platformLabel}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f7f8f6] px-3 py-2">
      <div className="text-xs text-[#69716d]">{label}</div>
      <div className="mt-1 truncate font-semibold" title={value}>{value}</div>
    </div>
  );
}
