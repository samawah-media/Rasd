"use client";

import { Globe } from "lucide-react";

export type BrandName = "tiktok" | "instagram" | "x" | "news" | "apify" | "supabase" | "vercel" | "ytdlp";

const sizeClass = {
  sm: "h-5 w-5 rounded-md",
  md: "h-10 w-10 rounded-lg",
  lg: "h-12 w-12 rounded-lg",
} as const;

export function brandFromLabel(label: string): BrandName {
  const value = label.toLowerCase();
  if (value.includes("tiktok") || value.includes("تيك") || value === "♪" || value === "ytdlp") return "tiktok";
  if (value.includes("instagram") || value.includes("انست")) return "instagram";
  if (value === "x" || value.includes("grok")) return "x";
  if (value.includes("apify") || value === "a") return "apify";
  if (value.includes("supabase") || value === "s") return "supabase";
  if (value.includes("vercel") || value === "▲") return "vercel";
  return "news";
}

export function BrandIcon({ brand, size = "md", className = "" }: { brand: BrandName; size?: keyof typeof sizeClass; className?: string }) {
  const base = `${sizeClass[size]} inline-flex shrink-0 items-center justify-center shadow-sm ${className}`;

  if (brand === "instagram") {
    return (
      <span
        className={`${base} text-white`}
        style={{
          background:
            "radial-gradient(circle at 30% 110%, #feda75 0 24%, #fa7e1e 34%, #d62976 55%, #962fbf 75%, #4f5bd5 100%)",
        }}
        aria-label="Instagram"
      >
        <svg viewBox="0 0 32 32" className="h-[72%] w-[72%]" aria-hidden="true">
          <rect x="7" y="7" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2.6" />
          <circle cx="16" cy="16" r="4.6" fill="none" stroke="currentColor" strokeWidth="2.6" />
          <circle cx="22" cy="10.5" r="1.6" fill="currentColor" />
        </svg>
      </span>
    );
  }

  if (brand === "tiktok") {
    return (
      <span className={`${base} bg-black`} aria-label="TikTok">
        <svg viewBox="0 0 40 40" className="h-[72%] w-[72%]" aria-hidden="true">
          <path
            d="M23.2 8.4v15.1c0 5-3.2 8.1-8 8.1-4.3 0-7.3-2.7-7.3-6.5 0-4 3.3-6.9 7.6-6.5.7.1 1.2.2 1.8.4v4.3c-.5-.3-1-.4-1.7-.4-1.7 0-2.9 1-2.9 2.4 0 1.3 1.1 2.3 2.7 2.3 1.8 0 3-1.2 3-3.3V8.4h4.8z"
            fill="#25F4EE"
            transform="translate(-1.7,1.5)"
          />
          <path
            d="M23.2 8.4c.7 4.1 3.4 6.8 7.6 7.2v4.6c-2.8-.1-5.2-1-7.6-2.8v6.1c0 5-3.2 8.1-8 8.1-4.3 0-7.3-2.7-7.3-6.5"
            fill="none"
            stroke="#FE2C55"
            strokeWidth="4.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform="translate(1.7,-.6)"
          />
          <path
            d="M23.2 8.4v15.1c0 5-3.2 8.1-8 8.1-4.3 0-7.3-2.7-7.3-6.5 0-4 3.3-6.9 7.6-6.5.7.1 1.2.2 1.8.4v4.3c-.5-.3-1-.4-1.7-.4-1.7 0-2.9 1-2.9 2.4 0 1.3 1.1 2.3 2.7 2.3 1.8 0 3-1.2 3-3.3V8.4h4.8c.7 4.1 3.4 6.8 7.6 7.2v4.6c-2.8-.1-5.2-1-7.6-2.8z"
            fill="#fff"
          />
        </svg>
      </span>
    );
  }

  if (brand === "x") {
    return (
      <span className={`${base} bg-black text-white`} aria-label="X">
        <svg viewBox="0 0 32 32" className="h-[62%] w-[62%]" aria-hidden="true">
          <path d="M8 7h4.9l11.2 18h-4.9z" fill="currentColor" />
          <path d="M23.5 7 8.6 25h-2l14.9-18z" fill="currentColor" />
        </svg>
      </span>
    );
  }

  if (brand === "apify") {
    return (
      <span className={`${base} bg-white`} aria-label="Apify">
        <svg viewBox="0 0 36 36" className="h-[78%] w-[78%]" aria-hidden="true">
          <path d="M7 28 14 6l6 5-5 17z" fill="#66c61c" />
          <path d="M15 28 22 8l7 6-5 14z" fill="#ff7a1a" />
          <path d="M23 28 30 13l2 15z" fill="#1f6feb" />
        </svg>
      </span>
    );
  }

  if (brand === "supabase") {
    return (
      <span className={`${base} bg-[#e8f5ef] text-[#19b979]`} aria-label="Supabase">
        <svg viewBox="0 0 32 32" className="h-[72%] w-[72%]" aria-hidden="true">
          <path d="M18.6 3.5 7.4 17.4c-.9 1.1-.1 2.8 1.3 2.8h8.2l-3.5 8.3c-.4 1 .9 1.8 1.6.9l10.9-14.2c.9-1.1.1-2.7-1.3-2.7h-8z" fill="currentColor" />
        </svg>
      </span>
    );
  }

  if (brand === "vercel") {
    return (
      <span className={`${base} bg-white text-black`} aria-label="Vercel">
        <svg viewBox="0 0 32 32" className="h-[70%] w-[70%]" aria-hidden="true">
          <path d="M16 5 30 27H2z" fill="currentColor" />
        </svg>
      </span>
    );
  }

  return (
    <span className={`${base} border border-[var(--color-border)] bg-white text-[var(--color-text-title)]`} aria-label="News">
      <Globe className="h-[62%] w-[62%]" />
    </span>
  );
}
