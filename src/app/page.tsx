import React from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, HelpCircle, Activity } from "lucide-react";
import { adminRoles } from "@/lib/auth-config";
import { requireRole } from "@/server/auth";
import AnimatedWorkflowHero from "@/components/AnimatedWorkflowHero";

// Samawah Logo Placeholder
const SamawahIcon = () => (
  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#2383E2] to-[#00C853] flex items-center justify-center text-white font-extrabold text-3xl shadow-md border border-white/20">
    س
  </div>
);

// Hedaya Hackathon Logo Scraped Asset
const HedayaIcon = () => (
  <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center border border-[#204733]/20 p-2 shadow-md">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src="https://hedayathon.com/assets/images/uploads/header/68f724bfa13a4.png"
      alt="شعار هداية"
      className="w-full h-full object-contain"
    />
  </div>
);

export default async function Home() {
  // Ensure the user is fully logged in with correct administrative/operational roles
  await requireRole(adminRoles, "/");

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] text-[var(--color-text-body)] font-sans relative overflow-x-hidden" dir="rtl">

      {/* Decorative Top Gradient bar */}
      <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-[#2383E2] via-[#204733] to-[#00C853]" />

      {/* Modern Background Subtle Grid Patterns */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[300px] bg-gradient-to-b from-[#2383E2]/10 to-transparent blur-[120px] pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-4 py-12 md:py-16 flex flex-col items-center justify-between min-h-screen relative z-10">

        {/* Header Branding */}
        <header className="w-full flex flex-col items-center text-center mb-10 md:mb-12">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-[#2383E2] bg-[#2383E2]/5 border border-[#2383E2]/15 px-4 py-1.5 rounded-full shadow-sm mb-4">
            <Activity size={14} className="animate-pulse" />
            <span>منصة الرصد الإعلامي الذكي</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-[var(--color-text-title)] tracking-tight">
            بوابة التحكم الموحدة
          </h1>
          <p className="text-sm md:text-base text-[var(--color-text-muted)] mt-3 max-w-xl leading-relaxed font-medium">
            مرحباً بك في لوحة تحكم رصد الإعلام والتغطيات. يرجى اختيار البوابة المطلوب الدخول إليها لبدء العمل والتشغيل.
          </p>
        </header>

        {/* Daydream workflow timeline component */}
        <section className="w-full mb-12 md:mb-16">
          <AnimatedWorkflowHero />
        </section>

        {/* Massive Landing Choice Cards */}
        <section className="w-full grid gap-8 md:grid-cols-2 max-w-5xl mx-auto mb-16">

          {/* 1. Hedaya Portal Card */}
          <div className="group relative rounded-3xl border border-[var(--color-border)] bg-white p-8 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between overflow-hidden">
            {/* Hover card border highlight */}
            <div className="absolute inset-0 border-2 border-transparent group-hover:border-[#204733]/20 rounded-3xl transition-colors duration-300" />
            {/* Background blur gradient */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#204733]/5 rounded-full blur-3xl group-hover:bg-[#204733]/10 transition-colors duration-300" />

            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <HedayaIcon />
                <span className="text-[10px] font-extrabold text-[#c0912d] bg-[#204733]/5 border border-[#204733]/10 px-2.5 py-1 rounded-md">
                  بوابة تقرير رصد العميل
                </span>
              </div>

              <h2 className="text-xl md:text-2xl font-extrabold text-[#204733] mb-3">
                هاكاثون هداية
              </h2>
              <p className="text-xs md:text-sm text-[var(--color-text-muted)] leading-relaxed mb-6 font-medium">
                استعراض الإحصائيات التفاعلية الفورية، تدفق التغطيات المعتمدة، ونتائج التقرير الإعلامي الفاخر الموجه للشؤون الدينية برئاسة الحرمين الشريفين.
              </p>

              {/* Bullet Features */}
              <ul className="space-y-3.5 mb-8 text-xs font-semibold text-[var(--color-text-body)]">
                <li className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00C853]" />
                  <span>عرض التقرير التنفيذي العام</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00C853]" />
                  <span>توزيع التغريدات حسب المشاعر والتصنيف</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00C853]" />
                  <span>مشاركة روابط التقرير الفورية مع الإدارة</span>
                </li>
              </ul>
            </div>

            <Link
              href="/client-report"
              className="relative z-10 w-full h-12 rounded-2xl bg-[#204733] hover:bg-[#1a3829] text-white flex items-center justify-center gap-2 text-sm font-bold shadow-md hover:shadow-lg transition-all"
            >
              <span>دخول بوابة هداية</span>
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            </Link>
          </div>

          {/* 2. Samawah Operations Dashboard Card */}
          <div className="group relative rounded-3xl border border-[var(--color-border)] bg-white p-8 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between overflow-hidden">
            {/* Hover card border highlight */}
            <div className="absolute inset-0 border-2 border-transparent group-hover:border-[#2383E2]/20 rounded-3xl transition-colors duration-300" />
            {/* Background blur gradient */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#2383E2]/5 rounded-full blur-3xl group-hover:bg-[#2383E2]/10 transition-colors duration-300" />

            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <SamawahIcon />
                <span className="text-[10px] font-extrabold text-[#2383E2] bg-[#2383E2]/5 border border-[#2383E2]/10 px-2.5 py-1 rounded-md">
                  لوحة المتابعة التشغيلية والأدمن
                </span>
              </div>

              <h2 className="text-xl md:text-2xl font-extrabold text-[var(--color-text-title)] mb-3">
                غرفة الرصد الإعلامي (سماوة)
              </h2>
              <p className="text-xs md:text-sm text-[var(--color-text-muted)] leading-relaxed mb-6 font-medium">
                التحكم بالبنية التحتية للمنصة وسير العمليات. استيراد روابط التغطيات من منصات التواصل الاجتماعي، التدقيق والاعتماد البشري للمواد، وتعديل خيارات التشغيل.
              </p>

              {/* Bullet Features */}
              <ul className="space-y-3.5 mb-8 text-xs font-semibold text-[var(--color-text-body)]">
                <li className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2383E2]" />
                  <span>تلقيم واستيراد روابط الأخبار والتغريدات</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2383E2]" />
                  <span>منصة التشغيل وتتبع صحة الخوادم والأكواد</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2383E2]" />
                  <span>إدارة صلاحيات الوصول والمسؤولين</span>
                </li>
              </ul>
            </div>

            <Link
              href="/directory"
              className="relative z-10 w-full h-12 rounded-2xl bg-[#2383E2] hover:bg-[#1b6ec4] text-white flex items-center justify-center gap-2 text-sm font-bold shadow-md hover:shadow-lg transition-all"
            >
              <span>دخول غرفة الرصد والعمليات</span>
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            </Link>
          </div>

        </section>

        {/* Footer info & security */}
        <footer className="w-full flex flex-col md:flex-row items-center justify-between gap-4 border-t border-[var(--color-border)] pt-8 pb-4 text-xs font-semibold text-[var(--color-text-muted)]">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#00C853]" />
            <span>الاتصال مشفر ومؤمن بالكامل عبر بروتوكولات حماية الأنظمة</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-[#2383E2] bg-[#2383E2]/5 px-2 py-0.5 rounded">إصدار منصة التشغيل: 1.0.4</span>
            <div className="flex items-center gap-1 hover:text-[var(--color-text-title)] cursor-pointer">
              <HelpCircle size={14} />
              <span>المساعدة والدعم الفني</span>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}
