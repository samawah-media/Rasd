import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { adminRoles } from "@/lib/auth-config";
import { requireRole } from "@/server/auth";
import AnimatedWorkflowHero from "@/components/AnimatedWorkflowHero";

const entryCards = [
  {
    title: "تقارير رصد هداية ثون",
    description: "بوابة فريق هداية",
    href: "/client-report",
    className: "border-[#c9dfcf] bg-[#f6fbf6] text-[#173f34]",
    buttonClassName: "bg-[#173f34] text-white hover:bg-[#102e25]",
  },
  {
    title: "غرفة العمليات",
    description: "تابع الرصد، راجع المواد، واعتمد اللي يدخل التقرير.",
    href: "/ops",
    className: "border-[#cbd8ef] bg-[#f6f9ff] text-[#17335f]",
    buttonClassName: "bg-[#2458cb] text-white hover:bg-[#1f4aa8]",
  },
];

export default async function Home() {
  await requireRole(adminRoles, "/");

  return (
    <main className="min-h-screen bg-[#f7f8f4] px-4 py-6 text-[#1f2d28]" dir="rtl">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="grid gap-5 lg:grid-cols-[0.74fr_1.26fr] lg:items-center">
          <div className="py-2">
            <p className="text-sm font-semibold text-[#2f7659]">الرصد شغال الآن</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#14231f] md:text-5xl">
              منصة رصد إعلامي
            </h1>
            <p className="mt-4 max-w-xl text-base leading-8 text-[#5b6d65]">
              نرصد المحتوى، نرتبه، ونحوّله لتقارير واضحة وجاهزة للمشاركة.
            </p>
          </div>

          <AnimatedWorkflowHero />
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          {entryCards.map((card) => (
            <article
              key={card.href}
              className={`rounded-lg border p-4 shadow-sm ${card.className}`}
            >
              <div className="flex min-h-[112px] flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <h2 className="text-xl font-bold">{card.title}</h2>
                  <p className="mt-2 text-sm leading-7 opacity-75">{card.description}</p>
                </div>

                <Link
                  href={card.href}
                  className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${card.buttonClassName}`}
                >
                  دخول
                  <ArrowLeft size={16} />
                </Link>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
