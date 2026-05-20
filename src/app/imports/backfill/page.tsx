import Link from "next/link";
import { ArrowRight, ExternalLink, Link2, ShieldCheck } from "lucide-react";

import { adminRoles } from "@/lib/auth-config";
import { getLegacyBackfillDataset } from "@/lib/legacy-backfill";
import { getMergedLegacyLinkOverrides } from "@/server/legacy-link-overrides-store";
import { requireRole } from "@/server/auth";
import { BackfillClient } from "./backfill-client";

type BackfillPageProps = {
  searchParams?: Promise<{ item?: string }>;
};

export default async function BackfillPage({ searchParams }: BackfillPageProps) {
  await requireRole(adminRoles, "/imports/backfill");
  const params = await searchParams;
  const dataset = getLegacyBackfillDataset(await getMergedLegacyLinkOverrides());

  return (
    <main className="min-h-screen bg-[#f5f6f4] text-[#171819]">
      <header className="border-b border-[#dfe3de] bg-white">
        <div className="mx-auto flex max-w-[1540px] flex-wrap items-center justify-between gap-4 px-4 py-5 lg:px-7">
          <div>
            <div className="flex items-center gap-2 text-sm text-[#69716d]">
              <Link className="inline-flex items-center gap-1 hover:text-[#1f675d]" href="/imports">
                <ArrowRight size={16} />
                استيراد التقارير
              </Link>
              <span>/</span>
              <span className="font-semibold text-[#171819]">استكمال الروابط القديمة</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
              Backfill روابط التغريدات والمصادر القديمة
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#69716d]">
              هذه الصفحة تفصل بين الدليل المتاح من PDF وبين الرابط الأصلي المفقود. نستخدمها الآن للمراجعة
              والبحث وحفظ overrides في Supabase، مع بقاء ملف JSON كبذرة قابلة للمراجعة.
            </p>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <HeaderFact icon={<Link2 size={17} />} label="روابط قابلة للفتح" value={dataset.itemsWithOriginalUrl} />
            <HeaderFact icon={<ExternalLink size={17} />} label="ناقصة أو معطوبة" value={dataset.itemsWithoutOpenableOriginalUrl} />
            <HeaderFact icon={<ShieldCheck size={17} />} label="X ناقصة" value={dataset.xItemsMissingOriginalUrl} />
          </div>
        </div>
      </header>

      <BackfillClient dataset={dataset} initialSelectedId={params?.item} />
    </main>
  );
}

function HeaderFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-[#dfe3de] bg-[#fbfbfa] px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-[#69716d]">
        <span className="text-[#277466]">{icon}</span>
        {label}
      </div>
      <div className="mt-1 whitespace-nowrap text-sm font-semibold">{value.toLocaleString("ar")}</div>
    </div>
  );
}
