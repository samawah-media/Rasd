import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, Database, FileText, Settings, ShieldCheck, UsersRound } from "lucide-react";
import AppShell from "@/components/AppShell";
import { adminRoles } from "@/lib/auth-config";
import { requireRole } from "@/server/auth";
import { isSupabaseAdminConfigured } from "@/server/supabase-admin";

export default async function SettingsPage() {
  await requireRole(adminRoles, "/settings");

  const storageMode = isSupabaseAdminConfigured() ? "Supabase متصل" : "ذاكرة محلية";

  return (
    <AppShell>
      <main className="min-h-screen bg-[var(--color-bg-main)] p-5 md:p-8" dir="rtl">
        <header className="mb-8">
          <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--color-text-muted)]">
            <Settings className="h-3.5 w-3.5 text-[#2383E2]" />
            <span>إعدادات المنصة</span>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-[var(--color-text-title)]">الإعدادات</h1>
          <p className="mt-2 max-w-2xl text-xs font-semibold leading-6 text-[var(--color-text-muted)]">
            صفحة خفيفة للروابط والإعدادات العامة. التفاصيل التشغيلية موجودة في لوحة التشغيل والمصادر.
          </p>
        </header>

        <section className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <div className="grid gap-4 md:grid-cols-2">
            <SettingsLink
              href="/ops"
              icon={<Settings className="h-5 w-5" />}
              title="لوحة التشغيل"
              description="إضافة الروابط، المراجعة، اللقطات، والإضافة للتقرير."
            />
            <SettingsLink
              href="/sources"
              icon={<Database className="h-5 w-5" />}
              title="المصادر"
              description="مصادر الأخبار، الكلمات الدالة، واستيراد التقارير القديمة."
            />
            <SettingsLink
              href="/access"
              icon={<UsersRound className="h-5 w-5" />}
              title="المستخدمين"
              description="إدارة صلاحيات المالك والمحرر والعميل."
            />
            <SettingsLink
              href="/client-report"
              icon={<FileText className="h-5 w-5" />}
              title="تقرير العميل"
              description="مراجعة ما يراه العميل في الواجهة النهائية."
            />
          </div>

          <aside className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--color-text-title)]">
              <ShieldCheck className="h-4 w-4 text-[#00C853]" />
              حالة النظام
            </div>
            <dl className="mt-4 space-y-3 text-xs">
              <InfoRow label="التخزين" value={storageMode} />
              <InfoRow label="التنقل" value="مبسط" />
              <InfoRow label="واجهة العميل" value="محمية" />
            </dl>
          </aside>
        </section>
      </main>
    </AppShell>
  );
}

function SettingsLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm transition hover:border-[#2383E2]/40 hover:shadow-premium"
    >
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2383E2]/10 text-[#2383E2]">
        {icon}
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-extrabold text-[var(--color-text-title)]">{title}</h2>
          <p className="mt-2 text-xs font-semibold leading-6 text-[var(--color-text-muted)]">{description}</p>
        </div>
        <ChevronLeft className="mt-1 h-4 w-4 text-[var(--color-text-muted)] transition group-hover:text-[#2383E2]" />
      </div>
    </Link>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-4 py-3">
      <dt className="font-bold text-[var(--color-text-muted)]">{label}</dt>
      <dd className="font-extrabold text-[var(--color-text-title)]">{value}</dd>
    </div>
  );
}
