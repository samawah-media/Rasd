import React from "react";
import Link from "next/link";
import { Activity, ArrowLeft, FileCheck2, ShieldCheck, Sparkles } from "lucide-react";
import { adminRoles } from "@/lib/auth-config";
import { requireRole } from "@/server/auth";
import AnimatedWorkflowHero from "@/components/AnimatedWorkflowHero";

const SamawahIcon = () => (
  <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#163b33,#1f7a5d)] text-3xl font-bold text-white shadow-[0_18px_40px_rgba(22,59,51,0.28)]">
    س
  </div>
);

const HedayaIcon = () => (
  <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-[#1f4d3f]/10 bg-white p-2 shadow-[0_16px_36px_rgba(15,23,32,0.12)]">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src="https://hedayathon.com/assets/images/uploads/header/68f724bfa13a4.png"
      alt="شعار هداية"
      className="h-full w-full object-contain"
    />
  </div>
);

const clientPoints = [
  "شوف التقرير النهائي بسرعة",
  "تصفح المواد المعتمدة بوضوح",
  "افتح الروابط والأدلة من نفس المكان",
];

const opsPoints = [
  "تابع المواد أول بأول",
  "اعتمد أو ارفض من نفس المسار",
  "خل التقرير جاهز بدون لخبطة",
];

export default async function Home() {
  await requireRole(adminRoles, "/");

  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-[#f3f7f1] text-[var(--color-text-body)]"
      dir="rtl"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.1),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.08),transparent_26%)]" />
      <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(20,65,52,0.75)_1px,transparent_1px),linear-gradient(90deg,rgba(20,65,52,0.75)_1px,transparent_1px)] [background-size:36px_36px]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
        <main className="overflow-hidden rounded-[36px] border border-white/60 bg-white/78 p-5 shadow-[0_30px_90px_rgba(15,23,32,0.08)] backdrop-blur-xl md:p-8">
          <section className="mb-8">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#1f7a5d]/10 bg-[#1f7a5d]/8 px-3 py-1 text-[11px] font-semibold text-[#1f6a53]">
                  <Activity size={14} />
                  الرصد من أول لحظة إلى التقرير
                </span>

                <h1 className="mt-4 text-4xl font-bold tracking-tight text-[#12211d] md:text-6xl">
                  منصة رصد إعلامي
                </h1>

                <p className="mt-4 max-w-2xl text-sm leading-8 text-[#496057] md:text-base">
                  نرصد المحتوى، نرتبه، ونحوّله لتقارير واضحة وجاهزة للمشاركة. والصفحة الرئيسية
                  صارت تعطيك إحساس حي بالرصد بدل ما تكون مجرد مدخل ثابت.
                </p>

                <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-[#24463b]">
                  <span className="rounded-full border border-[#dbe8de] bg-[#f8fbf8] px-3 py-1.5">
                    اعتماد ورفض بشكل مباشر
                  </span>
                  <span className="rounded-full border border-[#dbe8de] bg-[#f8fbf8] px-3 py-1.5">
                    بوابة عميل أوضح
                  </span>
                  <span className="rounded-full border border-[#dbe8de] bg-[#f8fbf8] px-3 py-1.5">
                    تشغيل يومي مرتب
                  </span>
                </div>
              </div>

              <div className="rounded-[30px] border border-[#dbe8de] bg-[linear-gradient(180deg,#ffffff,#f5faf6)] p-5 shadow-[0_22px_50px_rgba(15,23,32,0.05)]">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <HedayaIcon />
                    <div>
                      <p className="text-sm font-bold text-[#12211d]">هداية</p>
                      <p className="text-xs text-[#62786f]">واجهة التقرير والمواد المعتمدة</p>
                    </div>
                  </div>

                  <div className="h-px flex-1 bg-[linear-gradient(90deg,rgba(31,122,93,0),rgba(31,122,93,0.25),rgba(31,122,93,0))]" />

                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <p className="text-sm font-bold text-[#12211d]">سماوة</p>
                      <p className="text-xs text-[#62786f]">غرفة الرصد والعمليات</p>
                    </div>
                    <SamawahIcon />
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[22px] border border-[#ddeae0] bg-white p-4">
                    <div className="flex items-center gap-2 text-[#1f6a53]">
                      <FileCheck2 size={16} />
                      <span className="text-sm font-semibold">تقرير أوضح</span>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-[#5e756d]">
                      المواد المعتمدة تظهر بشكل أسهل وأسرع للعميل.
                    </p>
                  </div>

                  <div className="rounded-[22px] border border-[#ddeae0] bg-white p-4">
                    <div className="flex items-center gap-2 text-[#1f6a53]">
                      <ShieldCheck size={16} />
                      <span className="text-sm font-semibold">قرار أوضح</span>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-[#5e756d]">
                      الاعتماد والرفض صاروا ظاهرين بصريًا من أول نظرة.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <AnimatedWorkflowHero />

          <section className="mt-8 grid gap-4 lg:grid-cols-2">
            <article className="group rounded-[30px] border border-[#dce8de] bg-[linear-gradient(180deg,#ffffff,#f5faf6)] p-6 shadow-[0_18px_50px_rgba(15,23,32,0.05)] transition-transform duration-300 hover:-translate-y-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex rounded-full border border-[#1f7a5d]/10 bg-[#1f7a5d]/8 px-3 py-1 text-[11px] font-semibold text-[#1f6a53]">
                    واجهة التقرير
                  </span>
                  <h2 className="mt-4 text-2xl font-bold text-[#12211d]">بوابة العميل</h2>
                  <p className="mt-3 max-w-md text-sm leading-7 text-[#5b7169]">
                    هنا يشوف العميل التقرير النهائي والمواد المعتمدة بطريقة مرتبة وواضحة.
                  </p>
                </div>

                <HedayaIcon />
              </div>

              <div className="mt-5 space-y-3">
                {clientPoints.map((point) => (
                  <div
                    key={point}
                    className="rounded-2xl border border-[#e3ece5] bg-white px-4 py-3 text-sm text-[#28473d]"
                  >
                    {point}
                  </div>
                ))}
              </div>

              <Link
                href="/client-report"
                className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-[#153c33] text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#0f3028]"
              >
                دخول بوابة العميل
                <ArrowLeft size={16} className="transition-transform duration-300 group-hover:-translate-x-1" />
              </Link>
            </article>

            <article className="group rounded-[30px] border border-[#dce3ef] bg-[linear-gradient(180deg,#ffffff,#f4f8ff)] p-6 shadow-[0_18px_50px_rgba(15,23,32,0.05)] transition-transform duration-300 hover:-translate-y-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex rounded-full border border-[#2563eb]/10 bg-[#2563eb]/8 px-3 py-1 text-[11px] font-semibold text-[#2458cb]">
                    غرفة الرصد
                  </span>
                  <h2 className="mt-4 text-2xl font-bold text-[#12211d]">غرفة العمليات</h2>
                  <p className="mt-3 max-w-md text-sm leading-7 text-[#5b7169]">
                    هنا يشتغل الفريق على الرصد والمراجعة والاعتماد قبل ما تدخل المواد في التقرير.
                  </p>
                </div>

                <SamawahIcon />
              </div>

              <div className="mt-5 space-y-3">
                {opsPoints.map((point) => (
                  <div
                    key={point}
                    className="rounded-2xl border border-[#e2e8f4] bg-white px-4 py-3 text-sm text-[#28473d]"
                  >
                    {point}
                  </div>
                ))}
              </div>

              <Link
                href="/ops"
                className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-[#2563eb] text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#1e54c7]"
              >
                دخول غرفة العمليات
                <ArrowLeft size={16} className="transition-transform duration-300 group-hover:-translate-x-1" />
              </Link>
            </article>
          </section>

          <footer className="mt-8 flex flex-col gap-3 border-t border-[#e1e8e2] pt-6 text-xs text-[#60766d] md:flex-row md:items-center md:justify-between">
            <p>منصة لإدارة الرصد والتقارير بشكل أوضح وأسهل للفريق والعميل.</p>
            <div className="flex items-center gap-2 text-[#24463b]">
              <Sparkles size={14} />
              <span>تجربة أحدث، وحركة أوضح، وقرارات تبان من أول نظرة.</span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
