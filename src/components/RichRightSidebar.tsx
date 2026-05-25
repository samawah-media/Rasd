"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Database,
  Cpu,
  FileText,
  FileInput,
  Menu,
  X,
  LockKeyhole,
  Settings,
} from "lucide-react";

// Primary product mark for RASD.
const RasdLogo = () => (
  <div className="flex items-center">
    <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-black/10 bg-[#111111] text-sm font-extrabold text-white shadow-sm">
      رصد
    </div>
  </div>
);

// Hedaya logo wrapper using the official scraped asset
const HedayaLogo = () => (
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-xl bg-[#204733]/10 flex items-center justify-center border border-[#204733]/20 p-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://hedayathon.com/assets/images/uploads/header/68f724bfa13a4.png"
        alt="شعار هداية"
        className="w-full h-full object-contain"
        onError={(e) => {
          // Fallback if image fails to load
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
    <div className="flex flex-col text-right">
      <span className="text-sm font-bold leading-tight text-[var(--color-text-title)]">هاكاثون هداية</span>
      <span className="text-[10px] font-semibold text-[#c0912d]">الشؤون الدينية</span>
    </div>
  </div>
);

export default function RichRightSidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // We show Hedaya branding if we are on the client-report page, otherwise Samawah
  const isReportPage = pathname?.startsWith("/client-report") || pathname?.startsWith("/reports");

  const menuItems = [
    {
      title: "الرصد اليومي",
      subtitle: "مراجعة المحتوى واعتماده",
      path: "/ops",
      icon: Cpu,
    },
    {
      title: "البث المباشر",
      subtitle: "المواد أول بأول",
      path: "/feed",
      icon: Activity,
    },
    {
      title: "التقارير",
      subtitle: "بوابة فريق هداية",
      path: "/client-report",
      icon: FileText,
    },
    {
      title: "الصحة والربط",
      subtitle: "حالة النظام والتكاملات",
      path: "/health",
      icon: Activity,
    },
    {
      title: "المصادر",
      subtitle: "قنوات الرصد والكلمات",
      path: "/sources",
      icon: Database,
    },
    {
      title: "الاستيراد",
      subtitle: "التقارير القديمة والروابط",
      path: "/imports",
      icon: FileInput,
    },
    {
      title: "الإعدادات",
      subtitle: "الهوية والربط التقني",
      path: "/settings",
      icon: Settings,
    },
  ];

  const handleToggle = () => setIsOpen(!isOpen);

  return (
    <>
      {/* Mobile Header Toggle */}
      <div className="lg:hidden fixed top-0 right-0 left-0 h-16 bg-white border-b border-[var(--color-border)] px-4 flex items-center justify-between z-40">
        <button
          onClick={handleToggle}
          className="p-2 rounded-lg hover:bg-[var(--color-bg-hover)] text-[var(--color-text-body)] transition-colors"
          aria-label="Toggle menu"
        >
          <Menu size={24} />
        </button>
        <div className="scale-90">
          {isReportPage ? <HedayaLogo /> : <RasdLogo />}
        </div>
      </div>

      {/* Backdrop for Mobile */}
      {isOpen && (
        <div
          onClick={handleToggle}
          className="lg:hidden fixed inset-0 bg-black/30 backdrop-blur-sm z-45"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed bottom-0 right-0 top-0 z-50 flex w-[min(86vw,320px)] flex-col border-l border-[var(--color-border)] bg-white shadow-2xl transition-transform duration-300 lg:w-[292px] lg:translate-x-0 lg:shadow-none ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        dir="rtl"
      >
        {/* Sidebar Header */}
        <div className="flex h-20 items-center justify-between border-b border-[var(--color-border)] px-5">
          <div>
            {isReportPage ? <HedayaLogo /> : <RasdLogo />}
          </div>
          <button
            onClick={handleToggle}
            className="lg:hidden p-2 rounded-lg hover:bg-[var(--color-bg-hover)] text-[var(--color-text-body)] transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Sidebar Navigation Links (Circle.so style) */}
        <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:overflow-visible">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path || Boolean(pathname?.startsWith(`${item.path}/`));

            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setIsOpen(false)}
                className={`group flex items-center gap-3.5 rounded-lg border px-3.5 py-3 text-right transition-all duration-200 active:scale-[0.98] ${
                  isActive
                    ? "border-[#c7dfcf] bg-[#f2f8f4] shadow-sm"
                    : "border-transparent hover:border-[#dce8df] hover:bg-[#f8faf8]"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    isActive
                      ? "bg-[#204733] text-white"
                      : "bg-[#204733]/10 text-[#204733] group-hover:bg-[#204733] group-hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex flex-col text-right">
                  <span
                    className={`text-sm font-bold transition-colors ${
                      isActive ? "text-[#204733]" : "text-[var(--color-text-body)]"
                    }`}
                  >
                    {item.title}
                  </span>
                  <span className="mt-0.5 truncate text-[11px] font-semibold text-[var(--color-text-muted)]">
                    {item.subtitle}
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer Guardrail Info */}
        <div className="border-t border-[var(--color-border)] p-4">
          <div className="flex flex-col gap-2 rounded-lg border border-[#dce8df] bg-[#f7faf7] p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-title)]">
              <LockKeyhole size={14} className="text-[#204733]" />
              <span>المنصة مؤمنة</span>
            </div>
            <p className="text-[11px] font-semibold leading-relaxed text-[var(--color-text-muted)]">
              الرصد والربط تحت المتابعة باستمرار.
            </p>
          </div>
        </div>
      </aside>

      {/* Spacer for desktop layout so content doesn't get covered */}
      <div className="hidden w-[292px] shrink-0 lg:block" />
    </>
  );
}
