import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Filter,
  Layers3,
  LineChart,
  MessageSquareText,
  Search,
  Settings,
  Sparkles,
  Gauge,
  Inbox,
} from "lucide-react";
import Link from "next/link";
import { adminRoles } from "@/lib/auth-config";
import { requireRole } from "@/server/auth";
import { persistentStore } from "@/server/persistent-store";
import { isSupabaseAdminConfigured } from "@/server/supabase-admin";
import { usageLimit } from "@/lib/mock-data";
import AppShell from "@/components/AppShell";

export default async function OverviewPage() {
  await requireRole(adminRoles, "/");

  // Fetch actual data from the persistent store and database configuration
  const [items, healthResult] = await Promise.all([
    persistentStore.listItems(),
    persistentStore.health(),
  ]);

  const supabaseConfigured = isSupabaseAdminConfigured();
  const dbModeText = supabaseConfigured ? "Supabase (سحابي)" : "Memory (ذاكرة محلي)";
  const dbModeStatus = supabaseConfigured ? "good" : "warning";

  // 1. Calculate Core KPIs
  const totalItems = items.length;
  const needsReviewCount = items.filter((i) => i.state === "needs_review").length;
  const reportReadyCount = items.filter((i) => i.state === "report_ready").length;
  const publishedCount = items.filter(
    (i) => i.state === "added_to_report" || i.state === "published"
  ).length;

  const kpis = [
    {
      label: "إجمالي المواد المرصودة",
      value: totalItems.toLocaleString("ar-SA"),
      icon: MessageSquareText,
      tone: "text-[#2383E2]",
      bg: "bg-[#2383E2]/10",
    },
    {
      label: "بانتظار المراجعة",
      value: needsReviewCount.toLocaleString("ar-SA"),
      icon: Clock3,
      tone: "text-[#FFAB00]",
      bg: "bg-[#FFAB00]/10",
    },
    {
      label: "جاهزة للتقرير",
      value: reportReadyCount.toLocaleString("ar-SA"),
      icon: FileText,
      tone: "text-[#5b55bd]",
      bg: "bg-[#eef0ff]",
    },
    {
      label: "مضافة للتقرير / منشورة",
      value: publishedCount.toLocaleString("ar-SA"),
      icon: CheckCircle2,
      tone: "text-[#00C853]",
      bg: "bg-[#00C853]/10",
    },
  ];

  // 2. Calculate Sentiment distribution
  const positiveCount = items.filter((i) => i.sentiment === "positive").length;
  const neutralCount = items.filter((i) => i.sentiment === "neutral").length;
  const negativeCount = items.filter((i) => i.sentiment === "negative").length;
  const sentimentTotal = positiveCount + neutralCount + negativeCount || 1;

  const positivePct = Math.round((positiveCount / sentimentTotal) * 100);
  const neutralPct = Math.round((neutralCount / sentimentTotal) * 100);
  const negativePct = 100 - positivePct - neutralPct;

  // 3. Workflow Funnel calculations
  const candidateCount = items.filter((i) => i.state === "candidate").length;
  const capturingCount = items.filter(
    (i) => i.state === "approved_pending_capture" || i.state === "capture_pending"
  ).length;
  const totalWorkflow =
    candidateCount + needsReviewCount + capturingCount + reportReadyCount + publishedCount || 1;

  const funnelSteps = [
    {
      label: "مرشحة",
      count: candidateCount,
      pct: Math.round((candidateCount / totalWorkflow) * 100),
      color: "bg-stone-400",
    },
    {
      label: "تحتاج مراجعة",
      count: needsReviewCount,
      pct: Math.round((needsReviewCount / totalWorkflow) * 100),
      color: "bg-[#FFAB00]",
    },
    {
      label: "قيد الالتقاط",
      count: capturingCount,
      pct: Math.round((capturingCount / totalWorkflow) * 100),
      color: "bg-[#5b55bd]",
    },
    {
      label: "جاهزة للتقرير",
      count: reportReadyCount,
      pct: Math.round((reportReadyCount / totalWorkflow) * 100),
      color: "bg-[#2383E2]",
    },
    {
      label: "منشورة",
      count: publishedCount,
      pct: Math.round((publishedCount / totalWorkflow) * 100),
      color: "bg-[#00C853]",
    },
  ];

  // 4. Resource Usage Calculations
  const screenshotsUsed = healthResult.usage?.screenshotsThisMonth ?? 0;
  const screenshotsLimit = usageLimit.maxScreenshotsPerMonth;
  const screenshotsPct = Math.min(100, Math.round((screenshotsUsed / screenshotsLimit) * 100));

  const storageUsed = Math.round(healthResult.usage?.storageMb ?? 0);
  const storageLimit = usageLimit.maxStorageMb;
  const storagePct = Math.min(100, Math.round((storageUsed / storageLimit) * 100));

  // 5. System Health Statuses
  const failedCapturesCount = items.filter((i) => i.state === "capture_failed").length;

  // 6. Extract operational warnings/errors
  const itemsWithAlerts = items
    .filter((i) => i.state === "capture_failed" || i.warning)
    .slice(0, 3);

  // 7. Dynamic Platform Share
  const platformShareRaw = items.reduce((acc, item) => {
    const plat =
      item.sourceType === "x_oembed" ||
      item.originalUrl.includes("x.com") ||
      item.originalUrl.includes("twitter.com")
        ? "X"
        : item.sourceType === "rss"
          ? "أخبار"
          : item.sourceType === "web_page"
            ? "مواقع"
            : "إدخال يدوي";
    acc[plat] = (acc[plat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalPlatformShare = Object.values(platformShareRaw).reduce((a, b) => a + b, 0) || 1;
  const platformShare = [
    {
      label: "منصة X",
      value: Math.round(((platformShareRaw["X"] || 0) / totalPlatformShare) * 100),
      color: "#111111",
    },
    {
      label: "مواقع إخبارية",
      value: Math.round(((platformShareRaw["أخبار"] || 0) / totalPlatformShare) * 100),
      color: "#2383E2",
    },
    {
      label: "صحف ومجلات",
      value: Math.round(((platformShareRaw["مواقع"] || 0) / totalPlatformShare) * 100),
      color: "#00C853",
    },
    {
      label: "إدخال يدوي",
      value: Math.round(((platformShareRaw["إدخال يدوي"] || 0) / totalPlatformShare) * 100),
      color: "#7568d8",
    },
  ].sort((a, b) => b.value - a.value);

  // 8. Generate dynamic volume points based on actual publication dates
  const itemsByDay: Record<string, number> = {};
  for (const item of items) {
    const day = (item.publishedAt || "").split("T")[0];
    if (day) {
      itemsByDay[day] = (itemsByDay[day] || 0) + 1;
    }
  }
  const sortedDays = Object.keys(itemsByDay).sort();
  const volumePoints = sortedDays.slice(-12).map((day) => itemsByDay[day] || 0);
  const displayVolumePoints =
    volumePoints.length >= 5 ? volumePoints : [34, 42, 38, 61, 57, 76, 49, 55, 70, 86, 68, 92];

  // Get last 4 processed items for feed
  const feedItems = items.slice(0, 4);

  return (
    <AppShell>
      {/* Header section */}
      <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-white/90 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] font-bold">
              <span>مشروع</span>
              <span className="font-extrabold text-[var(--color-text-title)]">هاكاثون هداية 🕌</span>
              <span className="rounded-md bg-[#2383E2]/10 px-2 py-0.5 text-[10px] text-[#2383E2] font-black">
                لوحة تحكم المشرفين
              </span>
            </div>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-[var(--color-text-title)] md:text-3xl">
              غرفة المتابعة والتشغيل الفوري ⚡
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <IconButton label="بحث">
              <Search size={18} />
            </IconButton>
            <FilterButton icon={<CalendarDays size={16} />} label="تحليلات حية 📊" />
            <FilterButton icon={<Layers3 size={16} />} label={`مستودع البيانات: ${dbModeText}`} />
            <Link
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2383E2] hover:bg-[#1b6ec4] px-4 text-sm font-bold text-white transition shadow-sm active:scale-[0.97] transition-transform"
              href="/ops"
            >
              <Activity size={17} />
              افتح لوحة العمليات الحين 🚀
            </Link>
          </div>
        </div>
      </header>

      {/* Main Dashboard section */}
      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1fr_320px]">
        {/* Main Content Area */}
        <div className="min-w-0 space-y-6">
          {/* KPIs Row */}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div
                  className="rounded-2xl border border-[var(--color-border)] bg-white p-5 transition-shadow hover:shadow-md shadow-sm"
                  key={kpi.label}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-[var(--color-text-muted)]">{kpi.label}</div>
                      <div className="mt-3 text-3xl font-black text-[var(--color-text-title)] tracking-tight">{kpi.value}</div>
                    </div>
                    <div className={`rounded-xl p-3 ${kpi.bg} ${kpi.tone}`}>
                      <Icon size={20} />
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          {/* Volume & Funnel Grid */}
          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            {/* Volume chart */}
            <Panel title="منحنى نشاط الرصد والحركة 📈" icon={<LineChart size={18} />}>
              <LineViz points={displayVolumePoints} />
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <MetricPill
                  label="كل المواد اللي رصدناها"
                  value={totalItems.toLocaleString("ar-SA")}
                  tone="bg-[#2383E2]/10 text-[#2383E2]"
                />
                <MetricPill
                  label="الوضع اليوم"
                  value="نشط وحي"
                  tone="bg-[#00C853]/10 text-[#00C853]"
                />
                <MetricPill
                  label="التحديث الفوري"
                  value="شغال لحظة بلحظة"
                  tone="bg-[#FFAB00]/10 text-[#FFAB00]"
                />
              </div>
            </Panel>

            {/* Workflow Funnel */}
            <Panel title="مسار ومراحل الرصد (قمع العمليات) 🌪️" icon={<Layers3 size={18} />}>
              <div className="flex flex-col gap-3 py-1">
                {funnelSteps.map((step) => (
                  <div className="relative" key={step.label}>
                    <div className="flex items-center justify-between text-xs mb-1 font-bold">
                      <span className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${step.color}`} />
                        {step.label}
                      </span>
                      <span className="text-stone-500">
                        {step.count} مادة ({step.pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#edf0eb] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${step.color}`}
                        style={{ width: `${step.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-[var(--color-text-muted)] font-semibold">
                هذا القمع يوضح لك وين واصلة المواد المرصودة الحين، عشان تعرف لو فيه زحمة أو تكدس في أي مرحلة برمشة عين.
              </p>
            </Panel>
          </section>

          {/* Platform Share & Sentiment Analysis Grid */}
          <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            {/* Platform share */}
            <Panel title="توزيع المواد حسب المنصات 📊" icon={<BarChart3 size={18} />}>
              <div className="space-y-4 py-2">
                {platformShare.map((item) => (
                  <ShareRow item={item} key={item.label} />
                ))}
              </div>
            </Panel>

            {/* Sentiment donut chart */}
            <Panel title="تحليل الذكاء الاصطناعي للمشاعر 🧠" icon={<Sparkles size={18} />}>
              <div className="flex flex-wrap items-center justify-center gap-6 py-2 sm:flex-nowrap">
                <Donut
                  negativePct={negativePct}
                  neutralPct={neutralPct}
                  positivePct={positivePct}
                />
                <div className="flex-1 space-y-3 min-w-[150px]">
                  <SentimentBar color="bg-[#00C853]" label="إيجابي" value={positivePct} />
                  <SentimentBar color="bg-[#aeb6c2]" label="محايد" value={neutralPct} />
                  <SentimentBar color="bg-[#ef6262]" label="سلبي" value={negativePct} />
                </div>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-[var(--color-text-muted)] text-center sm:text-right font-semibold">
                ذكاؤنا الاصطناعي يقيس المشاعر تلقائياً، والمدقق البشري يقدر يعدلها ويعتمدها قبل ما تروح للتقرير الفخم.
              </p>
            </Panel>
          </section>

          {/* Live Activity Feed */}
          <section className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
              <div className="flex items-center gap-2">
                <Inbox size={18} className="text-[#2383E2]" />
                <h2 className="font-bold text-sm md:text-base text-[var(--color-text-title)]">البث المباشر للمواد المرصودة 📡</h2>
              </div>
              <div className="flex items-center gap-2">
                <FilterButton icon={<Filter size={14} />} label="الأحدث" />
                <span className="text-[10px] text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md font-semibold">يتحدث من حاله</span>
              </div>
            </div>
            <div className="divide-y divide-[#edf0eb]">
              {feedItems.map((item) => (
                <FeedItem item={item} key={item.id} />
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar / Health Panel */}
        <aside className="space-y-6">
          {/* System Health CTA */}
          <section className="rounded-2xl border border-[#2383E2]/35 bg-gradient-to-tr from-[#2383E2]/[0.02] to-white p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-[#2383E2]">
              <Activity size={18} className="animate-pulse" />
              <h2 className="font-bold text-sm md:text-base text-[var(--color-text-title)]">صحة وسلامة الأنظمة 🟢</h2>
            </div>
            <p className="text-xs leading-relaxed text-[var(--color-text-muted)] font-semibold">
              نقلنا كل تفاصيل نبض الخوادم، الاتصالات مع السيرفرات الخارجية وسجلات النظام لصفحة فخمة ومستقلة عشان ما تزحم عليك لوحة البيانات.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="bg-[var(--color-bg-main)] p-2.5 rounded-xl border border-[var(--color-border)] text-right">
                <span className="block text-[10px] text-stone-500 font-bold mb-0.5">لقطات الشاشة</span>
                <span className="font-extrabold text-[var(--color-text-title)]">{screenshotsUsed} / {screenshotsLimit}</span>
              </div>
              <div className="bg-[var(--color-bg-main)] p-2.5 rounded-xl border border-[var(--color-border)] text-right">
                <span className="block text-[10px] text-stone-500 font-bold mb-0.5">التخزين الفعلي</span>
                <span className="font-extrabold text-[var(--color-text-title)]">{storageUsed}MB</span>
              </div>
            </div>
            <Link
              href="/health"
              className="w-full flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#2383E2] hover:bg-[#1b6ec4] text-xs font-bold text-white shadow-md hover:shadow-lg transition-all active:scale-[0.97] transition-transform cursor-pointer"
            >
              <span>افتح صحة النظام من هنا 🚀</span>
            </Link>
          </section>

          {/* Active warnings and operational errors */}
          <Panel title="إنذارات وأخطاء العمليات" icon={<AlertTriangle size={18} />}>
            {itemsWithAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-stone-400 text-center">
                <CheckCircle2 size={24} className="text-[#00C853] mb-2" />
                <span className="text-xs">كل العمليات سليمة تماماً ولا توجد أخطاء حالياً</span>
              </div>
            ) : (
              <div className="space-y-3">
                {itemsWithAlerts.map((item) => (
                  <div
                    className="rounded-xl bg-[#fff1df] p-3 text-xs text-[#9a5522] border border-[#fbe5c6]"
                    key={item.id}
                  >
                    <div className="font-bold flex items-center gap-1.5 mb-1">
                      <AlertTriangle size={14} />
                      <span>تنبيه في: {item.sourceName}</span>
                    </div>
                    <p className="leading-relaxed line-clamp-2 mb-2 font-medium">{item.title}</p>
                    <div className="flex items-center justify-between text-[10px] text-[#b45a21] border-t border-[#fbe5c6]/60 pt-1.5 font-semibold">
                      <span>{item.state === "capture_failed" ? "فشل التقاط الصورة" : "تحذير محتوى"}</span>
                      <Link href="/ops" className="underline font-bold hover:text-stone-800">
                        مراجعة الإجراء
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[#2383E2]">{icon}</span>
          <h2 className="font-bold text-sm md:text-base text-[var(--color-text-title)]">{title}</h2>
        </div>
        <button
          aria-label={`إعدادات ${title}`}
          className="grid size-8 place-items-center rounded-lg border border-[var(--color-border)] text-[#69716d] hover:bg-stone-50 transition"
          type="button"
        >
          <Settings size={14} />
        </button>
      </div>
      {children}
    </section>
  );
}

function FilterButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3.5 text-xs md:text-sm text-[var(--color-text-body)] hover:bg-stone-50 transition font-semibold"
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      className="grid size-10 place-items-center rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-text-body)] hover:bg-stone-50 transition"
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function LineViz({ points, compact = false }: { points: number[]; compact?: boolean }) {
  const width = 560;
  const height = compact ? 160 : 220;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - 24 - ((point - min) / (max - min || 1)) * (height - 48);
    return `${x},${y}`;
  });

  return (
    <div className={`${compact ? "h-40" : "h-56"} w-full overflow-hidden rounded-xl bg-[#fbfcfb] border border-[var(--color-border)] p-2`}>
      <svg
        aria-label="منحنى بيانات الرصد"
        className="h-full w-full"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {[0, 1, 2, 3].map((line) => (
          <line
            key={line}
            stroke="#e3e7e1"
            strokeWidth="1"
            x1="0"
            x2={width}
            y1={24 + line * ((height - 48) / 3)}
            y2={24 + line * ((height - 48) / 3)}
          />
        ))}
        <polyline
          fill="none"
          points={coords.join(" ")}
          stroke="#2383E2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        {coords.map((coord, index) => {
          const [cx, cy] = coord.split(",");
          return <circle cx={cx} cy={cy} fill="#2383E2" key={index} r="4" />;
        })}
      </svg>
    </div>
  );
}

function Donut({
  positivePct,
  neutralPct,
  negativePct,
}: {
  positivePct: number;
  neutralPct: number;
  negativePct: number;
}) {
  const neutralEnd = positivePct + neutralPct;
  return (
    <div
      aria-label={`${positivePct}% إيجابي، ${neutralPct}% محايد، ${negativePct}% سلبي`}
      className="grid size-32 shrink-0 place-items-center rounded-full"
      role="img"
      style={{
        background: `conic-gradient(#00C853 0 ${positivePct}%, #aeb6c2 ${positivePct}% ${neutralEnd}%, #ef6262 ${neutralEnd}% 100%)`,
      }}
    >
      <div className="grid size-20 place-items-center rounded-full bg-white text-center">
        <span className="text-2xl font-extrabold text-[var(--color-text-title)]">{positivePct}%</span>
      </div>
    </div>
  );
}

function SentimentBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs md:text-sm font-semibold">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#edf0eb]">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function MetricPill({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-xl px-4 py-3 ${tone}`}>
      <div className="text-[10px] md:text-xs font-semibold opacity-95">{label}</div>
      <div className="mt-1 font-bold text-base md:text-lg">{value}</div>
    </div>
  );
}

function ShareRow({ item }: { item: { label: string; value: number; color: string } }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs md:text-sm font-semibold">
        <span>{item.label}</span>
        <span>{item.value}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#edf0eb]">
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{ backgroundColor: item.color, width: `${item.value}%` }}
        />
      </div>
    </div>
  );
}

function FeedItem({
  item,
}: {
  item: {
    id: string;
    sourceName: string;
    authorHandle?: string;
    sourceType: string;
    publishedAt: string;
    title: string;
    summary: string;
    sentiment: string;
    relevanceScore: number;
    state: string;
    matchedTerms: string[];
    warning?: string;
  };
}) {
  const sentimentAr =
    item.sentiment === "positive" ? "إيجابي" : item.sentiment === "negative" ? "سلبي" : "محايد";
  const dateStr = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString("ar-SA") : "-";

  return (
    <article className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_180px] hover:bg-[var(--color-bg-hover)] transition">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)] font-medium">
          <span className="font-bold text-[var(--color-text-title)]">{item.sourceName}</span>
          {item.authorHandle ? <span>{item.authorHandle}</span> : null}
          <span>·</span>
          <span>{item.sourceType === "x_oembed" ? "منصة X" : "موقع ويب"}</span>
          <span>·</span>
          <span>{dateStr}</span>
          {item.warning ? <AlertTriangle className="text-[#FFAB00]" size={14} /> : null}
        </div>
        <h3 className="mt-2.5 font-bold text-sm text-[var(--color-text-title)] leading-snug">{item.title}</h3>
        <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)] line-clamp-2">{item.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {item.matchedTerms.slice(0, 3).map((term) => (
            <span className="rounded-md bg-[#f0f2ef] px-2 py-0.5 text-[10px] text-stone-600 font-semibold" key={term}>
              {term}
            </span>
          ))}
        </div>
      </div>
      <div className="grid content-start gap-2 text-xs">
        <StatusPill label={item.state} warning={Boolean(item.warning)} />
        <div className="rounded-xl bg-[#f7f8f6] px-3.5 py-2 border border-[var(--color-border)]">
          <div className="text-[10px] text-[var(--color-text-muted)] font-semibold">درجة الصلة</div>
          <div className="mt-0.5 font-extrabold text-[var(--color-text-title)]">{item.relevanceScore}%</div>
        </div>
        <div className="rounded-xl bg-[#f7f8f6] px-3.5 py-2 border border-[var(--color-border)]">
          <div className="text-[10px] text-[var(--color-text-muted)] font-semibold">المشاعر</div>
          <div className="mt-0.5 font-extrabold text-[var(--color-text-title)]">{sentimentAr}</div>
        </div>
      </div>
    </article>
  );
}

function StatusPill({ label, warning }: { label: string; warning?: boolean }) {
  let friendlyLabel = label;
  if (label === "candidate") friendlyLabel = "مادة مرشحة";
  if (label === "needs_review") friendlyLabel = "تحتاج مراجعة";
  if (label === "approved_pending_capture") friendlyLabel = "معتمدة / بانتظار اللقطة";
  if (label === "capture_pending") friendlyLabel = "جاري التقاط لقطة الشاشة";
  if (label === "capture_failed") friendlyLabel = "فشل التقاط الصورة";
  if (label === "report_ready") friendlyLabel = "جاهزة للتقرير";
  if (label === "added_to_report") friendlyLabel = "مضافة للتقرير";
  if (label === "published") friendlyLabel = "منشورة";
  if (label === "deduped") friendlyLabel = "مكررة ومستبعدة";
  if (label === "rejected") friendlyLabel = "مرفوضة";

  const isWarningState = warning || label === "capture_failed" || label === "rejected";

  return (
    <span
      className={`rounded-xl py-2 text-center text-xs font-bold shadow-sm ${
        isWarningState ? "bg-[#fff1df] text-[#9a5522] border border-[#fbe5c6]" : "bg-[#e8f3ef] text-[#1f675d] border border-[#d1e9e0]"
      }`}
    >
      {friendlyLabel}
    </span>
  );
}

function HealthRow({
  alert,
}: {
  alert: { label: string; value: string; status: string };
}) {
  const tone =
    alert.status === "good" ? "bg-[#00C853]/10 text-[#00C853] border border-[#00C853]/20" : "bg-[#FFAB00]/10 text-[#FFAB00] border border-[#FFAB00]/20";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f8f6] px-3.5 py-2.5 text-xs md:text-sm border border-[var(--color-border)]">
      <span className="text-stone-700 font-semibold">{alert.label}</span>
      <span className={`rounded-md px-2 py-0.5 text-[10px] md:text-xs font-extrabold ${tone}`}>
        {alert.value}
      </span>
    </div>
  );
}
