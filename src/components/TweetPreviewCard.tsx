import React, { useState } from "react";
import { 
  RefreshCw, 
  MessageCircle, 
  Repeat, 
  Heart, 
  BarChart2, 
  CheckCircle2, 
  ExternalLink, 
  AlertCircle,
  Globe 
} from "lucide-react";
import type { MonitoringItem } from "@/lib/types";

interface XPostResponse {
  authorName?: string;
  authorHandle?: string;
  isVerified?: boolean;
  authorProfileImageUrl?: string;
  likesCount?: number;
  repostsCount?: number;
  repliesCount?: number;
  viewsCount?: number;
  mediaUrls?: string[];
  language?: string;
}

interface TweetPreviewCardProps {
  item: MonitoringItem;
  onSyncSuccess?: (updatedItem: MonitoringItem) => void;
}

export default function TweetPreviewCard({ item, onSyncSuccess }: TweetPreviewCardProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [flashStats, setFlashStats] = useState(false);
  const [syncedItem, setSyncedItem] = useState<MonitoringItem | null>(null);

  // If the selected item changes, reset the locally synced item
  const displayedItem = (syncedItem && syncedItem.id === item.id) ? syncedItem : item;

  // Extract X post details from raw_response if available
  const raw = displayedItem.raw_response as { x_post?: XPostResponse; language?: string } | null;
  const xPost = raw?.x_post || null;

  // Use values from raw_response or fall back to standard item fields
  const authorName = xPost?.authorName || displayedItem.authorName || "كاتب التغريدة";
  const authorHandle = xPost?.authorHandle || displayedItem.authorHandle || "@x_user";
  const verified = xPost?.isVerified || false;
  const profileImage = xPost?.authorProfileImageUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(authorHandle)}`;
  
  const likes = typeof xPost?.likesCount === "number" ? xPost.likesCount : 0;
  const reposts = typeof xPost?.repostsCount === "number" ? xPost.repostsCount : 0;
  const replies = typeof xPost?.repliesCount === "number" ? xPost.repliesCount : 0;
  const views = typeof xPost?.viewsCount === "number" ? xPost.viewsCount : 0;
  const media = xPost?.mediaUrls || [];
  const language = xPost?.language || raw?.language || "ar";

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncError(null);

    try {
      const response = await fetch("/api/items/x-refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ itemId: displayedItem.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "failed_to_refresh");
      }

      if (data.item) {
        setSyncedItem(data.item);
        if (onSyncSuccess) {
          onSyncSuccess(data.item);
        }
        
        // Trigger glowing green stats flash animation
        setFlashStats(true);
        setTimeout(() => setFlashStats(false), 1500);
      }
    } catch (err) {
      console.error("[TweetPreviewCard] Refresh failed:", err);
      setSyncError(err instanceof Error ? err.message : "تعذر تحديث إحصائيات التغريدة حالياً");
    } finally {
      setIsSyncing(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
    return num.toLocaleString();
  };

  const formatPublishDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("ar-EG", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="w-full bg-[#0F1419] rounded-2xl border border-slate-800 text-white overflow-hidden shadow-2xl transition-all duration-300">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-900 bg-slate-950/40 select-none">
        <div className="flex items-center gap-2">
          {/* Glowing X Logo */}
          <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 shadow-[0_0_10px_rgba(255,255,255,0.05)]">
            <span className="font-bold text-sm tracking-tighter font-mono">X</span>
          </div>
          <span className="text-xs font-semibold text-slate-400 tracking-wider">معاينة محتوى X الحية</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Lang badge */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/40 text-[10px] text-slate-400 font-mono">
            <Globe size={10} />
            <span>{language.toUpperCase()}</span>
          </div>

          {/* Sync Button */}
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold select-none transition-all duration-300 border ${
              isSyncing
                ? "bg-slate-800/40 border-slate-700/30 text-slate-500 cursor-not-allowed"
                : "bg-white/5 hover:bg-white/10 border-white/10 text-white cursor-pointer active:scale-95 hover:border-emerald-500/20"
            }`}
            title="مزامنة الإحصائيات الحية"
          >
            <RefreshCw 
              size={12} 
              className={`${isSyncing ? "animate-spin text-emerald-400" : "text-slate-300"}`} 
            />
            <span>{isSyncing ? "مزامنة..." : "تحديث الإحصائيات"}</span>
          </button>
        </div>
      </div>

      {/* Main Tweet Body */}
      <div className="p-5">
        {/* Author details */}
        <div className="flex items-center justify-between gap-3 mb-4 select-none">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={profileImage} 
              alt={authorName} 
              className="w-11 h-11 rounded-full object-cover border border-slate-800 bg-slate-900 shadow-sm"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(authorHandle)}`;
              }}
            />
            <div className="leading-tight">
              <div className="flex items-center gap-1">
                <span className="font-bold text-sm tracking-tight text-white hover:underline cursor-pointer">
                  {authorName}
                </span>
                {verified && (
                  <CheckCircle2 size={14} className="fill-sky-500 text-[#0F1419]" />
                )}
              </div>
              <span className="text-xs text-slate-500 font-mono">{authorHandle}</span>
            </div>
          </div>

          <a 
            href={displayedItem.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center border border-white/5 text-slate-400 hover:text-white transition-colors duration-200"
            title="عرض الرابط الأصلي"
          >
            <ExternalLink size={13} />
          </a>
        </div>

        {/* Content text */}
        <p className="text-[15px] leading-relaxed text-slate-100 whitespace-pre-wrap font-sans mb-4 select-text selection:bg-sky-500/30">
          {displayedItem.summary || displayedItem.title}
        </p>

        {/* Media attachments */}
        {media.length > 0 && (
          <div className={`grid gap-2 mb-4 rounded-xl overflow-hidden border border-slate-900 select-none ${
            media.length === 1 ? "grid-cols-1" : "grid-cols-2"
          }`}>
            {media.map((url: string, index: number) => (
              <div key={index} className="aspect-video relative overflow-hidden group bg-slate-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={url} 
                  alt={`وسائط مرفقة ${index + 1}`} 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Publish Date */}
        <div className="text-xs text-slate-500 font-sans mb-4 border-b border-slate-900 pb-3.5 select-none">
          {formatPublishDate(displayedItem.publishedAt)}
        </div>

        {/* Engagement Stats block */}
        <div className={`grid grid-cols-4 gap-2 select-none py-2 px-3 rounded-xl transition-all duration-500 border ${
          flashStats 
            ? "bg-emerald-950/20 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.08)] scale-[1.01]" 
            : "bg-slate-950/25 border-slate-900"
        }`}>
          {/* Views */}
          <div className="flex flex-col items-center justify-center p-1">
            <div className="flex items-center gap-1.5 text-slate-500 mb-0.5">
              <BarChart2 size={13} />
              <span className="text-[10px] font-medium tracking-wide">المشاهدات</span>
            </div>
            <span className={`text-xs font-mono font-bold transition-colors duration-300 ${
              flashStats ? "text-emerald-400 font-extrabold" : "text-slate-200"
            }`}>
              {formatNumber(views)}
            </span>
          </div>

          {/* Replies */}
          <div className="flex flex-col items-center justify-center p-1">
            <div className="flex items-center gap-1.5 text-slate-500 mb-0.5">
              <MessageCircle size={13} />
              <span className="text-[10px] font-medium tracking-wide">الردود</span>
            </div>
            <span className={`text-xs font-mono font-bold transition-colors duration-300 ${
              flashStats ? "text-emerald-400 font-extrabold" : "text-slate-200"
            }`}>
              {formatNumber(replies)}
            </span>
          </div>

          {/* Reposts */}
          <div className="flex flex-col items-center justify-center p-1">
            <div className="flex items-center gap-1.5 text-slate-500 mb-0.5">
              <Repeat size={13} />
              <span className="text-[10px] font-medium tracking-wide">إعادة النشر</span>
            </div>
            <span className={`text-xs font-mono font-bold transition-colors duration-300 ${
              flashStats ? "text-emerald-400 font-extrabold" : "text-slate-200"
            }`}>
              {formatNumber(reposts)}
            </span>
          </div>

          {/* Likes */}
          <div className="flex flex-col items-center justify-center p-1">
            <div className="flex items-center gap-1.5 text-slate-500 mb-0.5">
              <Heart size={13} />
              <span className="text-[10px] font-medium tracking-wide">الإعجابات</span>
            </div>
            <span className={`text-xs font-mono font-bold transition-colors duration-300 ${
              flashStats ? "text-emerald-400 font-extrabold" : "text-slate-200"
            }`}>
              {formatNumber(likes)}
            </span>
          </div>
        </div>

        {/* Sync Error Alert */}
        {syncError && (
          <div className="mt-4 flex items-center gap-2 p-3 bg-red-950/20 border border-red-900/35 rounded-xl text-xs text-red-400 font-sans">
            <AlertCircle size={14} className="shrink-0" />
            <span>خطأ في المزامنة: {syncError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
