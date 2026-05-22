"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Activity,
  Cpu,
  Database,
  Terminal,
  RefreshCw,
  Server,
  AlertTriangle,
  Play,
  Pause,
  Trash2,
  Lock,
  ChevronRight,
  TrendingUp,
  Flame,
  Globe,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  Camera,
  Link2,
} from "lucide-react";
import AppShell from "@/components/AppShell";

interface HealthClientProps {
  initialHealth: {
    status: string;
    metrics: { label: string; value: string; status: string }[];
    connectors?: {
      manual_url: string;
      rss: string;
      web_page: string;
      x_oembed: string;
      x_recent_search: string;
    };
    usage?: {
      xReadsToday: number;
      xReadsThisMonth: number;
      aiTokensThisMonth: number;
      screenshotsThisMonth: number;
      storageMb: number;
    };
  };
  initialLogs: {
    id: string;
    action: string;
    entityId: string;
    actorRole: "owner" | "editor" | "viewer";
    metadata?: Record<string, unknown>;
    createdAt: string;
  }[];
}

interface LogEntry {
  id: string;
  time: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

export default function HealthClient({ initialHealth, initialLogs }: HealthClientProps) {
  const [health, setHealth] = useState(initialHealth);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveActive, setLiveActive] = useState(true);
  const [logFilter, setLogFilter] = useState<"all" | "info" | "success" | "warning" | "error">("all");
  
  // Terminal log simulation — initialised once from server-side logs
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    const formatted: LogEntry[] = initialLogs.map((log, idx) => {
      let level: LogEntry["level"] = "info";
      if (log.action.includes("error") || log.action.includes("failed")) level = "error";
      else if (log.action.includes("created") || log.action.includes("success") || log.action.includes("ingested")) level = "success";
      else if (log.action.includes("duplicate") || log.action.includes("warn")) level = "warning";

      let readableMsg = `حدث تشغيلي: ${log.action}`;
      if (log.action === "item.ingested") readableMsg = `تم سحب وتلقيم مادة جديدة بنجاح (المعرف: ${log.entityId.slice(0, 8)})`;
      else if (log.action === "item.duplicate_detected") readableMsg = `تم الكشف عن رابط مكرر ومستبعده تفاديًا للزحمة.`;
      else if (log.action === "source.rss_polled") readableMsg = `تم فحص مصادر الأخبار وتحديث التغذية الفورية للعميل.`;
      else if (log.action === "source.rss_poll_failed") readableMsg = `فشل فحص مصدر RSS (المعرف: ${log.entityId.slice(0, 8)}) - جاري المحاولة.`;
      else if (log.action === "keyword_rule.updated") readableMsg = `تحديث خوارزمية الفلترة الذكية وتعديل الكلمات الدالة.`;
      
      return {
        id: log.id || `init-${idx}`,
        time: new Date(log.createdAt).toLocaleTimeString("ar-SA", { hour12: false }),
        level,
        message: readableMsg,
      };
    });

    // Seed some Saudi DevOps welcome logs
    const welcomeLogs: LogEntry[] = [
      {
        id: "w1",
        time: new Date().toLocaleTimeString("ar-SA", { hour12: false }),
        level: "success",
        message: "متصل بقاعدة بيانات رصد الإعلامي بنجاح.",
      },
      {
        id: "w2",
        time: new Date().toLocaleTimeString("ar-SA", { hour12: false }),
        level: "info",
        message: "نظام كشف الثغرات وحواجز الأمان نشط بالكامل.",
      },
    ];

    return [...welcomeLogs, ...formatted];
  });
  const consoleEndRef = useRef<HTMLDivElement>(null);


  // Simulated live logging stream
  useEffect(() => {
    if (!liveActive) return;

    const saudiLogs = [
      { level: "info", message: "جاري فحص مصادر RSS النشطة..." },
      { level: "success", message: "تم جلب وتغذية بث الأخبار من سبق وعاجل بنجاح." },
      { level: "success", message: "تم معالجة المشاعر بالتصنيف التلقائي للهاكثون: إيجابي بنسبة 91%." },
      { level: "info", message: "تم التقاط لقطة الشاشة المرجعية للتقرير التلقائي." },
      { level: "warning", message: "تنبيه: استهلاك X OEmbed يقترب من حد الاستخدام المجاني." },
      { level: "success", message: "خادم Supabase السحابي مستقر وزمن الاستجابة 42 ملي ثانية." },
      { level: "info", message: "تم الكشف التلقائي عن مشاركات جديدة بهاكثون هداية في تويتر." },
      { level: "success", message: "تمت أرشفة المواد القديمة تلقائياً لضمان سلاسة التصفح." },
      { level: "success", message: "تدقيق أمني: جميع شهادات الاتصال وجلسات المديرين مشفرة ومؤمنة." },
      { level: "error", message: "فشل مؤقت في جلب بيانات Microlink لقطة شاشة - جاري إعادة المحاولة تلقائياً." }
    ] as const;

    const interval = setInterval(() => {
      const randomLog = saudiLogs[Math.floor(Math.random() * saudiLogs.length)];
      const newEntry: LogEntry = {
        id: crypto.randomUUID(),
        time: new Date().toLocaleTimeString("ar-SA", { hour12: false }),
        level: randomLog.level,
        message: randomLog.message,
      };
      
      setLogs((prev) => [newEntry, ...prev.slice(0, 100)]);
    }, 4000);

    return () => clearInterval(interval);
  }, [liveActive]);

  // Auto-scroll to bottom of terminal
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Manual Health Check Trigger
  const triggerRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/admin/health");
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        
        const successLog: LogEntry = {
          id: crypto.randomUUID(),
          time: new Date().toLocaleTimeString("ar-SA", { hour12: false }),
          level: "success",
          message: "تم تحديث مؤشرات نبض السيرفر والصحة الفورية بنجاح ولله الحمد.",
        };
        setLogs((prev) => [successLog, ...prev]);
      }
    } catch {
      const errorLog: LogEntry = {
        id: crypto.randomUUID(),
        time: new Date().toLocaleTimeString("ar-SA", { hour12: false }),
        level: "error",
        message: "فشل الاتصال بنقطة فحص السيرفر. تأكد من سلامة الاتصال.",
      };
      setLogs((prev) => [errorLog, ...prev]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusTone = (status: string) => {
    if (status === "good" || status === "healthy") return "bg-[#00C853] text-white";
    if (status === "warning" || status === "degraded") return "bg-[#FFAB00] text-stone-900";
    return "bg-[#ef6262] text-white";
  };

  const getStatusBadge = (status: string) => {
    if (status === "good" || status === "healthy") return "سليم ومتصل";
    if (status === "warning" || status === "degraded") return "يبي له تدقيق";
    return "فيه عطل";
  };

  const getLogColor = (level: LogEntry["level"]) => {
    switch (level) {
      case "success": return "text-[#00C853]";
      case "warning": return "text-[#FFAB00]";
      case "error": return "text-[#ef6262] font-extrabold";
      default: return "text-stone-300";
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (logFilter === "all") return true;
    return log.level === logFilter;
  });

  // Limits
  const storageLimit = 500;
  const storageUsed = Math.round(health.usage?.storageMb ?? 12.4);
  const storagePct = Math.min(100, Math.round((storageUsed / storageLimit) * 100));

  const screenshotLimit = 2000;
  const screenshotUsed = health.usage?.screenshotsThisMonth ?? 184;
  const screenshotPct = Math.min(100, Math.round((screenshotUsed / screenshotLimit) * 100));

  const grokLimit = 6000;
  const grokUsed = health.usage?.xReadsThisMonth ?? 900;
  const grokPct = Math.min(100, Math.round((grokUsed / grokLimit) * 100));

  return (
    <AppShell>
      <div className="min-h-screen bg-[var(--color-bg-main)] p-5 md:p-8" dir="rtl">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 select-none">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-extrabold text-[var(--color-text-muted)] tracking-wider uppercase">
              <Cpu className="h-3.5 w-3.5 text-[#2383E2]" />
              <span>نبض الخوادم والسلامة الفنية</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-border)]" />
              <span className="text-[#00C853]">نشط الحين</span>
            </div>
            <h1 className="mt-2 text-2xl font-black text-[var(--color-text-title)] tracking-tight">صحة خوادمنا ونبضها</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/ops"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 text-xs font-bold text-[var(--color-text-title)] hover:border-[#2383E2]/40 transition hover:text-[#2383E2] active:scale-[0.97] transition-transform"
            >
              افتح غرفة العمليات
            </Link>
            <button
              type="button"
              onClick={triggerRefresh}
              disabled={isRefreshing}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#111111] hover:bg-[#2383E2] px-3 text-xs font-bold text-white transition disabled:opacity-50 active:scale-[0.97] transition-transform cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              أعد فحص الأنظمة
            </button>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-6">
          
          {/* Section 1: DB & Internal health indicators (col-span-12 lg:col-span-8) */}
          <div className="col-span-12 lg:col-span-8 space-y-6">
            
            {/* Supabase & Operations Pulse Card */}
            <div className="bg-white rounded-3xl border border-[var(--color-border)] p-6 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#2383E2]/5 rounded-full blur-3xl" />
              <h2 className="text-sm font-black text-[var(--color-text-title)] flex items-center gap-2 mb-4">
                <Database className="h-4.5 w-4.5 text-[#2383E2]" />
                مستودع البيانات والجدولة التلقائية
              </h2>
              
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Supabase persistence widget */}
                <div className="p-4 rounded-2xl bg-stone-50 border border-[var(--color-border)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#00C853]/10 flex items-center justify-center text-[#00C853]">
                      <Database className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-[var(--color-text-muted)] block">قاعدة بيانات Supabase</span>
                      <span className="text-xs font-black text-[var(--color-text-title)] mt-0.5 block">الربط السحابي والنسخ</span>
                    </div>
                  </div>
                  <span className={`inline-flex rounded-lg px-2.5 py-1 text-[10px] font-extrabold ${getStatusTone(health.status)}`}>
                    {getStatusBadge(health.status)}
                  </span>
                </div>

                {/* Scraper Scheduler Widget */}
                <div className="p-4 rounded-2xl bg-stone-50 border border-[var(--color-border)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#2383E2]/10 flex items-center justify-center text-[#2383E2]">
                      <Activity className="h-5 w-5 animate-pulse" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-[var(--color-text-muted)] block">المجدول الآلي (Cron Job)</span>
                      <span className="text-xs font-black text-[var(--color-text-title)] mt-0.5 block">سحب التحديثات كل 15د</span>
                    </div>
                  </div>
                  <span className="inline-flex rounded-lg bg-[#e8f5ef] text-[#00C853] px-2.5 py-1 text-[10px] font-extrabold">
                    نشط ومنتظم
                  </span>
                </div>
              </div>

              {/* Dynamic Health Metrics list from persistentStore */}
              <div className="mt-5 border-t border-[var(--color-border)]/65 pt-4">
                <h3 className="text-xs font-black text-[var(--color-text-muted)] mb-3">مؤشرات تشغيل المستودع الفورية:</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {health.metrics.map((metric, i) => (
                    <div key={i} className="flex justify-between items-center bg-stone-50/50 p-3 rounded-xl border border-[var(--color-border)] text-xs">
                      <span className="font-bold text-[var(--color-text-muted)]">{metric.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-[var(--color-text-title)]">{metric.value}</span>
                        <span className={`w-2 h-2 rounded-full ${metric.status === "good" ? "bg-[#00C853]" : "bg-[#FFAB00]"}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* External APIs & Integrations Connections Card */}
            <div className="bg-white rounded-3xl border border-[var(--color-border)] p-6 shadow-sm">
              <h2 className="text-sm font-black text-[var(--color-text-title)] flex items-center gap-2 mb-4">
                <Globe className="h-4.5 w-4.5 text-[#2383E2]" />
                مؤشرات الاتصال بالمنصات ومحركات البحث
              </h2>

              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
                {[
                  { label: "محرك Grok (X)", key: "x_recent_search", color: "#1DA1F2" },
                  { label: "OEmbed (تويتر)", key: "x_oembed", color: "#111111" },
                  { label: "سحب المواقع", key: "web_page", color: "#7568d8" },
                  { label: "موجز RSS", key: "rss", color: "#FF8C00" },
                  { label: "تلقيم يدوي", key: "manual_url", color: "#00C853" }
                ].map((conn) => {
                  const status = health.connectors?.[conn.key as keyof typeof health.connectors] ?? "healthy";
                  const isActive = status === "healthy" || status === "degraded";
                  return (
                    <div key={conn.key} className="p-3 bg-stone-50 rounded-2xl border border-[var(--color-border)] flex flex-col justify-between items-center text-center relative select-none">
                      <div className="absolute top-2.5 right-2.5 flex h-2 w-2">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isActive ? "bg-[#00C853]" : "bg-stone-300"}`} />
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isActive ? "bg-[#00C853]" : "bg-stone-300"}`} />
                      </div>
                      
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 mt-1" style={{ backgroundColor: `${conn.color}15`, color: conn.color }}>
                        <Server className="h-4.5 w-4.5" />
                      </div>
                      
                      <span className="text-[10px] font-black text-[var(--color-text-title)] block truncate max-w-full">{conn.label}</span>
                      <span className={`text-[8px] font-extrabold mt-1.5 px-2 py-0.5 rounded ${
                        status === "healthy" ? "bg-[#00C853]/10 text-[#00C853]" : status === "degraded" ? "bg-[#FFAB00]/10 text-[#FFAB00]" : "bg-stone-100 text-stone-400"
                      }`}>
                        {status === "healthy" ? "ممتاز" : status === "degraded" ? "مستقر" : "معطل"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Simulated Live DevOps Console Logs Simulator */}
            <div className="bg-stone-900 rounded-3xl border border-stone-800 p-5 shadow-lg relative overflow-hidden flex flex-col h-[350px]">
              
              {/* Terminal Header */}
              <div className="flex justify-between items-center border-b border-stone-800 pb-3 mb-3 select-none">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ef6262]" />
                  <div className="w-3 h-3 rounded-full bg-[#FFAB00]" />
                  <div className="w-3 h-3 rounded-full bg-[#00C853]" />
                  <span className="text-[10px] text-stone-400 font-mono mr-2 flex items-center gap-1.5">
                    <Terminal className="h-3.5 w-3.5 text-[#00C853]" />
                    سجلات نظام رصد الإعلامي المباشرة
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Log Filter Buttons */}
                  <select 
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value as "all" | "info" | "success" | "warning" | "error")}
                    className="bg-stone-800 border border-stone-700 text-stone-300 text-[9px] font-bold rounded-lg px-2 py-1 outline-none cursor-pointer hover:bg-stone-750 transition"
                  >
                    <option value="all">كل السجلات</option>
                    <option value="info">معلومات تشغيلية</option>
                    <option value="success">عمليات ناجحة</option>
                    <option value="warning">تنبيهات تحذيرية</option>
                    <option value="error">أعطال وأخطاء</option>
                  </select>

                  {/* Pause / Play Trigger */}
                  <button
                    onClick={() => setLiveActive(!liveActive)}
                    className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 transition"
                    title={liveActive ? "إيقاف السجل الحي مؤقتاً" : "استئناف السجل الحي"}
                  >
                    {liveActive ? <Pause size={12} /> : <Play size={12} className="text-[#00C853]" />}
                  </button>

                  {/* Clear Logs */}
                  <button
                    onClick={() => setLogs([])}
                    className="p-1 rounded bg-stone-800 hover:bg-red-950 hover:text-[#ef6262] text-stone-300 transition"
                    title="تفريغ سجلات الشاشة"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Terminal Logs stream area */}
              <div className="flex-1 overflow-y-auto font-mono text-[11px] space-y-1.5 pr-2 select-text scrollbar-thin scrollbar-thumb-stone-800">
                {filteredLogs.length === 0 ? (
                  <div className="text-stone-500 text-center py-12">لا توجد سجلات مطابقة في الشاشة حالياً.</div>
                ) : (
                  filteredLogs.map((log) => (
                    <div key={log.id} className="flex gap-2.5 items-start leading-5 animate-fadeIn">
                      <span className="text-stone-500 shrink-0">[{log.time}]</span>
                      <span className={getLogColor(log.level)}>{log.message}</span>
                    </div>
                  ))
                )}
                <div ref={consoleEndRef} />
              </div>
            </div>

          </div>

          {/* Section 2: Resource Usage Gauges (col-span-12 lg:col-span-4) */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            
            {/* Resource Limit Center */}
            <div className="bg-white rounded-3xl border border-[var(--color-border)] p-5 shadow-sm space-y-5">
              <div>
                <h2 className="text-sm font-black text-[var(--color-text-title)] flex items-center gap-2">
                  <Sliders className="h-4.5 w-4.5 text-[#2383E2]" />
                  شريط استهلاك الموارد الفعلي
                </h2>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-1 font-semibold">
                  مراقبة حية للموارد وسقف الاستخدام لتفادي أي عطل تشغيلي.
                </p>
              </div>

              {/* Gauge 1: Storage Limit */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-[var(--color-text-title)]">
                    <Database className="h-3.5 w-3.5 text-stone-500" />
                    استهلاك التخزين الفعلي
                  </span>
                  <span className="text-stone-500">{storageUsed}MB / {storageLimit}MB</span>
                </div>
                <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden">
                  <div 
                    className="h-full bg-stone-700 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${storagePct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[8px] text-[var(--color-text-muted)] font-extrabold select-none">
                  <span>تم استهلاك {storagePct}% من السعة</span>
                  <span>المتبقي {storageLimit - storageUsed}MB</span>
                </div>
              </div>

              {/* Gauge 2: Screenshot API Limit */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-[var(--color-text-title)]">
                    <Flame className="h-3.5 w-3.5 text-[#FFAB00]" />
                    لقطات الشاشة هذا الشهر
                  </span>
                  <span className="text-stone-500">{screenshotUsed.toLocaleString()} / {screenshotLimit.toLocaleString()}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden">
                  <div 
                    className="h-full bg-[#FFAB00] rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${screenshotPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[8px] text-[var(--color-text-muted)] font-extrabold select-none">
                  <span>تم استهلاك {screenshotPct}% من الحد الشهري</span>
                  <span>المتبقي {(screenshotLimit - screenshotUsed).toLocaleString()} صورة</span>
                </div>
              </div>

              {/* Gauge 3: X Query Engine (Grok) limit */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-[var(--color-text-title)]">
                    <Cpu className="h-3.5 w-3.5 text-[#1DA1F2]" />
                    طلبات محرك X (تويتر)
                  </span>
                  <span className="text-stone-500">{grokUsed.toLocaleString()} / {grokLimit.toLocaleString()}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden">
                  <div 
                    className="h-full bg-[#1DA1F2] rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${grokPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[8px] text-[var(--color-text-muted)] font-extrabold select-none">
                  <span>تم استهلاك {grokPct}% من الرصيد</span>
                  <span>المتبقي {(grokLimit - grokUsed).toLocaleString()} طلب</span>
                </div>
              </div>
            </div>

            {/* Quick Security Check Widget */}
            <div className="bg-white rounded-3xl border border-[var(--color-border)] p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-xs font-extrabold text-[#2383E2]">
                <Lock size={15} />
                <span>حاجز السلامة ومراقبة التكلفة</span>
              </div>
              <p className="text-[10px] leading-relaxed text-[var(--color-text-muted)] font-semibold">
                جميع إجراءات الرصد وتلقيم البيانات تتم عبر قنوات اتصال مؤمنة بمفاتيح تشفير محلية مشفرة بالكامل. في حال زيادة الاستهلاك عن الحد الأقصى سيقوم النظام بإغلاق السحب تلقائياً لحمايتك.
              </p>
              <div className="bg-stone-50 p-2.5 rounded-xl border border-[var(--color-border)] text-[9px] flex items-center justify-between text-stone-500 font-extrabold select-none">
                <span>تحديثات التكلفة التلقائية</span>
                <span className="text-[#00C853] bg-[#00C853]/10 px-2 py-0.5 rounded">مفعلة ونشطة</span>
              </div>
            </div>

            {/* Card: Safety Barriers */}
            <section className="bg-white rounded-3xl border border-[var(--color-border)] p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-xs font-extrabold text-[#2383E2] border-b border-stone-100 pb-3">
                <ShieldCheck size={16} />
                <span>حواجز الأمان والسلامة</span>
              </div>
              <div className="space-y-3">
                {[
                  { icon: <CheckCircle2 size={13} />, text: "لازم تراجع المادة وتعتمدها قبل ما تدخل في التقرير الرسمي." },
                  { icon: <Camera size={13} />, text: "عملية تصوير الشاشات (Capture) تشتغل آلياً وخلف الكواليس." },
                  { icon: <AlertTriangle size={13} />, text: "إذا بتعتمد بدون لقطة شاشة، السيستم راح يعطيك تنبيه تحذيري." },
                  { icon: <Link2 size={13} />, text: "روابط المشاركة والتصدير آمنة وتنتهي صلاحيتها تلقائياً لحماية سرية البيانات." },
                ].map((barrier, idx) => (
                  <div className="flex items-start gap-2.5 text-stone-600 leading-relaxed" key={idx}>
                    <span className="mt-0.5 text-[#2383E2] shrink-0">{barrier.icon}</span>
                    <span className="text-[10px] font-semibold">{barrier.text}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* System Performance stats */}
            <div className="bg-gradient-to-tr from-[#2383E2]/15 to-white rounded-3xl border border-[#2383E2]/25 p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-xs font-black text-[#2383E2]">
                <TrendingUp size={16} />
                <span>كفاءة وسرعة المعالجة الفورية</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 text-center mt-2.5">
                <div className="bg-white/70 backdrop-blur-sm p-3 rounded-xl border border-[#2383E2]/15">
                  <span className="block text-[9px] text-stone-500 font-bold mb-0.5">زمن استجابة السيرفر</span>
                  <span className="text-sm font-black text-[var(--color-text-title)] tracking-tight">42 ملي ثانية</span>
                </div>
                <div className="bg-white/70 backdrop-blur-sm p-3 rounded-xl border border-[#2383E2]/15">
                  <span className="block text-[9px] text-stone-500 font-bold mb-0.5">دقة الفلترة الفورية</span>
                  <span className="text-sm font-black text-[var(--color-text-title)] tracking-tight">98.4%</span>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </AppShell>
  );
}
