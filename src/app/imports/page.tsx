import Link from "next/link";
import { ArrowRight, Database, FileSearch, Link2, ShieldCheck } from "lucide-react";

import { ImportsClient } from "./imports-client";
import { adminRoles } from "@/lib/auth-config";
import { getImportedReportsDataset } from "@/lib/imported-reports";
import { requireRole } from "@/server/auth";

export default async function ImportsPage() {
  await requireRole(adminRoles, "/imports");
  const dataset = getImportedReportsDataset();

  return (
    <main className="min-h-screen bg-[#f5f6f4] text-[#171819]">
      <header className="border-b border-[#dfe3de] bg-white">
        <div className="mx-auto flex max-w-[1540px] flex-wrap items-center justify-between gap-4 px-4 py-5 lg:px-7">
          <div>
            <div className="flex items-center gap-2 text-sm text-[#69716d]">
              <Link className="inline-flex items-center gap-1 hover:text-[#1f675d]" href="/">
                <ArrowRight size={16} />
                لوحة الرصد
              </Link>
              <span>/</span>
              <span className="font-semibold text-[#171819]">استيراد التقارير القديمة</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
              مراجعة بيانات التقارير المستخرجة
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#69716d]">
              هذه الصفحة تقرأ ملف JSON المحلي فقط، وتساعدنا على تنظيف مواد تقارير هداية
              قبل اعتمادها كبيانات رسمية داخل المنصة.
            </p>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <HeaderFact
              icon={<FileSearch size={17} />}
              label="مصدر البيانات"
              value="hidayathon_reports.json"
            />
            <HeaderFact
              icon={<Database size={17} />}
              label="التخزين"
              value="قراءة محلية فقط"
            />
            <HeaderFact
              icon={<ShieldCheck size={17} />}
              label="Supabase"
              value="غير متصل هنا"
            />
          </div>
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#18201e] px-4 text-sm font-semibold text-white"
            href="/imports/backfill"
          >
            <Link2 size={17} />
            استكمال الروابط الناقصة
          </Link>
        </div>
      </header>

      <ImportsClient dataset={dataset} />
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
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[#dfe3de] bg-[#fbfbfa] px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-[#69716d]">
        <span className="text-[#277466]">{icon}</span>
        {label}
      </div>
      <div className="mt-1 whitespace-nowrap text-sm font-semibold">{value}</div>
    </div>
  );
}
