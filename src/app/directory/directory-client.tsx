"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Cpu,
  Database,
  FileText,
  Inbox,
  Video,
  Activity,
  Sparkles,
  Shield,
  RefreshCw,
} from "lucide-react";
import AppShell from "@/components/AppShell";

// ==========================================
// 1. Sleek Inline SVG Camera Components
// ==========================================

// A cylindrical bullet camera pointing forward (top-right) on a mount
const BulletCameraSVG = ({ isHovered }: { isHovered: boolean }) => (
  <svg
    viewBox="0 0 200 200"
    className="w-full h-full transition-all duration-700 ease-out"
    style={{
      transform: isHovered
        ? "translateZ(30px) rotateY(-10deg) rotateX(10deg)"
        : "translateZ(0) rotateY(0) rotateX(0)",
      filter: isHovered
        ? "drop-shadow(0 20px 25px rgba(35, 131, 226, 0.15))"
        : "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.05))",
    }}
  >
    <defs>
      <linearGradient id="metal-base" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f3f4f6" />
        <stop offset="50%" stopColor="#d1d5db" />
        <stop offset="100%" stopColor="#9ca3af" />
      </linearGradient>
      <linearGradient id="metal-body" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="40%" stopColor="#e5e7eb" />
        <stop offset="100%" stopColor="#9ca3af" />
      </linearGradient>
      <linearGradient id="visor-grad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#1e3a8a" />
        <stop offset="100%" stopColor="#3b82f6" />
      </linearGradient>
      <radialGradient id="lens-glass" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
        <stop offset="70%" stopColor="#065f46" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#022c22" />
      </radialGradient>
    </defs>

    {/* Mounting Base Plate (Wall mount) */}
    <path
      d="M30 110 C30 80, 50 70, 50 110 C50 150, 30 140, 30 110 Z"
      fill="url(#metal-base)"
      stroke="#9ca3af"
      strokeWidth="1.5"
    />
    
    {/* Mounting Screws */}
    <circle cx="38" cy="85" r="2.5" fill="#4b5563" />
    <circle cx="38" cy="135" r="2.5" fill="#4b5563" />

    {/* Bracket Neck Arm */}
    <path
      d="M45 110 H85 L105 130 H115"
      fill="none"
      stroke="url(#metal-base)"
      strokeWidth="16"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M85 102 V118"
      stroke="#9ca3af"
      strokeWidth="3"
    />

    {/* Cable Loop under bracket */}
    <path
      d="M42 120 C60 150, 90 150, 100 132"
      fill="none"
      stroke="#374151"
      strokeWidth="3.5"
      strokeLinecap="round"
      opacity="0.8"
    />

    {/* Main Cylindrical Camera Body */}
    <g transform="rotate(-15, 125, 105)">
      {/* Sun Visor / Shield */}
      <path
        d="M75 80 L165 80 L175 92 H80 Z"
        fill="url(#visor-grad)"
        opacity="0.95"
      />
      
      {/* Main Cylinder */}
      <rect
        x="80"
        y="92"
        width="85"
        height="40"
        rx="5"
        fill="url(#metal-body)"
        stroke="#d1d5db"
        strokeWidth="1"
      />

      {/* Visor Back Joint */}
      <path
        d="M78 86 L80 92 H88 Z"
        fill="#1e293b"
      />

      {/* Camera Face Plate / Front Bezel */}
      <ellipse
        cx="165"
        cy="112"
        rx="7"
        ry="20"
        fill="#1f2937"
        stroke="#9ca3af"
        strokeWidth="1"
      />

      {/* Lens Glass */}
      <ellipse
        cx="165"
        cy="112"
        rx="4.5"
        ry="13"
        fill="url(#lens-glass)"
      />

      {/* Inner Lens Reflex */}
      <ellipse
        cx="164"
        cy="107"
        rx="2"
        ry="5"
        fill="#ffffff"
        opacity="0.6"
      />

      {/* Red Pulse Scanner Dot */}
      <circle
        cx="165"
        cy="120"
        r="2"
        fill="#ff0000"
        className={isHovered ? "animate-ping" : ""}
        style={{ transformOrigin: "165px 120px" }}
      />
      <circle
        cx="165"
        cy="120"
        r="1.5"
        fill="#ef4444"
      />
    </g>

    {/* Active Laser Scan Grid Overlay on Hover */}
    {isHovered && (
      <g opacity="0.4" className="transition-opacity duration-300">
        <path
          d="M172 82 L210 50 M172 110 L220 110 M172 135 L210 160"
          stroke="#2383E2"
          strokeWidth="1.5"
          strokeDasharray="4,4"
        />
        <polygon
          points="172,82 220,60 220,150 172,135"
          fill="rgba(35, 131, 226, 0.04)"
        />
      </g>
    )}
  </svg>
);

// Suspended spherical L-bracket PTZ camera
const PTZCameraSVG = ({ isHovered }: { isHovered: boolean }) => (
  <svg
    viewBox="0 0 200 200"
    className="w-full h-full transition-all duration-700 ease-out"
    style={{
      transform: isHovered
        ? "translateZ(30px) rotateY(-10deg) rotateX(10deg)"
        : "translateZ(0) rotateY(0) rotateX(0)",
      filter: isHovered
        ? "drop-shadow(0 20px 25px rgba(0, 200, 83, 0.15))"
        : "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.05))",
    }}
  >
    <defs>
      <linearGradient id="bracket-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="50%" stopColor="#e5e7eb" />
        <stop offset="100%" stopColor="#9ca3af" />
      </linearGradient>
      <linearGradient id="body-grad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#f9fafb" />
        <stop offset="100%" stopColor="#d1d5db" />
      </linearGradient>
      <radialGradient id="glass-globe" cx="40%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#1e293b" />
        <stop offset="60%" stopColor="#0f172a" />
        <stop offset="100%" stopColor="#020617" />
      </radialGradient>
      <radialGradient id="laser-lens" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
        <stop offset="60%" stopColor="#991b1b" stopOpacity="0.95" />
        <stop offset="100%" stopColor="#450a0a" />
      </radialGradient>
    </defs>

    {/* L-Bracket Mount on wall (Right side or top-left) */}
    {/* Wall Plate */}
    <rect x="25" y="25" width="12" height="60" rx="3" fill="#9ca3af" />
    <circle cx="31" cy="35" r="2" fill="#4b5563" />
    <circle cx="31" cy="75" r="2" fill="#4b5563" />

    {/* Heavy Curved Arm */}
    <path
      d="M37 40 H115 C125 40, 135 50, 135 60 V95"
      fill="none"
      stroke="url(#bracket-grad)"
      strokeWidth="18"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    
    {/* Bracket Trim Ring */}
    <rect x="120" y="80" width="30" height="6" rx="2" fill="#9ca3af" />

    {/* Camera Upper Base Chassis */}
    <path
      d="M102 95 H168 L160 120 H110 Z"
      fill="url(#body-grad)"
      stroke="#d1d5db"
      strokeWidth="1.5"
    />
    <rect x="118" y="114" width="34" height="6" fill="#4b5563" opacity="0.3" />

    {/* Rotating Ball Joint Plate */}
    <ellipse cx="135" cy="120" rx="25" ry="5" fill="#374151" />

    {/* Camera Lower Sphere Dome */}
    <circle
      cx="135"
      cy="148"
      r="28"
      fill="url(#glass-globe)"
      stroke="#1e293b"
      strokeWidth="1"
    />

    {/* Camera Lens Bezel Ring */}
    <circle
      cx="135"
      cy="154"
      r="13"
      fill="#111827"
      stroke="#374151"
      strokeWidth="1.5"
      className={isHovered ? "transition-all duration-700" : ""}
      style={{
        transform: isHovered ? "translate(3px, -2px) scale(0.95)" : "none",
        transformOrigin: "135px 148px",
      }}
    />

    {/* Camera Lens Glass (Red active monitoring) */}
    <circle
      cx="135"
      cy="154"
      r="8"
      fill="url(#laser-lens)"
      className={isHovered ? "transition-all duration-700" : ""}
      style={{
        transform: isHovered ? "translate(3px, -2px) scale(0.95)" : "none",
        transformOrigin: "135px 148px",
      }}
    />
    <circle cx="132" cy="151" r="2.5" fill="#fff" opacity="0.6" />

    {/* Neon Blinking Indicator LED */}
    <circle
      cx="115"
      cy="138"
      r="2"
      fill="#00C853"
      className="animate-pulse"
    />

    {/* Hover Scan Ring Pulses */}
    {isHovered && (
      <g>
        <ellipse
          cx="135"
          cy="154"
          rx="35"
          ry="15"
          fill="none"
          stroke="#00C853"
          strokeWidth="1.5"
          className="animate-ping"
          style={{ transformOrigin: "135px 154px" }}
        />
        <path
          d="M135 154 L110 190 M135 154 L160 190"
          stroke="#00C853"
          strokeWidth="1"
          opacity="0.3"
          strokeDasharray="2,2"
        />
      </g>
    )}
  </svg>
);

// Ceiling-mounted glass dome camera
const DomeCameraSVG = ({ isHovered }: { isHovered: boolean }) => (
  <svg
    viewBox="0 0 200 200"
    className="w-full h-full transition-all duration-700 ease-out"
    style={{
      transform: isHovered
        ? "translateZ(30px) rotateY(-10deg) rotateX(10deg)"
        : "translateZ(0) rotateY(0) rotateX(0)",
      filter: isHovered
        ? "drop-shadow(0 20px 25px rgba(255, 171, 0, 0.15))"
        : "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.05))",
    }}
  >
    <defs>
      <linearGradient id="ceiling-ring" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="30%" stopColor="#f3f4f6" />
        <stop offset="70%" stopColor="#d1d5db" />
        <stop offset="100%" stopColor="#9ca3af" />
      </linearGradient>
      <linearGradient id="glass-dome" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.4" />
        <stop offset="70%" stopColor="#0f172a" stopOpacity="0.75" />
        <stop offset="100%" stopColor="#020617" stopOpacity="0.9" />
      </linearGradient>
      <linearGradient id="inner-cam" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#374151" />
        <stop offset="100%" stopColor="#111827" />
      </linearGradient>
    </defs>

    {/* Ceiling Flat Ring Platter */}
    <ellipse
      cx="100"
      cy="45"
      rx="75"
      ry="18"
      fill="url(#ceiling-ring)"
      stroke="#e5e7eb"
      strokeWidth="1"
    />
    <ellipse
      cx="100"
      cy="51"
      rx="65"
      ry="14"
      fill="#9ca3af"
      opacity="0.3"
    />

    {/* Inner Rotating Camera Unit */}
    <g
      className={isHovered ? "transition-all duration-700" : ""}
      style={{
        transform: isHovered ? "rotate(15deg) translateY(2px)" : "none",
        transformOrigin: "100px 45px",
      }}
    >
      {/* Inner Camera Housing */}
      <path
        d="M60 45 C60 100, 140 100, 140 45 Z"
        fill="url(#inner-cam)"
      />
      
      {/* Lens Ring */}
      <circle
        cx="100"
        cy="78"
        r="16"
        fill="#030712"
        stroke="#4b5563"
        strokeWidth="2"
      />

      {/* Lens Glass */}
      <circle
        cx="100"
        cy="78"
        r="10"
        fill="url(#lens-glass)"
      />
      <circle cx="97" cy="75" r="3.5" fill="#fff" opacity="0.6" />

      {/* Blinking Warning LED */}
      <circle
        cx="100"
        cy="58"
        r="2"
        fill="#ff0000"
        className="animate-pulse"
      />
    </g>

    {/* Outer Semi-Spherical Dark Glass Dome Cover */}
    <path
      d="M32 45 C32 135, 168 135, 168 45 Z"
      fill="url(#glass-dome)"
      stroke="#4b5563"
      strokeWidth="1.5"
      opacity="0.9"
    />

    {/* Glass Reflection Curves */}
    <path
      d="M48 65 C70 120, 130 120, 152 65"
      fill="none"
      stroke="#ffffff"
      strokeWidth="3.5"
      strokeLinecap="round"
      opacity="0.18"
    />
    <path
      d="M40 50 C45 80, 65 95, 75 98"
      fill="none"
      stroke="#ffffff"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.12"
    />

    {/* Glowing Scan Sector */}
    {isHovered && (
      <path
        d="M100 78 L50 170 C75 190, 125 190, 150 170 Z"
        fill="rgba(255, 171, 0, 0.05)"
        stroke="rgba(255, 171, 0, 0.15)"
        strokeWidth="1"
        strokeDasharray="3,3"
      />
    )}
  </svg>
);

// Multi-lens circular platter panoramic 360 camera
const PanoramicCameraSVG = ({ isHovered }: { isHovered: boolean }) => (
  <svg
    viewBox="0 0 200 200"
    className="w-full h-full transition-all duration-700 ease-out"
    style={{
      transform: isHovered
        ? "translateZ(30px) rotateY(-10deg) rotateX(10deg)"
        : "translateZ(0) rotateY(0) rotateX(0)",
      filter: isHovered
        ? "drop-shadow(0 20px 25px rgba(117, 104, 216, 0.15))"
        : "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.05))",
    }}
  >
    <defs>
      <linearGradient id="platter-base" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="60%" stopColor="#e5e7eb" />
        <stop offset="100%" stopColor="#9ca3af" />
      </linearGradient>
      <linearGradient id="platter-dark" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#1e293b" />
        <stop offset="100%" stopColor="#0f172a" />
      </linearGradient>
      <radialGradient id="platter-glass" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.85" />
        <stop offset="80%" stopColor="#1d4ed8" stopOpacity="0.95" />
        <stop offset="100%" stopColor="#0f172a" />
      </radialGradient>
    </defs>

    {/* Ceiling Mount Platter Base Disc */}
    <ellipse
      cx="100"
      cy="70"
      rx="75"
      ry="25"
      fill="url(#platter-base)"
      stroke="#d1d5db"
      strokeWidth="1.5"
    />
    
    {/* Base Shadow/Extrusion */}
    <path
      d="M25 70 C25 95, 175 95, 175 70 V78 C175 103, 25 103, 25 78 Z"
      fill="#9ca3af"
      stroke="#78716c"
      strokeWidth="0.5"
    />

    {/* Upper Inner Disk Plate */}
    <ellipse
      cx="100"
      cy="73"
      rx="60"
      ry="18"
      fill="url(#platter-dark)"
    />

    {/* Center High-end Glass Dome Core */}
    <ellipse
      cx="100"
      cy="74"
      rx="32"
      ry="12"
      fill="url(#platter-glass)"
      stroke="#3b82f6"
      strokeWidth="1"
    />
    <ellipse
      cx="98"
      cy="71"
      rx="12"
      ry="4"
      fill="#fff"
      opacity="0.35"
    />

    {/* Rotating Multi-lens Array */}
    <g
      className={isHovered ? "transition-all duration-[8000ms] linear infinite" : ""}
      style={{
        transform: isHovered ? "rotate(360deg)" : "none",
        transformOrigin: "100px 73px",
      }}
    >
      {/* Lens 1 (Front / Bottom) */}
      <circle cx="100" cy="85" r="7" fill="#030712" stroke="#4b5563" strokeWidth="1" />
      <circle cx="100" cy="85" r="4" fill="url(#lens-glass)" />
      
      {/* Lens 2 (Left) */}
      <circle cx="55" cy="73" r="6" fill="#030712" stroke="#4b5563" strokeWidth="1" />
      <circle cx="55" cy="73" r="3.5" fill="url(#lens-glass)" />

      {/* Lens 3 (Right) */}
      <circle cx="145" cy="73" r="6" fill="#030712" stroke="#4b5563" strokeWidth="1" />
      <circle cx="145" cy="73" r="3.5" fill="url(#lens-glass)" />

      {/* Lens 4 (Back / Top) */}
      <circle cx="100" cy="61" r="5" fill="#030712" stroke="#4b5563" strokeWidth="1" />
      <circle cx="100" cy="61" r="3" fill="url(#lens-glass)" />
    </g>

    {/* Status Ring Blinking LEDs */}
    <circle cx="75" cy="68" r="1.5" fill="#00C853" className="animate-pulse" />
    <circle cx="125" cy="68" r="1.5" fill="#00C853" className="animate-pulse" />

    {/* Radial Scanning Radar Pulse */}
    {isHovered && (
      <ellipse
        cx="100"
        cy="74"
        rx="85"
        ry="30"
        fill="none"
        stroke="#7568d8"
        strokeWidth="1"
        strokeDasharray="4,4"
        className="animate-pulse"
      />
    )}
  </svg>
);

// ==========================================
// 2. Main Client Component Definition
// ==========================================

export default function DirectoryClient() {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  // Configuration matrix mapping cameras to systems and pages
  const cameraCards = [
    {
      id: 1,
      name: "الكاميرا الخارجية (Bullet)",
      type: "Bullet",
      title: "تلقيم واستيراد البيانات",
      path: "/imports",
      subtitle: "Ingestion Core",
      description: "نظام سحب البيانات ومعالجة روابط المراقبة والتحقق من سلامة الأكواد والتلقيم الفوري لقاعدة البيانات.",
      statusText: "نشط ومتصل",
      statusColor: "text-[#2383E2]",
      statusBg: "bg-[#2383E2]/10",
      statusBorder: "border-[#2383E2]/20",
      metrics: [
        { label: "كاشطات نشطة", value: "3 مشغلات" },
        { label: "معدل التدفق", value: "98.5%" },
      ],
      icon: Database,
      svgComponent: (isHovered: boolean) => <BulletCameraSVG isHovered={isHovered} />,
      accentColor: "#2383E2"
    },
    {
      id: 2,
      name: "الكاميرا المتحركة (PTZ)",
      type: "PTZ",
      title: "منصة التشغيل والتحكم",
      path: "/ops",
      subtitle: "Operations & Health",
      description: "غرفة العمليات المركزية لمراقبة البنية التحتية، صحة خادم Supabase، معدل استهلاك الذاكرة وحالة الاتصال.",
      statusText: "مستقر تماماً",
      statusColor: "text-[#00C853]",
      statusBg: "bg-[#00C853]/10",
      statusBorder: "border-[#00C853]/20",
      metrics: [
        { label: "سرعة الاتصال", value: "48ms" },
        { label: "حالة النظام", value: "سليم" },
      ],
      icon: Cpu,
      svgComponent: (isHovered: boolean) => <PTZCameraSVG isHovered={isHovered} />,
      accentColor: "#00C853"
    },
    {
      id: 3,
      name: "كاميرا القبة (Dome)",
      type: "Dome",
      title: "التغذية والتدقيق التحريري",
      path: "/feed",
      subtitle: "Live Feed Review",
      description: "متابعة المواد الواردة حياً وتدقيق التغريدات والأخبار ومراجعة صحة تصنيف المحتوى.",
      statusText: "معلق بالمراجعة",
      statusColor: "text-[#FFAB00]",
      statusBg: "bg-[#FFAB00]/10",
      statusBorder: "border-[#FFAB00]/20",
      metrics: [
        { label: "بانتظار المراجعة", value: "12 مادة" },
        { label: "جاهزة للنشر", value: "88 مادة" },
      ],
      icon: Inbox,
      svgComponent: (isHovered: boolean) => <DomeCameraSVG isHovered={isHovered} />,
      accentColor: "#FFAB00"
    },
    {
      id: 4,
      name: "الكاميرا البانورامية (Panoramic)",
      type: "Panoramic",
      title: "التقرير التنفيذي الفاخر",
      path: "/client-report",
      subtitle: "Executive Intelligence",
      description: "استعراض التقرير الموجه لرئاسة الحرمين الشريفين، إحصائيات تصنيف المحتوى، خريطة الأيام التفاعلية وتوليد PDF المعتمد.",
      statusText: "جاهز للتصدير",
      statusColor: "text-[#7568d8]",
      statusBg: "bg-[#7568d8]/10",
      statusBorder: "border-[#7568d8]/20",
      metrics: [
        { label: "مواد معتمدة", value: "124 مادة" },
        { label: "تاريخ التصدير", value: "تحديث فوري" },
      ],
      icon: FileText,
      svgComponent: (isHovered: boolean) => <PanoramicCameraSVG isHovered={isHovered} />,
      accentColor: "#7568d8"
    }
  ];

  return (
    <AppShell>
      {/* 1. Futuristic Header Section */}
      <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-white/90 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] font-bold">
              <span>غرفة الرصد الإعلامي</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#00C853] animate-pulse" />
              <span className="text-[#00C853]">بث العمليات حي</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--color-text-title)] md:text-3xl flex items-center gap-2.5">
              <span>غرفة التحكم البصري</span>
              <span className="text-xs font-semibold text-[#2383E2] bg-[#2383E2]/5 border border-[#2383E2]/15 px-3 py-1 rounded-full flex items-center gap-1.5">
                <Video size={12} className="animate-pulse" />
                <span>دليل الكاميرات ثلاثي الأبعاد</span>
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-4 text-xs font-bold text-[var(--color-text-body)] hover:bg-[var(--color-bg-hover)] transition"
              href="/"
            >
              <ArrowLeft size={16} />
              <span>البوابة الرئيسية</span>
            </Link>
            <div className="text-xs font-semibold text-stone-500 bg-stone-100 border border-stone-200/60 px-3 py-2 rounded-xl flex items-center gap-2">
              <RefreshCw size={12} className="animate-spin text-stone-400" />
              <span>آخر إشارة: منذ ثوانٍ</span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Visual Surveillance Grid */}
      <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full flex flex-col justify-center">
        
        {/* Banner Explainer */}
        <div className="mb-8 rounded-2xl bg-white border border-[var(--color-border)] p-6 shadow-sm flex flex-col md:flex-row items-center gap-4 relative overflow-hidden select-none">
          <div className="absolute -right-16 -top-16 w-36 h-36 bg-[#2383E2]/5 rounded-full blur-3xl pointer-events-none" />
          <div className="w-12 h-12 rounded-xl bg-[#2383E2]/10 flex items-center justify-center text-[#2383E2] shrink-0">
            <Sparkles size={22} className="animate-pulse" />
          </div>
          <div className="text-right">
            <h2 className="text-sm font-bold text-[var(--color-text-title)] mb-1">الملاحة البصرية للأنظمة والعمليات</h2>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed font-semibold">
              مرحباً بك في لوحة الملاحة المتقدمة. تمثل كل كاميرا نظاماً تشغيلياً مستقلاً. مرر مؤشر الفأرة فوق أي كاميرا لتشغيل تغذية البث ثلاثية الأبعاد (3D View)، تصفح حالة التشغيل والبيانات الحية، ثم اضغط للدخول مباشرة للغرفة التشغيلية.
            </p>
          </div>
        </div>

        {/* The Asymmetric Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {cameraCards.map((card) => {
            const Icon = card.icon;
            const isHovered = hoveredCard === card.id;

            return (
              <div
                key={card.id}
                onMouseEnter={() => setHoveredCard(card.id)}
                onMouseLeave={() => setHoveredCard(null)}
                className="relative bg-white rounded-[2.5rem] border border-[var(--color-border)] p-8 shadow-sm hover:shadow-premium transition-all duration-500 flex flex-col justify-between overflow-hidden cursor-pointer group hover:border-[#2383E2]/40"
                style={{
                  transform: isHovered
                    ? "perspective(1000px) rotateY(-8deg) rotateX(4deg) translateY(-4px)"
                    : "perspective(1000px) rotateY(0deg) rotateX(0deg) translateY(0)",
                }}
              >
                {/* Visual Glassmorphic Grid Background inside card */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:16px_16px]" />
                
                {/* Radial Gradient Glow on Hover */}
                <div
                  className="absolute -top-32 -left-32 w-64 h-64 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle, ${card.accentColor}15 0%, transparent 70%)`
                  }}
                />

                {/* Card Header Info */}
                <div className="flex items-start justify-between mb-6 relative z-10 select-none">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200/50 flex items-center justify-center text-stone-600 group-hover:bg-[#2383E2]/10 group-hover:text-[#2383E2] transition-colors duration-300">
                      <Icon size={18} />
                    </div>
                    <div className="text-right">
                      <h3 className="text-sm font-extrabold text-[var(--color-text-title)]">{card.title}</h3>
                      <p className="text-[10px] text-[var(--color-text-muted)] font-semibold mt-0.5">{card.subtitle}</p>
                    </div>
                  </div>
                  
                  {/* Status Pill */}
                  <span className={`text-[10px] font-extrabold px-3 py-1 rounded-full border ${card.statusBg} ${card.statusColor} ${card.statusBorder} flex items-center gap-1.5`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    <span>{card.statusText}</span>
                  </span>
                </div>

                {/* Camera Graphic & Details Toggle Shell */}
                <div className="relative h-60 w-full flex items-center justify-center mb-6">
                  {/* Camera SVG Visual Wrapper */}
                  <div
                    className={`w-48 h-48 transition-all duration-500 flex items-center justify-center ${
                      isHovered ? "opacity-20 scale-95 blur-xs" : "opacity-100 scale-100"
                    }`}
                  >
                    {card.svgComponent(isHovered)}
                  </div>

                  {/* Rich Slide-up Tooltip Detail Overlay */}
                  <div
                    className={`absolute inset-0 flex flex-col justify-between p-2 text-right transition-all duration-500 ${
                      isHovered
                        ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                        : "opacity-0 translate-y-4 scale-95 pointer-events-none"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs font-extrabold text-[#2383E2] mb-2">
                        <Activity size={12} className="animate-pulse" />
                        <span>كاميرا نشطة - بث بيانات حي</span>
                      </div>
                      <h4 className="text-sm font-extrabold text-[var(--color-text-title)] mb-2 select-none">
                        {card.name}
                      </h4>
                      <p className="text-xs leading-relaxed text-[var(--color-text-muted)] font-medium">
                        {card.description}
                      </p>
                    </div>

                    {/* Real-time Sub-metrics Inside Tooltip */}
                    <div className="grid grid-cols-2 gap-3 mt-4 select-none">
                      {card.metrics.map((metric) => (
                        <div
                          key={metric.label}
                          className="bg-stone-50 border border-stone-200/50 p-2.5 rounded-xl text-right flex flex-col justify-between"
                        >
                          <span className="text-[9px] text-[var(--color-text-muted)] font-bold">{metric.label}</span>
                          <span className="text-xs font-extrabold text-[var(--color-text-title)] mt-1">{metric.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Action Link */}
                <Link
                  href={card.path}
                  className="relative z-10 w-full h-11 rounded-2xl bg-stone-900 group-hover:bg-[#2383E2] text-white flex items-center justify-center gap-2 text-xs font-bold shadow-md hover:shadow-lg transition-all duration-300 select-none"
                >
                  <span>دخول غرفة التشغيل</span>
                  <ArrowLeft size={14} className="group-hover:-translate-x-1.5 transition-transform" />
                </Link>
              </div>
            );
          })}
        </div>

        {/* Bottom Security Banner */}
        <div className="mt-12 border-t border-[var(--color-border)] pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-[10px] font-bold text-[var(--color-text-muted)] select-none">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-[#00C853]" />
            <span>نظام المراقبة البصرية مؤمن بالكامل برمجياً عبر Supabase RLS</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-stone-100 border border-stone-200/60 px-2 py-0.5 rounded text-stone-500">ترميز البث: H.265 AES</span>
            <span>نظام التشغيل: 1.0.4</span>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
