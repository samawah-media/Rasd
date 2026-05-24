"use client";

import React, { useEffect, useState } from "react";

type SocialPlatform = "x" | "tiktok" | "youtube";

type SocialNotification = {
  platform: SocialPlatform;
  account: string;
  text: string;
  card: {
    top: string;
    left: string;
  };
  marker: {
    x: number;
    y: number;
  };
};

const notifications: SocialNotification[] = [
  {
    platform: "x",
    account: "PRAGOVSA",
    text: "إطلاق هاكاثون هداية ثون",
    card: { top: "12%", left: "7%" },
    marker: { x: 346, y: 195 },
  },
  {
    platform: "x",
    account: "KNews2030_KSA",
    text: "تحالف تقني لخدمة الحرمين",
    card: { top: "14%", left: "65%" },
    marker: { x: 306, y: 176 },
  },
  {
    platform: "tiktok",
    account: "a27mkh",
    text: "تغطية فيديو من التدشين",
    card: { top: "58%", left: "70%" },
    marker: { x: 226, y: 236 },
  },
  {
    platform: "youtube",
    account: "ISLAMICVOICE-am",
    text: "مقطع من حفل هداية",
    card: { top: "66%", left: "11%" },
    marker: { x: 253, y: 196 },
  },
  {
    platform: "tiktok",
    account: "mr.u191",
    text: "تغطية فيديو مختصرة",
    card: { top: "38%", left: "4%" },
    marker: { x: 269, y: 311 },
  },
];

const saudiOutline =
  "M203 78 248 53 292 68 332 62 383 91 430 112 470 155 468 201 506 236 484 280 498 327 457 351 405 387 347 383 308 364 261 380 228 350 188 339 163 297 126 269 130 226 114 182 135 151 136 116 165 98 177 81Z";

const platformMeta: Record<
  SocialPlatform,
  {
    label: string;
    badge: string;
    dot: string;
    pulse: string;
    mark: string;
    markClassName: string;
  }
> = {
  x: {
    label: "X",
    badge: "bg-black text-white",
    dot: "#f8fafc",
    pulse: "rgba(248,250,252,0.18)",
    mark: "X",
    markClassName: "text-base font-black",
  },
  tiktok: {
    label: "TikTok",
    badge: "bg-[#111827] text-[#67e8f9]",
    dot: "#67e8f9",
    pulse: "rgba(103,232,249,0.2)",
    mark: "♪",
    markClassName: "text-xl font-black leading-none",
  },
  youtube: {
    label: "YouTube",
    badge: "bg-[#ef4444] text-white",
    dot: "#f87171",
    pulse: "rgba(248,113,113,0.2)",
    mark: "play",
    markClassName: "",
  },
};

export default function AnimatedWorkflowHero() {
  const [activeNotice, setActiveNotice] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveNotice((current) => (current + 1) % notifications.length);
    }, 2100);

    return () => window.clearInterval(interval);
  }, []);

  const activeNotification = notifications[activeNotice];
  const activeMeta = platformMeta[activeNotification.platform];

  return (
    <section className="relative min-h-[430px] overflow-hidden rounded-lg border border-[#d8e4db] bg-[#101d19] p-4 shadow-sm">
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:34px_34px]" />

      <div className="relative flex min-h-[398px] items-center justify-center">
        <svg
          viewBox="0 0 640 420"
          className="w-full max-w-[640px] overflow-visible"
          aria-label="خريطة السعودية للرصد"
          role="img"
        >
          <defs>
            <linearGradient id="saudiMapFill" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#7ddf9a" />
              <stop offset="100%" stopColor="#1f8a63" />
            </linearGradient>
          </defs>

          <path
            d={saudiOutline}
            fill="url(#saudiMapFill)"
            stroke="rgba(255,255,255,0.68)"
            strokeLinejoin="round"
            strokeWidth="3"
          />

          <path
            d={saudiOutline}
            fill="none"
            stroke="rgba(255,255,255,0.13)"
            strokeLinejoin="round"
            strokeWidth="18"
          />

          {notifications.map((notice, index) => {
            const active = activeNotice === index;
            const meta = platformMeta[notice.platform];

            return (
              <g key={`${notice.platform}-${notice.account}`}>
                <circle
                  cx={notice.marker.x}
                  cy={notice.marker.y}
                  r={active ? 24 : 9}
                  fill={meta.pulse}
                  className={active ? "rasd-map-marker-pulse" : undefined}
                  style={{ animation: active ? "markerPulse 1.8s ease-out infinite" : undefined }}
                />
                <circle
                  cx={notice.marker.x}
                  cy={notice.marker.y}
                  r={active ? 6 : 4}
                  fill={meta.dot}
                  opacity={active ? 1 : 0.38}
                  stroke="white"
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </svg>

        <div className="absolute inset-0 hidden md:block">
          {notifications.map((notice, index) => {
            const active = activeNotice === index;
            const meta = platformMeta[notice.platform];

            return (
              <article
                key={`${notice.account}-notification`}
                className={`absolute w-[236px] rounded-lg border border-white/70 bg-white/95 px-3 py-3 text-right text-[#17231f] shadow-[0_14px_34px_rgba(15,23,32,0.16)] backdrop-blur transition-all duration-700 ${
                  active
                    ? "translate-y-0 scale-100 opacity-100"
                    : "pointer-events-none translate-y-4 scale-[0.92] opacity-0"
                }`}
                style={{
                  top: notice.card.top,
                  left: notice.card.left,
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.badge}`}
                    aria-label={meta.label}
                  >
                    {notice.platform === "youtube" ? (
                      <span className="block h-0 w-0 border-y-[5px] border-l-[9px] border-y-transparent border-l-white" />
                    ) : (
                      <span className={meta.markClassName}>{meta.mark}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold">@{notice.account}</p>
                      <span className="shrink-0 text-[10px] font-semibold text-[#6a7b73]">الآن</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-[#53665d]">{notice.text}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <article className="absolute bottom-3 left-3 right-3 rounded-lg border border-white/70 bg-white/95 px-3 py-3 text-right text-[#17231f] shadow-[0_14px_34px_rgba(15,23,32,0.16)] md:hidden">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${activeMeta.badge}`}
              aria-label={activeMeta.label}
            >
              {activeNotification.platform === "youtube" ? (
                <span className="block h-0 w-0 border-y-[5px] border-l-[9px] border-y-transparent border-l-white" />
              ) : (
                <span className={activeMeta.markClassName}>{activeMeta.mark}</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-bold">@{activeNotification.account}</p>
                <span className="shrink-0 text-[10px] font-semibold text-[#6a7b73]">الآن</span>
              </div>
              <p className="mt-1 truncate text-sm text-[#53665d]">{activeNotification.text}</p>
            </div>
          </div>
        </article>
      </div>

      <style jsx global>{`
        @keyframes markerPulse {
          0% {
            transform: scale(0.85);
            opacity: 0.85;
          }
          70% {
            transform: scale(1.22);
            opacity: 0;
          }
          100% {
            transform: scale(1.22);
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
