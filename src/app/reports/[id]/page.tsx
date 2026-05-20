import { notFound } from "next/navigation";
import { CheckCircle2, ExternalLink, FileText } from "lucide-react";
import Image from "next/image";
import { adminRoles } from "@/lib/auth-config";
import { getHidayathonClientReportData } from "@/lib/client-report-data";
import { formatDateTime, formatGregorian, formatHijri } from "@/lib/dates";
import type { MonitoringItem, ReportVersion, Sentiment, SourceType } from "@/lib/types";
import { requireRole } from "@/server/auth";
import { persistentStore } from "@/server/persistent-store";

type RenderableReportItem = MonitoringItem & {
  capturedAtLabel?: string;
  evidenceAssetUrl?: string;
};

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(adminRoles, `/reports/${id}`);
  const legacyIssue = parseLegacyReportIssue(id);
  const legacyReport = legacyIssue ? buildLegacyReportPage(legacyIssue, id) : null;
  const [reports, allItems, reportLinks] = legacyReport
    ? [[], [], []]
    : await Promise.all([
        persistentStore.listReports(),
        persistentStore.listItems(),
        persistentStore.listReportItems(id),
      ]);
  const report = legacyReport?.report ?? reports.find((entry) => entry.id === id);
  if (!report) notFound();

  const linkedItems = reportLinks
    .map((reportItem) => allItems.find((item) => item.id === reportItem.itemId))
    .filter((item): item is MonitoringItem => Boolean(item));
  const reportItems: RenderableReportItem[] =
    legacyReport?.items ??
    (linkedItems.length ? linkedItems : allItems.filter((item) => item.state === "report_ready"));
  const capturesByItemId = new Map<string, Awaited<ReturnType<typeof persistentStore.listCaptures>>>();
  if (!legacyReport) {
    const captures = await Promise.all(reportItems.map((item) => persistentStore.listCaptures(item.id)));
    reportItems.forEach((item, index) => capturesByItemId.set(item.id, captures[index]));
  }

  return (
    <main className="min-h-screen bg-[#f7f5f0] text-[#171512]">
      <section className="mx-auto max-w-5xl px-5 py-8 lg:px-8">
        <div className="rounded-lg bg-[#171512] p-8 text-white md:p-12">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-[#d8cfbf]">تقرير إعلامي</p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-6xl">
                {report.title}
              </h1>
            </div>
            <div className="rounded-lg border border-white/20 p-4 text-left">
              <div className="text-sm text-[#d8cfbf]">الإصدار</div>
              <div className="mt-1 text-3xl font-semibold">{report.version}</div>
            </div>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <CoverFact
              label="الفترة الميلادية"
              value={`${formatGregorian(report.periodStart)} - ${formatGregorian(report.periodEnd)}`}
            />
            <CoverFact
              label="الفترة الهجرية"
              value={`${formatHijri(report.periodStart)} - ${formatHijri(report.periodEnd)}`}
            />
            <CoverFact label="حالة التقرير" value={report.status} />
          </div>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          <Stat label="إجمالي المواد" value={reportItems.length} />
          <Stat
            label="إيجابي"
            value={
              reportItems.filter((item) => item.sentiment === "positive").length
            }
          />
          <Stat
            label="محايد"
            value={
              reportItems.filter((item) => item.sentiment === "neutral").length
            }
          />
          <Stat
            label="مع لقطة"
            value={reportItems.filter((item) => item.hasReportGradeCapture).length}
          />
        </section>

        <section className="mt-6 rounded-lg border border-[#ded6c8] bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <FileText size={20} />
            <h2 className="text-xl font-semibold">أبرز الجهات الناشرة</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from(new Set(reportItems.map((item) => item.sourceName))).map(
              (source) => (
                <div
                  className="rounded-lg border border-[#ded6c8] bg-[#fbfaf7] p-4"
                  key={source}
                >
                  <div className="font-semibold">{source}</div>
                  <div className="mt-1 text-sm text-[#6f675c]">
                    {
                      reportItems.filter((item) => item.sourceName === source)
                        .length
                    }{" "}
                    مادة
                  </div>
                </div>
              ),
            )}
          </div>
        </section>

        <section className="mt-6 space-y-5">
          {reportItems.map((item) => {
            const capture = item.evidenceAssetUrl
              ? {
                  status: "success",
                  assetUrl: item.evidenceAssetUrl,
                  capturedAt: item.capturedAtLabel,
                }
              : capturesByItemId.get(item.id)?.find((entry) => entry.kind === "report_grade");
            return (
              <article
                className="rounded-lg border border-[#ded6c8] bg-white p-5"
                key={item.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm text-[#6f675c]">
                      <CheckCircle2 size={16} />
                      {item.sourceName}
                    </div>
                    <h3 className="mt-2 text-2xl font-semibold">
                      {item.title}
                    </h3>
                    <div className="mt-2 text-sm text-[#6f675c]">
                      {item.authorName} {item.authorHandle ? `/ ${item.authorHandle}` : ""}
                    </div>
                  </div>
                  {isExternalUrl(item.originalUrl) ? (
                    <a
                      className="inline-flex items-center gap-2 rounded-md bg-[#171512] px-3 py-2 text-sm text-white"
                      href={item.originalUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      المصدر
                      <ExternalLink size={15} />
                    </a>
                  ) : (
                    <span className="rounded-md bg-[#f7f5f0] px-3 py-2 text-sm text-[#6f675c]">
                      الدليل من التقرير القديم
                    </span>
                  )}
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.85fr]">
                  <div>
                    <p className="text-base leading-8 text-[#4f4942]">
                      {item.summary}
                    </p>
                    <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                      <ReportFact label="التصنيف" value={item.sentiment} />
                      <ReportFact
                        label="التاريخ الميلادي"
                        value={safeFormat(formatGregorian, item.publishedAt)}
                      />
                      <ReportFact
                        label="التاريخ الهجري"
                        value={safeFormat(formatHijri, item.publishedAt)}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#ded6c8] bg-[#fbfaf7] p-4">
                    {capture?.status === "success" && capture.assetUrl?.startsWith("/imports/legacy-pages/") ? (
                      <div className="overflow-hidden rounded-md border border-[#cbbda9] bg-white">
                        <Image
                          alt={item.title}
                          className="h-auto w-full"
                          height={1200}
                          src={capture.assetUrl}
                          unoptimized
                          width={900}
                        />
                      </div>
                    ) : (
                      <div className="grid min-h-48 place-items-center rounded-md border border-dashed border-[#cbbda9] bg-white text-center text-sm text-[#6f675c]">
                        {capture?.status === "success"
                          ? "Report-grade screenshot محفوظ في R2"
                          : "تعذر إظهار لقطة المصدر"}
                      </div>
                    )}
                    <div className="mt-3 text-sm text-[#6f675c]">
                      {capture?.capturedAt
                        ? `تم التقاط هذه الصورة بتاريخ ${safeFormat(formatDateTime, capture.capturedAt)}`
                        : item.warning ?? "لم يتم التقاط الصورة بعد."}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="mt-6 rounded-lg border border-[#ded6c8] bg-white p-8 text-center">
          <h2 className="text-3xl font-semibold">شكرًا لكم</h2>
          <p className="mx-auto mt-3 max-w-2xl leading-8 text-[#6f675c]">
            هذه الصفحة هي الأصل الآمن للتقرير. يمكن تصديرها كـ PDF بعد اكتمال
            الفحص البصري والتحقق من اللقطات.
          </p>
        </section>
      </section>
    </main>
  );
}

function isExternalUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

function safeFormat(formatter: (value: string) => string, value: string) {
  try {
    return Number.isNaN(new Date(value).getTime()) ? value : formatter(value);
  } catch {
    return value;
  }
}

function parseLegacyReportIssue(id: string) {
  const match = id.match(/^legacy-report-e(\d+)$/);
  return match ? Number(match[1]) : null;
}

function buildLegacyReportPage(issue: number, id: string): { report: ReportVersion; items: RenderableReportItem[] } | null {
  const data = getHidayathonClientReportData();
  const reportSummary = data.reports.find((entry) => entry.issue === issue);
  if (!reportSummary) return null;

  const items = data.items
    .filter((item) => item.reportIssue === issue)
    .map<RenderableReportItem>((item) => ({
      id: item.id,
      sourceId: `legacy-source-${item.platform}`,
      sourceName: item.sourceName || item.authorName || item.platformLabel,
      sourceType: mapLegacySourceType(item.platform),
      state: "published",
      title: item.title,
      originalUrl: item.originalUrl ?? `legacy://hidayathon/${encodeURIComponent(item.sourcePdf)}#page=${item.page}`,
      authorName: item.authorName,
      publishedAt: item.publishDateIso ?? item.publishedDateText,
      summary: item.summary,
      summarySourceText: item.rawText,
      sentiment: mapLegacySentiment(item.sentiment),
      sentimentConfidence: item.confidence === "high" ? 95 : item.confidence === "medium" ? 82 : 70,
      relevanceScore: 100,
      relevanceReason: "مادة مستوردة من تقرير قديم معتمد ومنشور سابقًا.",
      matchedTerms: ["هداية", "هاكاثون"],
      dedupeKey: `legacy:${item.sourcePdf}:${item.page}:${item.platform}:${item.authorName}`,
      hasReportGradeCapture: Boolean(item.evidenceImagePath),
      warning: item.warnings.length
        ? item.warnings.join("، ")
        : item.originalUrl
          ? undefined
          : "لا يوجد رابط أصلي داخل التقرير القديم؛ الدليل المتاح هو صورة صفحة التقرير.",
      capturedAtLabel: item.captureDateLabel,
      evidenceAssetUrl: item.evidenceImagePath ?? undefined,
    }));

  return {
    report: {
      id,
      version: issue,
      status: "published",
      title: `تقرير رصد هاكاثون هداية - الإصدار ${issue}`,
      periodStart: data.summary.dateFrom ?? "2025-12-08",
      periodEnd: data.summary.dateTo ?? "2026-04-26",
      publishedAt: data.generatedAt,
      secureUrl: `/reports/${id}`,
    },
    items,
  };
}

function mapLegacySourceType(platform: string): SourceType {
  if (platform === "X") return "x_oembed";
  return "web_page";
}

function mapLegacySentiment(sentiment: string): Sentiment {
  if (sentiment === "positive" || sentiment === "negative" || sentiment === "neutral") return sentiment;
  return "neutral";
}

function CoverFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/20 p-4">
      <div className="text-sm text-[#d8cfbf]">{label}</div>
      <div className="mt-2 font-semibold">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#ded6c8] bg-white p-5">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="mt-2 text-sm text-[#6f675c]">{label}</div>
    </div>
  );
}

function ReportFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#f7f5f0] px-3 py-2">
      <div className="text-xs text-[#6f675c]">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
