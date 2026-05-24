"use client";

import React, { useEffect, useState } from "react";
import {
  BellRing,
  CheckCheck,
  CircleDot,
  MapPinned,
  ShieldCheck,
  ShieldX,
  Sparkles,
} from "lucide-react";

type FeedStatus = "approved" | "rejected";

type FeedCard = {
  source: string;
  location: string;
  time: string;
  excerpt: string;
  status: FeedStatus;
  desktop: {
    top: string;
    left: string;
  };
  marker: {
    x: number;
    y: number;
  };
};

const feedCards: FeedCard[] = [
  {
    source: "إكس",
    location: "الرياض",
    time: "قبل دقيقة",
    excerpt: "منشور واضح ومباشر عن المبادرة، وتم اعتماده للتقرير.",
    status: "approved",
    desktop: { top: "7%", left: "3%" },
    marker: { x: 346, y: 195 },
  },
  {
    source: "خبر ويب",
    location: "جدة",
    time: "الآن",
    excerpt: "صياغة ناقصة ومصدرها غير كاف، وانرفضت من المراجعة.",
    status: "rejected",
    desktop: { top: "9%", left: "66%" },
    marker: { x: 226, y: 236 },
  },
  {
    source: "إكس",
    location: "الدمام",
    time: "قبل 3 دقائق",
    excerpt: "تفاعل ممتاز ومعلومة دقيقة، دخلت على المواد المعتمدة.",
    status: "approved",
    desktop: { top: "50%", left: "70%" },
    marker: { x: 404, y: 176 },
  },
  {
    source: "خبر ويب",
    location: "المدينة",
    time: "قبل 4 دقائق",
    excerpt: "المحتوى قريب من الموضوع، لكن بدون دليل كافي وتم رفضه.",
    status: "rejected",
    desktop: { top: "55%", left: "6%" },
    marker: { x: 253, y: 196 },
  },
  {
    source: "إكس",
    location: "أبها",
    time: "قبل 6 دقائق",
    excerpt: "منشور جيد ومناسب للسياق، واعتمد بعد المراجعة.",
    status: "approved",
    desktop: { top: "74%", left: "24%" },
    marker: { x: 269, y: 311 },
  },
];

const saudiOutline =
  "M203 78 248 53 292 68 332 62 383 91 430 112 470 155 468 201 506 236 484 280 498 327 457 351 405 387 347 383 308 364 261 380 228 350 188 339 163 297 126 269 130 226 114 182 135 151 136 116 165 98 177 81Z";

const workflowSteps = [
  "التنبيه يدخل أول بأول",
  "المحتوى يمر على المراجعة",
  "الأخضر يعتمد والأحمر ينرفض",
  "الجاهز يروح للتقرير النهائي",
];

function statusClasses(status: FeedStatus, isActive: boolean) {
  if (status === "approved") {
    return {
      chip: "border border-emerald-400/30 bg-emerald-400/12 text-emerald-200",
      glow: isActive ? "shadow-[0_22px_60px_rgba(16,185,129,0.24)]" : "shadow-[0_18px_42px_rgba(15,23,32,0.28)]",
      icon: "bg-emerald-400/14 text-emerald-200",
      ring: "ring-1 ring-emerald-400/30",
      label: "تم الاعتماد",
    };
  }

  return {
    chip: "border border-rose-400/30 bg-rose-400/12 text-rose-200",
    glow: isActive ? "shadow-[0_22px_60px_rgba(244,63,94,0.22)]" : "shadow-[0_18px_42px_rgba(15,23,32,0.28)]",
    icon: "bg-rose-400/14 text-rose-200",
    ring: "ring-1 ring-rose-400/25",
    label: "تم الرفض",
  };
}

export default function AnimatedWorkflowHero() {
  const [activeCard, setActiveCard] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveCard((current) => (current + 1) % feedCards.length);
    }, 2200);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="relative overflow-hidden rounded-[32px] border border-[#d7e6d9] bg-[#0f1a18] p-4 md:p-6 lg:p-7 shadow-[0_30px_90px_rgba(15,23,32,0.16)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#1e4d40_0%,rgba(15,26,24,0)_42%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.03),transparent_38%,rgba(0,0,0,0.18))]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:34px_34px]" />

      <div className="relative z-10">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-[#bde7ca]">
              <BellRing size={14} />
              الرصد شغال لحظة بلحظة
            </span>

            <h2 className="mt-4 text-2xl font-bold tracking-tight text-white md:text-4xl">
              خريطة الرصد على مستوى السعودية
            </h2>

            <p className="mt-3 max-w-xl text-sm leading-7 text-[#c8d4ce] md:text-base">
              التنبيهات تطلع حول الخريطة بشكل يشبه المنشورات، وبعد المراجعة يبان مباشرة وش اللي
              تم اعتماده وش اللي تم رفضه.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:w-[320px]">
            <div className="rounded-[22px] border border-emerald-400/20 bg-emerald-400/10 p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-emerald-200">
                <ShieldCheck size={16} />
                <span className="text-xs font-semibold">اعتمادات اليوم</span>
              </div>
              <p className="mt-3 text-2xl font-bold text-white">128</p>
              <p className="mt-1 text-xs text-emerald-100/80">مواد جاهزة للدخول في التقرير</p>
            </div>

            <div className="rounded-[22px] border border-rose-400/20 bg-rose-400/10 p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-rose-200">
                <ShieldX size={16} />
                <span className="text-xs font-semibold">رفض المراجعة</span>
              </div>
              <p className="mt-3 text-2xl font-bold text-white">14</p>
              <p className="mt-1 text-xs text-rose-100/80">مواد انرفضت لضعف الصلة أو المصدر</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(29,78,216,0.12),rgba(15,26,24,0)_38%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] min-h-[560px]">
            <div className="absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
            <div className="absolute left-1/2 top-1/2 h-[330px] w-[330px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/12" />
            <div className="absolute left-1/2 top-1/2 h-[240px] w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/8" />

            <div className="absolute inset-0 hidden lg:block">
              {feedCards.map((item, index) => {
                const tone = statusClasses(item.status, activeCard === index);
                const StatusIcon = item.status === "approved" ? CheckCheck : ShieldX;

                return (
                  <article
                    key={`${item.source}-${item.location}`}
                    className={`absolute w-[240px] rounded-[24px] border border-white/10 bg-[#101b19]/88 p-4 text-right text-white backdrop-blur-xl transition-all duration-500 ${tone.glow} ${
                      activeCard === index ? "scale-[1.03] border-white/18" : "scale-100 opacity-85"
                    }`}
                    style={{
                      top: item.desktop.top,
                      left: item.desktop.left,
                      animation: `floatCard 7s ease-in-out ${index * 0.6}s infinite`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-left">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.chip}`}
                        >
                          <StatusIcon size={12} />
                          {tone.label}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-end gap-2">
                          <div className="text-right">
                            <p className="text-sm font-semibold leading-5">{item.location}</p>
                            <p className="text-[11px] text-[#9fb0a7]">{item.time}</p>
                          </div>
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tone.icon} ${tone.ring}`}
                          >
                            <BellRing size={16} />
                          </div>
                        </div>

                        <div className="mt-3 rounded-[18px] border border-white/6 bg-white/[0.03] p-3">
                          <div className="mb-2 flex items-center justify-between text-[11px] text-[#8fa39a]">
                            <span>{item.source}</span>
                            <span>تنبيه جديد</span>
                          </div>
                          <p className="text-sm leading-6 text-[#edf4ef]">{item.excerpt}</p>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="relative flex min-h-[560px] items-center justify-center px-4 py-8">
              <svg
                viewBox="0 0 640 420"
                className="w-full max-w-[640px] overflow-visible"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="saudiFill" x1="0%" x2="100%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#4ade80" stopOpacity="0.95" />
                    <stop offset="50%" stopColor="#22c55e" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#0f766e" stopOpacity="0.8" />
                  </linearGradient>
                  <radialGradient id="mapGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#86efac" stopOpacity="0.65" />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                  </radialGradient>
                </defs>

                <circle cx="320" cy="210" r="172" fill="url(#mapGlow)" opacity="0.42" />

                <path
                  d={saudiOutline}
                  fill="url(#saudiFill)"
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth="3.5"
                  strokeLinejoin="round"
                />

                <path
                  d={saudiOutline}
                  fill="none"
                  stroke="rgba(255,255,255,0.16)"
                  strokeWidth="16"
                  strokeLinejoin="round"
                />

                {feedCards.map((item, index) => {
                  const isActive = activeCard === index;
                  const approved = item.status === "approved";

                  return (
                    <g key={`marker-${item.location}`}>
                      <circle
                        cx={item.marker.x}
                        cy={item.marker.y}
                        r={isActive ? 20 : 13}
                        fill={approved ? "rgba(16,185,129,0.16)" : "rgba(244,63,94,0.15)"}
                        className={isActive ? "rasd-map-marker-pulse" : undefined}
                        style={{
                          animation: isActive ? "markerPulse 1.8s ease-out infinite" : undefined,
                        }}
                      />
                      <circle
                        cx={item.marker.x}
                        cy={item.marker.y}
                        r={6}
                        fill={approved ? "#86efac" : "#fda4af"}
                        stroke="rgba(255,255,255,0.9)"
                        strokeWidth="2"
                      />
                    </g>
                  );
                })}

                <g fill="#dff7e7" fontSize="12" fontWeight="600">
                  <text x="332" y="224">الرياض</text>
                  <text x="212" y="256">جدة</text>
                  <text x="418" y="173">الدمام</text>
                  <text x="236" y="189">المدينة</text>
                  <text x="252" y="337">أبها</text>
                </g>
              </svg>

              <div className="absolute left-1/2 top-1/2 w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-[26px] border border-white/12 bg-[#0f1715]/82 p-4 text-center text-white shadow-[0_18px_45px_rgba(0,0,0,0.24)] backdrop-blur-xl">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/12 text-emerald-200 ring-1 ring-emerald-400/25">
                  <MapPinned size={26} />
                </div>
                <p className="mt-3 text-sm font-semibold text-[#d9e7de]">السعودية</p>
                <p className="mt-1 text-xl font-bold">الرصد شغال الآن</p>
                <p className="mt-2 text-xs leading-6 text-[#9db0a7]">
                  الإشعارات توصل، والفريق يفرزها مباشرة بين اعتماد ورفض.
                </p>
              </div>
            </div>

            <div className="absolute inset-x-4 bottom-4 grid gap-3 lg:hidden">
              {feedCards.slice(0, 3).map((item, index) => {
                const tone = statusClasses(item.status, activeCard === index);
                const StatusIcon = item.status === "approved" ? CheckCheck : ShieldX;

                return (
                  <article
                    key={`mobile-${item.location}`}
                    className={`rounded-[22px] border border-white/10 bg-[#101b19]/90 p-4 text-right text-white backdrop-blur ${tone.glow}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.chip}`}
                      >
                        <StatusIcon size={12} />
                        {tone.label}
                      </span>

                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-sm font-semibold">{item.location}</p>
                          <p className="text-[11px] text-[#9fb0a7]">{item.time}</p>
                        </div>
                        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tone.icon}`}>
                          <BellRing size={16} />
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-[#edf4ef]">{item.excerpt}</p>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-[26px] border border-white/8 bg-white/5 p-5 text-white backdrop-blur">
              <div className="flex items-center gap-2 text-[#bde7ca]">
                <Sparkles size={16} />
                <span className="text-sm font-semibold">وش اللي يصير هنا؟</span>
              </div>
              <p className="mt-3 text-sm leading-7 text-[#d5e1da]">
                الصفحة تعطي إحساس حي للرصد. كل تنبيه يطلع كأنه منشور مصغر، وبعدها يوضح قرار
                المراجعة بشكل سريع وواضح.
              </p>
            </div>

            <div className="rounded-[26px] border border-white/8 bg-white/5 p-5 text-white backdrop-blur">
              <div className="flex items-center gap-2 text-[#bde7ca]">
                <CircleDot size={16} />
                <span className="text-sm font-semibold">مسار الشغلة</span>
              </div>

              <div className="mt-4 space-y-3">
                {workflowSteps.map((step, index) => (
                  <div
                    key={step}
                    className="flex items-center justify-between rounded-2xl border border-white/6 bg-black/10 px-4 py-3"
                  >
                    <span className="text-sm text-[#edf4ef]">{step}</span>
                    <span className="text-[11px] font-semibold text-[#88cfa4]">0{index + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] border border-white/8 bg-white/5 p-5 text-white backdrop-blur">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                  <p className="text-sm font-semibold text-emerald-100">أخضر</p>
                  <p className="mt-1 text-xs leading-6 text-emerald-50/80">
                    المادة مناسبة، موثقة، وجاهزة تدخل في التقرير.
                  </p>
                </div>
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4">
                  <p className="text-sm font-semibold text-rose-100">أحمر</p>
                  <p className="mt-1 text-xs leading-6 text-rose-50/80">
                    المادة انرفضت لضعف المصدر، الصلة، أو الدليل.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes floatCard {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-12px);
          }
        }

        @keyframes markerPulse {
          0% {
            transform: scale(0.85);
            opacity: 0.8;
          }
          70% {
            transform: scale(1.2);
            opacity: 0;
          }
          100% {
            transform: scale(1.2);
            opacity: 0;
          }
        }

        .rasd-map-marker-pulse {
          transform-box: fill-box;
          transform-origin: center;
        }
      `}</style>
    </section>
  );
}
