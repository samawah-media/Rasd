"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Copy,
  ExternalLink,
  Filter,
  Image as ImageIcon,
  Link2,
  Search,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import type {
  LegacyBackfillDataset,
  LegacyBackfillItem,
  LegacyBackfillPriority,
  LegacyBackfillStatus,
} from "@/lib/legacy-backfill";

type Filters = {
  report: string;
  platform: string;
  status: string;
  priority: string;
  query: string;
};

const statusLabels: Record<LegacyBackfillStatus, string> = {
  has_url: "الرابط موجود",
  missing_url: "يحتاج Backfill",
  invalid_url: "رابط معطوب",
  override_ready: "Override جاهز",
};

const priorityLabels: Record<LegacyBackfillPriority, string> = {
  high: "أولوية عالية",
  medium: "أولوية متوسطة",
  low: "أولوية منخفضة",
};

const statusStyles: Record<LegacyBackfillStatus, string> = {
  has_url: "border-[#cfe7df] bg-[#e8f3ef] text-[#1f675d]",
  missing_url: "border-[#f4d7b0] bg-[#fff1df] text-[#9a5522]",
  invalid_url: "border-[#f2c5c5] bg-[#feecec] text-[#a33535]",
  override_ready: "border-[#d8daf7] bg-[#eef0ff] text-[#554bc2]",
};

export function BackfillClient({
  dataset,
  initialSelectedId,
}: {
  dataset: LegacyBackfillDataset;
  initialSelectedId?: string;
}) {
  const [filters, setFilters] = useState<Filters>({
    report: "all",
    platform: "all",
    status: "needs_backfill",
    priority: "all",
    query: "",
  });
  const [selectedId, setSelectedId] = useState(
    dataset.items.some((item) => item.id === initialSelectedId)
      ? (initialSelectedId as string)
      : (dataset.items.find((item) => item.backfillStatus === "missing_url") ?? dataset.items[0])?.id ?? "",
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return dataset.items.filter((item) => {
      const matchesReport = filters.report === "all" || item.sourcePdf === filters.report;
      const matchesPlatform = filters.platform === "all" || item.platform === filters.platform;
      const matchesStatus =
        filters.status === "all" ||
        item.backfillStatus === filters.status ||
        (filters.status === "needs_backfill" &&
          (item.backfillStatus === "missing_url" || item.backfillStatus === "invalid_url"));
      const matchesPriority = filters.priority === "all" || item.backfillPriority === filters.priority;
      const matchesQuery =
        !query ||
        [
          item.title,
          item.summary,
          item.authorName,
          item.sourceName,
          item.reportIssue ? `الإصدار ${item.reportIssue}` : "",
          item.page,
          item.rawText,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesReport && matchesPlatform && matchesStatus && matchesPriority && matchesQuery;
    });
  }, [dataset.items, filters]);

  const selectedItem =
    dataset.items.find((item) => item.id === selectedId) ?? filteredItems[0] ?? dataset.items[0] ?? null;

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function copyOverrideTemplate(item: LegacyBackfillItem) {
    await navigator.clipboard?.writeText(item.overrideTemplate);
    setCopiedId(item.id);
  }

  return (
    <div className="mx-auto grid max-w-[1540px] gap-5 px-4 py-5 lg:grid-cols-[300px_1fr_390px] lg:px-7">
      <aside className="space-y-5">
        <section className="rounded-lg border border-[#dfe3de] bg-white p-4">
          <div className="flex items-center gap-2">
            <Filter className="text-[#277466]" size={18} />
            <h2 className="font-semibold">فلاتر Backfill</h2>
          </div>

          <div className="mt-4 space-y-4">
            <label className="block text-sm">
              <span className="text-[#69716d]">بحث</span>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#69716d]" size={16} />
                <input
                  className="h-10 w-full rounded-lg border border-[#dfe3de] bg-[#fbfbfa] pr-9 pl-3 text-sm outline-none focus:border-[#277466]"
                  onChange={(event) => updateFilter("query", event.target.value)}
                  placeholder="الكاتب، الملخص، الصفحة، النص الخام"
                  value={filters.query}
                />
              </div>
            </label>

            <SelectField
              label="التقرير"
              onChange={(value) => updateFilter("report", value)}
              options={[
                { label: "كل التقارير", value: "all" },
                ...dataset.reports.map((report) => ({
                  label: `الإصدار ${report.issue ?? "-"} - ناقص ${report.missing}`,
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
                ...unique(dataset.items.map((item) => item.platform)).map((platform) => ({
                  label: platform,
                  value: platform,
                })),
              ]}
              value={filters.platform}
            />

            <SelectField
              label="حالة الرابط"
              onChange={(value) => updateFilter("status", value)}
              options={[
                { label: "كل الحالات", value: "all" },
                { label: "ناقص أو معطوب", value: "needs_backfill" },
                { label: statusLabels.missing_url, value: "missing_url" },
                { label: statusLabels.invalid_url, value: "invalid_url" },
                { label: statusLabels.has_url, value: "has_url" },
                { label: statusLabels.override_ready, value: "override_ready" },
              ]}
              value={filters.status}
            />

            <SelectField
              label="الأولوية"
              onChange={(value) => updateFilter("priority", value)}
              options={[
                { label: "كل الأولويات", value: "all" },
                { label: priorityLabels.high, value: "high" },
                { label: priorityLabels.medium, value: "medium" },
                { label: priorityLabels.low, value: "low" },
              ]}
              value={filters.priority}
            />
          </div>
        </section>

        <section className="rounded-lg border border-[#dfe3de] bg-white p-4">
          <h2 className="font-semibold">خطة المعالجة</h2>
          <div className="mt-3 space-y-2 text-sm leading-6 text-[#5f6662]">
            <p>1. المواد التي لديها رابط HTTP من PDF تعتبر جاهزة.</p>
            <p>2. مواد X بلا رابط تأخذ أولوية عالية لأنها تحتاج مطابقة المصدر الأصلي.</p>
            <p>3. عند إيجاد الرابط، احفظه من لوحة التفاصيل ليُسجل في Supabase وتظهر الحالة كـ Override جاهز.</p>
          </div>
        </section>
      </aside>

      <section className="min-w-0 rounded-lg border border-[#dfe3de] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e9e5] px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <Link2 className="text-[#277466]" size={18} />
              <h2 className="font-semibold">قائمة استكمال الروابط</h2>
            </div>
            <p className="mt-1 text-sm text-[#69716d]">
              يظهر الآن {filteredItems.length.toLocaleString("ar")} من {dataset.totalItems.toLocaleString("ar")} مادة.
            </p>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dfe3de] bg-[#fbfbfa] px-3 text-sm font-semibold"
            onClick={() => setFilters({ report: "all", platform: "all", status: "all", priority: "all", query: "" })}
            type="button"
          >
            <Filter size={16} />
            تصفير الفلاتر
          </button>
        </div>

        <div className="max-h-[calc(100vh-170px)] overflow-auto">
          <div className="divide-y divide-[#edf0eb]">
            {filteredItems.map((item) => (
              <BackfillCard
                item={item}
                key={item.id}
                onSelect={() => setSelectedId(item.id)}
                selected={selectedItem?.id === item.id}
              />
            ))}
          </div>
        </div>
      </section>

      <aside>
        {selectedItem ? (
          <DetailsPanel
            copied={copiedId === selectedItem.id}
            item={selectedItem}
            onCopy={() => copyOverrideTemplate(selectedItem)}
          />
        ) : null}
      </aside>
    </div>
  );
}

function BackfillCard({
  item,
  selected,
  onSelect,
}: {
  item: LegacyBackfillItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`grid w-full gap-4 px-4 py-4 text-right transition hover:bg-[#fbfcfb] xl:grid-cols-[1fr_190px] ${
        selected ? "bg-[#fbfcfb]" : ""
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#69716d]">
          <StatusPill status={item.backfillStatus} />
          <span>الإصدار {item.reportIssue ?? "-"}</span>
          <span>صفحة {item.page}</span>
          <span>{item.platform}</span>
          <span>{item.authorName}</span>
        </div>
        <h3 className="mt-2 text-lg font-semibold leading-7">{item.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#5f6662]">{item.summary}</p>
      </div>

      <div className="grid content-start gap-2 text-sm">
        <Fact label="الأولوية" value={priorityLabels[item.backfillPriority]} />
        <Fact label="مصدر الرابط" value={item.originalUrlSource ?? "غير متاح"} />
        <Fact label="الثقة" value={item.confidence} />
      </div>
    </button>
  );
}

function DetailsPanel({
  item,
  copied,
  onCopy,
}: {
  item: LegacyBackfillItem;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <section className="sticky top-5 space-y-4 rounded-lg border border-[#dfe3de] bg-white p-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <StatusPill status={item.backfillStatus} />
          <span className="rounded-md bg-[#f0f2ef] px-2 py-1 text-xs font-semibold">
            {priorityLabels[item.backfillPriority]}
          </span>
        </div>
        <h2 className="mt-3 font-semibold leading-7">{item.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f6662]">{item.backfillReason}</p>
      </div>

      {item.evidenceImagePath ? (
        <div className="overflow-hidden rounded-lg border border-[#dfe3de] bg-[#f7f8f6]">
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
      ) : (
        <div className="grid min-h-32 place-items-center rounded-lg border border-[#dfe3de] bg-[#f7f8f6] text-[#69716d]">
          <ImageIcon size={26} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Fact label="التقرير" value={`الإصدار ${item.reportIssue ?? "-"}`} />
        <Fact label="الصفحة" value={String(item.page)} />
        <Fact label="الكاتب" value={item.authorName} />
        <Fact label="المنصة" value={item.platform} />
      </div>

      <div className="grid gap-2 text-sm">
        {item.effectiveOriginalUrl ? (
          <a
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#18201e] px-3 font-semibold text-white"
            href={item.effectiveOriginalUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink size={16} />
            فتح الرابط الأصلي
          </a>
        ) : (
          <div className="rounded-lg border border-[#f4d7b0] bg-[#fff1df] p-3 leading-6 text-[#9a5522]">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={16} />
              الرابط الأصلي غير موجود
            </div>
            <p className="mt-1">الدليل الحالي هو صورة صفحة التقرير. استخدم روابط البحث بالأسفل للمطابقة.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <a
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#dfe3de] bg-[#fbfbfa] px-3 font-semibold"
            href={item.xSearchUrl}
            rel="noreferrer"
            target="_blank"
          >
            <Search size={16} />
            بحث X
          </a>
          <a
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#dfe3de] bg-[#fbfbfa] px-3 font-semibold"
            href={item.webSearchUrl}
            rel="noreferrer"
            target="_blank"
          >
            <Search size={16} />
            بحث ويب
          </a>
        </div>
      </div>

      <OverrideForm item={item} key={item.id} />

      <div className="rounded-lg border border-[#dfe3de] bg-[#fbfbfa] p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">قالب override</div>
          <button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-[#dfe3de] bg-white px-2 text-xs font-semibold"
            onClick={onCopy}
            type="button"
          >
            {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
            {copied ? "تم النسخ" : "نسخ"}
          </button>
        </div>
        <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-left text-xs leading-5" dir="ltr">
          {item.overrideTemplate}
        </pre>
        <p className="mt-2 text-xs leading-5 text-[#69716d]">
          يمكن استخدام هذا الجزء كبذرة محلية داخل `data/imports/hidayathon_link_overrides.json` أو كمرجع عند المراجعة.
        </p>
      </div>

      <div className="rounded-lg border border-[#cfe7df] bg-[#e8f3ef] p-3 text-sm leading-6 text-[#1f675d]">
        <div className="flex items-center gap-2 font-semibold">
          <BadgeCheck size={16} />
          قاعدة مهمة
        </div>
        <p className="mt-1">
          لا نستبدل صورة صفحة التقرير. الرابط الأصلي يصبح مرجعًا إضافيًا، وصورة التقرير تبقى دليلًا تاريخيًا.
        </p>
      </div>
    </section>
  );
}

function OverrideForm({ item }: { item: LegacyBackfillItem }) {
  const router = useRouter();
  const [originalUrl, setOriginalUrl] = useState(item.effectiveOriginalUrl ?? "");
  const [status, setStatus] = useState<"verified" | "needs_review">(item.override?.status ?? "verified");
  const [note, setNote] = useState(item.override?.note ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");

  async function saveOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState("saving");
    setSaveMessage("");

    const response = await fetch("/api/imports/legacy/backfill/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: item.id,
        original_url: originalUrl,
        status,
        note,
        verified_by: "admin",
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setSaveState("error");
      setSaveMessage(body.message ?? body.error ?? "تعذر حفظ الرابط.");
      return;
    }

    setSaveState("saved");
    setSaveMessage("تم حفظ الرابط في Supabase.");
    router.refresh();
  }

  return (
    <form className="rounded-lg border border-[#dfe3de] bg-[#fbfbfa] p-3" onSubmit={saveOverride}>
      <div className="text-sm font-semibold">حفظ Override في قاعدة البيانات</div>
      <label className="mt-3 block text-sm">
        <span className="text-[#69716d]">الرابط الأصلي</span>
        <input
          className="mt-2 h-10 w-full rounded-lg border border-[#dfe3de] bg-white px-3 text-left text-sm outline-none focus:border-[#277466]"
          dir="ltr"
          onChange={(event) => setOriginalUrl(event.target.value)}
          placeholder="https://x.com/account/status/123"
          value={originalUrl}
        />
      </label>
      <label className="mt-3 block text-sm">
        <span className="text-[#69716d]">الحالة</span>
        <select
          className="mt-2 h-10 w-full rounded-lg border border-[#dfe3de] bg-white px-3 text-sm outline-none focus:border-[#277466]"
          onChange={(event) => setStatus(event.target.value === "needs_review" ? "needs_review" : "verified")}
          value={status}
        >
          <option value="verified">تم التحقق</option>
          <option value="needs_review">يحتاج مراجعة</option>
        </select>
      </label>
      <label className="mt-3 block text-sm">
        <span className="text-[#69716d]">ملاحظة</span>
        <textarea
          className="mt-2 min-h-20 w-full resize-y rounded-lg border border-[#dfe3de] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#277466]"
          onChange={(event) => setNote(event.target.value)}
          placeholder="مصدر المطابقة أو سبب التصحيح"
          value={note}
        />
      </label>
      <button
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#277466] px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={saveState === "saving"}
        type="submit"
      >
        <CheckCircle2 size={16} />
        {saveState === "saving" ? "جار الحفظ" : "حفظ الرابط"}
      </button>
      {saveMessage ? (
        <p className={`mt-2 text-xs leading-5 ${saveState === "error" ? "text-[#a33535]" : "text-[#1f675d]"}`}>
          {saveMessage}
        </p>
      ) : null}
    </form>
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

function StatusPill({ status }: { status: LegacyBackfillStatus }) {
  return (
    <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusStyles[status]}`}>
      {statusLabels[status]}
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

function unique<T>(values: T[]) {
  return [...new Set(values)].sort();
}
