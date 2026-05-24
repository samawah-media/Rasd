"use client";

import React, { useEffect, useState } from "react";
import { BellRing, Check, X } from "lucide-react";

type FeedStatus = "approved" | "rejected";

type FeedPoint = {
  source: string;
  city: string;
  status: FeedStatus;
  card: {
    top: string;
    left: string;
  };
  marker: {
    x: number;
    y: number;
  };
};

const feedPoints: FeedPoint[] = [
  {
    source: "إكس",
    city: "الرياض",
    status: "approved",
    card: { top: "13%", left: "7%" },
    marker: { x: 346, y: 195 },
  },
  {
    source: "خبر",
    city: "جدة",
    status: "rejected",
    card: { top: "12%", left: "67%" },
    marker: { x: 226, y: 236 },
  },
  {
    source: "إكس",
    city: "الدمام",
    status: "approved",
    card: { top: "61%", left: "69%" },
    marker: { x: 404, y: 176 },
  },
  {
    source: "ويب",
    city: "المدينة",
    status: "rejected",
    card: { top: "64%", left: "10%" },
    marker: { x: 253, y: 196 },
  },
];

const saudiOutline =
  "M203 78 248 53 292 68 332 62 383 91 430 112 470 155 468 201 506 236 484 280 498 327 457 351 405 387 347 383 308 364 261 380 228 350 188 339 163 297 126 269 130 226 114 182 135 151 136 116 165 98 177 81Z";

function statusTone(status: FeedStatus, active: boolean) {
  if (status === "approved") {
    return {
      label: "معتمد",
      icon: Check,
      card: active
        ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-[0_14px_34px_rgba(16,185,129,0.18)]"
        : "border-emerald-200 bg-white/92 text-emerald-900",
      dot: "#4ade80",
      pulse: "rgba(16,185,129,0.18)",
    };
  }

  return {
    label: "مرفوض",
    icon: X,
    card: active
      ? "border-rose-300 bg-rose-50 text-rose-900 shadow-[0_14px_34px_rgba(244,63,94,0.16)]"
      : "border-rose-200 bg-white/92 text-rose-900",
    dot: "#fb7185",
    pulse: "rgba(244,63,94,0.16)",
  };
}

export default function AnimatedWorkflowHero() {
  const [activePoint, setActivePoint] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActivePoint((current) => (current + 1) % feedPoints.length);
    }, 2100);

    return () => window.clearInterval(interval);
  }, []);

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

          {feedPoints.map((point, index) => {
            const active = activePoint === index;
            const tone = statusTone(point.status, active);

            return (
              <g key={`${point.source}-${point.city}`}>
                <circle
                  cx={point.marker.x}
                  cy={point.marker.y}
                  r={active ? 22 : 12}
                  fill={tone.pulse}
                  className={active ? "rasd-map-marker-pulse" : undefined}
                  style={{ animation: active ? "markerPulse 1.8s ease-out infinite" : undefined }}
                />
                <circle
                  cx={point.marker.x}
                  cy={point.marker.y}
                  r={6}
                  fill={tone.dot}
                  stroke="white"
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </svg>

        <div className="absolute inset-0 hidden md:block">
          {feedPoints.map((point, index) => {
            const active = activePoint === index;
            const tone = statusTone(point.status, active);
            const StatusIcon = tone.icon;

            return (
              <article
                key={`${point.city}-card`}
                className={`absolute w-[164px] rounded-lg border px-3 py-2 text-right transition-all duration-500 ${
                  tone.card
                } ${active ? "scale-[1.03]" : "opacity-86"}`}
                style={{
                  top: point.card.top,
                  left: point.card.left,
                  animation: `floatAlert 7s ease-in-out ${index * 0.45}s infinite`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-bold">
                    <StatusIcon size={13} />
                    {tone.label}
                  </span>
                  <BellRing size={15} />
                </div>
                <p className="mt-1 text-sm font-semibold">
                  {point.source} · {point.city}
                </p>
              </article>
            );
          })}
        </div>

        <div className="absolute bottom-3 left-3 right-3 grid grid-cols-2 gap-2 md:hidden">
          {feedPoints.map((point, index) => {
            const tone = statusTone(point.status, activePoint === index);
            const StatusIcon = tone.icon;

            return (
              <div
                key={`${point.city}-mobile`}
                className={`rounded-lg border px-3 py-2 text-sm ${tone.card}`}
              >
                <div className="flex items-center justify-between">
                  <span>
                    {point.source} · {point.city}
                  </span>
                  <span className="inline-flex items-center gap-1 font-bold">
                    <StatusIcon size={13} />
                    {tone.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style jsx global>{`
        @keyframes floatAlert {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }

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
