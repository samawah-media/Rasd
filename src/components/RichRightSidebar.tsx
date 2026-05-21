"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Database,
  Cpu,
  FileText,
  UserRound,
  Menu,
  X,
  LockKeyhole,
  Settings
} from "lucide-react";

// Beautiful SVG logo placeholder for Samawah
const SamawahLogoPlaceholder = () => (
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#2383E2] to-[#00C853] flex items-center justify-center text-white font-extrabold text-xl shadow-md border border-white/20">
      س
    </div>
    <div className="flex flex-col text-right">
      <span className="text-base font-extrabold leading-tight text-[var(--color-text-title)]">سماوة</span>
      <span className="text-[10px] font-medium text-[var(--color-text-muted)]">للحلول الرقمية</span>
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
      title: "لوحة التشغيل",
      subtitle: "إضافة ومراجعة المحتوى",
      path: "/ops",
      icon: Cpu,
    },
    {
      title: "تقرير العميل",
      subtitle: "الواجهة النهائية للعميل",
      path: "/client-report",
      icon: FileText,
    },
    {
      title: "المصادر",
      subtitle: "RSS والكلمات الدالة",
      path: "/sources",
      icon: Database,
    },
    {
      title: "المستخدمين",
      subtitle: "الأدوار والوصول",
      path: "/access",
      icon: UserRound,
    },
    {
      title: "الإعدادات",
      subtitle: "إعدادات المنصة",
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
          {isReportPage ? <HedayaLogo /> : <SamawahLogoPlaceholder />}
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
        className={`fixed top-0 bottom-0 right-0 w-80 bg-white border-l border-[var(--color-border)] flex flex-col z-50 transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        dir="rtl"
      >
        {/* Sidebar Header */}
        <div className="h-20 border-b border-[var(--color-border)] px-6 flex items-center justify-between">
          <div>
            {isReportPage ? <HedayaLogo /> : <SamawahLogoPlaceholder />}
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
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path || Boolean(pathname?.startsWith(`${item.path}/`));

            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-200 group ${
                  isActive
                    ? "bg-[#2383E2]/10 border-r-4 border-[#2383E2]"
                    : "hover:bg-[var(--color-bg-hover)]"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                    isActive
                      ? "bg-[#2383E2] text-white"
                      : "bg-[#2383E2]/10 text-[#2383E2] group-hover:bg-[#2383E2] group-hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div className="flex flex-col text-right">
                  <span
                    className={`text-sm font-semibold transition-colors ${
                      isActive ? "text-[#2383E2]" : "text-[var(--color-text-body)]"
                    }`}
                  >
                    {item.title}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                    {item.subtitle}
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer Guardrail Info */}
        <div className="p-4 border-t border-[var(--color-border)]">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-title)]">
              <LockKeyhole size={14} className="text-[#2383E2]" />
              <span>SaaS Guardrails Active</span>
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--color-text-muted)]">
              حماية التكلفة والخادم مفعلة لضمان أداء مستقر وفوري لكافة طلبات الرصد.
            </p>
          </div>
        </div>
      </aside>

      {/* Spacer for desktop layout so content doesn't get covered */}
      <div className="hidden lg:block w-80 shrink-0" />
    </>
  );
}
