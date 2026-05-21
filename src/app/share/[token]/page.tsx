import type { Metadata } from "next";
import Image from "next/image";

import { getPreferredHidayathonClientReportData } from "@/lib/client-report-data";
import { resolveReportShareLink } from "@/server/share-links";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "رصد هداية هاكاثون",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await resolveReportShareLink(token);

  if (!share.ok) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f5ef] px-4 text-[#111816]" dir="rtl">
        <section className="max-w-md rounded-lg border border-[#dfe3d9] bg-white p-6 text-center">
          <p className="text-sm font-semibold text-[#66736d]">تقرير خاص</p>
          <h1 className="mt-2 text-2xl font-semibold">الرابط غير متاح</h1>
          <p className="mt-3 text-sm leading-7 text-[#66736d]">
            قد يكون الرابط ملغيًا أو تجاوز حد المشاهدة.
          </p>
        </section>
      </main>
    );
  }

  const data = await getPreferredHidayathonClientReportData();
  const items = data.items.slice(0, 24);
  const positiveCount = data.items.filter((item) => item.sentiment === "positive").length;
  const positivePercent = data.items.length ? Math.round((positiveCount / data.items.length) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#f6f5ef] px-4 py-6 text-[#111816] lg:px-8" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-lg border border-[#dfe3d9] bg-white p-6">
          <p className="text-sm font-semibold text-[#66736d]">تقرير خاص</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">رصد هداية هاكاثون</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#66736d]">
            نسخة قراءة فقط. الروابط والصور مخصصة للاطلاع على المحتوى الأصلي.
          </p>
        </header>

        <section className="mt-4 grid gap-3 md:grid-cols-3">
          <ShareStat label="المواد" value={data.summary.items.toLocaleString("ar-SA")} />
          <ShareStat label="التوجه" value={`😊 ${positivePercent.toLocaleString("ar-SA")}%`} />
          <ShareStat label="آخر تحديث" value={compactDate(items[0]?.publishDateLabel ?? "غير متاح")} />
        </section>

        <section className="mt-4 rounded-lg border border-[#dfe3d9] bg-white">
          <div className="border-b border-[#edf0eb] px-4 py-3">
            <h2 className="font-semibold">المحتوى</h2>
          </div>
          <div className="divide-y divide-[#edf0eb]">
            {items.map((item) => {
              const imagePath = item.contentImagePath ?? item.evidenceImagePath;
              return (
                <article className="grid gap-4 p-4 md:grid-cols-[150px_1fr]" key={item.id}>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-[#dfe3d9] bg-[#f2f4ef]">
                    {imagePath ? (
                      <Image alt="صورة المحتوى" className="h-full w-full object-cover object-top" height={220} src={imagePath} unoptimized width={300} />
                    ) : null}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#66736d]">
                      <span>{item.platformLabel}</span>
                      <span>😊 {item.sentimentLabel}</span>
                      <span>{compactDate(item.publishDateLabel)}</span>
                    </div>
                    <h3 className="mt-2 font-semibold leading-7">{item.title}</h3>
                    <p className="mt-1 text-sm leading-7 text-[#4f5a55]">{item.summary}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-semibold">{item.authorName || item.sourceName}</span>
                      {item.originalUrl ? (
                        <a className="font-semibold text-[#116a5c]" href={item.originalUrl} rel="noreferrer" target="_blank">
                          فتح الرابط الأصلي
                        </a>
                      ) : (
                        <span className="font-semibold text-[#745f00]">قيد التجهيز</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

function ShareStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#dfe3d9] bg-white p-4">
      <p className="text-sm font-semibold text-[#66736d]">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function compactDate(label: string) {
  return label.split("·")[0]?.trim() ?? label;
}
