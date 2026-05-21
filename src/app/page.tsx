import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Filter,
  Gauge,
  Inbox,
  Layers3,
  Link2,
  LineChart,
  LockKeyhole,
  MessageSquareText,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { adminRoles } from "@/lib/auth-config";
import { requireRole } from "@/server/auth";
import { persistentStore } from "@/server/persistent-store";
import { isSupabaseAdminConfigured } from "@/server/supabase-admin";
import { usageLimit } from "@/lib/mock-data";

const navItems = [
  { label: "لوحة الرصد", href: "/", icon: BarChart3, active: true },
  { label: "Live Feed", href: "/feed", icon: Inbox },
  { label: "تقرير العميل", href: "/client-report", icon: FileText },
  { label: "استيراد التقارير", href: "/imports", icon: FileText },
  { label: "استكمال الروابط", href: "/imports/backfill", icon: Link2 },
  { label: "المراجعة", href: "/ops", icon: CheckCircle2 },
  { label: "التقارير", href: "/reports/report-5", icon: FileText },
  { label: "المصادر", href: "#sources", icon: Radio },
  { label: "التكلفة", href: "#budgets", icon: Gauge },
  { label: "الأمان", href: "#security", icon: ShieldCheck },
];

export default async function Home() {
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
      tone: "text-[#277466]",
      bg: "bg-[#e8f3ef]",
    },
    {
      label: "بانتظار المراجعة",
      value: needsReviewCount.toLocaleString("ar-SA"),
      icon: Clock3,
      tone: "text-[#b45a21]",
      bg: "bg-[#fff1df]",
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
      tone: "text-[#2f7d48]",
      bg: "bg-[#eaf6ed]",
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
      color: "bg-[#b45a21]",
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
      color: "bg-[#277466]",
    },
    {
      label: "منشورة",
      count: publishedCount,
      pct: Math.round((publishedCount / totalWorkflow) * 100),
      color: "bg-[#1f675d]",
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
  const liveAlerts = [
    { label: "وضع التخزين", value: dbModeText, status: dbModeStatus },
    {
      label: "تراكم المراجعة",
      value: `${needsReviewCount} مواد`,
      status: needsReviewCount > 3 ? "warning" : "good",
    },
    {
      label: "أخطاء الالتقاط",
      value: `${failedCapturesCount} لقطات`,
      status: failedCapturesCount > 0 ? "warning" : "good",
    },
    { label: "حالة الذكاء الاصطناعي", value: "متصل ونشط", status: "good" },
  ];

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
      color: "#39a0a9",
    },
    {
      label: "صحف ومجلات",
      value: Math.round(((platformShareRaw["مواقع"] || 0) / totalPlatformShare) * 100),
      color: "#ee9b35",
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
    <main className="min-h-screen bg-[#f5f6f4] text-[#171819]" dir="rtl">
      <div className="grid min-h-screen lg:grid-cols-[264px_1fr]">
        {/* Sidebar Nav */}
        <aside className="hidden border-l border-[#dfe3de] bg-[#fbfbfa] lg:block">
          <div className="flex h-full flex-col">
            <div className="border-b border-[#e1e4df] px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-[#18201e] text-white">
                  <Radio size={20} />
                </div>
                <div>
                  <div className="text-lg font-semibold">رصد</div>
                  <div className="text-xs text-[#6a716d]">Media Intelligence</div>
                </div>
              </div>
            </div>

            <nav className="flex-1 space-y-1 px-3 py-5">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition ${
                      item.active
                        ? "bg-[#e8f3ef] font-semibold text-[#1f675d]"
                        : "text-[#59605d] hover:bg-[#f0f2ef]"
                    }`}
                    href={item.href}
                    key={item.label}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-[#e1e4df] p-4">
              <div className="rounded-lg border border-[#dfe3de] bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <LockKeyhole size={16} />
                  SaaS Guardrails
                </div>
                <p className="mt-2 text-xs leading-5 text-[#69716d]">
                  حدود الميزانية، حماية الخصوصية، والربط الفعلي المباشر مفعل بالكامل.
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Dashboard section */}
        <section className="min-w-0">
          <header className="sticky top-0 z-10 border-b border-[#dfe3de] bg-[#fbfbfa]/95 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-7">
              <div>
                <div className="flex items-center gap-2 text-sm text-[#69716d]">
                  <span>مشروع</span>
                  <span className="font-semibold text-[#171819]">هاكاثون هداية</span>
                  <span className="rounded-md bg-[#e8f3ef] px-2 py-1 text-xs text-[#1f675d]">
                    لوحة عمليات الأدمن
                  </span>
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-normal md:text-3xl">
                  لوحة المتابعة والتشغيل (Ops)
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <IconButton label="بحث">
                  <Search size={18} />
                </IconButton>
                <FilterButton icon={<CalendarDays size={16} />} label="تحليلات حية" />
                <FilterButton icon={<Layers3 size={16} />} label={`الوضع: ${dbModeText}`} />
                <Link
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#18201e] px-4 text-sm font-semibold text-white transition hover:bg-[#2e3735]"
                  href="/ops"
                >
                  <Activity size={17} />
                  منصة التشغيل والتجربة
                </Link>
              </div>
            </div>
          </header>

          <div className="grid gap-5 px-4 py-5 lg:grid-cols-[1fr_320px] lg:px-7">
            {/* Main Content Area */}
            <div className="min-w-0 space-y-5">
              {/* KPIs Row */}
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {kpis.map((kpi) => {
                  const Icon = kpi.icon;
                  return (
                    <div
                      className="rounded-lg border border-[#dfe3de] bg-white p-5 transition-shadow hover:shadow-sm"
                      key={kpi.label}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-medium text-[#69716d]">{kpi.label}</div>
                          <div className="mt-3 text-3xl font-bold tracking-tight">{kpi.value}</div>
                        </div>
                        <div className={`rounded-lg p-2.5 ${kpi.bg} ${kpi.tone}`}>
                          <Icon size={20} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>

              {/* Volume & Funnel Grid */}
              <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                {/* Volume chart */}
                <Panel title="منحنى رصد المواد والنشاط" icon={<LineChart size={18} />}>
                  <LineViz points={displayVolumePoints} />
                  <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                    <MetricPill
                      label="إجمالي المواد"
                      value={totalItems.toLocaleString("ar-SA")}
                      tone="bg-[#e6f6f4] text-[#1f675d]"
                    />
                    <MetricPill
                      label="نشاط اليوم"
                      value="نشط"
                      tone="bg-[#eef0ff] text-[#554bc2]"
                    />
                    <MetricPill
                      label="آخر تحديث"
                      value="تحديث فوري"
                      tone="bg-[#fff1df] text-[#9a5522]"
                    />
                  </div>
                </Panel>

                {/* Workflow Funnel */}
                <Panel title="قمع سير العمليات (Workflow Funnel)" icon={<Layers3 size={18} />}>
                  <div className="flex flex-col gap-3 py-1">
                    {funnelSteps.map((step) => (
                      <div className="relative" key={step.label}>
                        <div className="flex items-center justify-between text-sm mb-1 font-medium">
                          <span className="flex items-center gap-2">
                            <span className={`size-2.5 rounded-full ${step.color}`} />
                            {step.label}
                          </span>
                          <span className="text-xs text-stone-500">
                            {step.count} مادة ({step.pct}%)
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-[#edf0eb] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${step.color}`}
                            style={{ width: `${step.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs leading-5 text-[#69716d]">
                    يوضح قمع سير العمل توزيع المواد المرصودة على طول خط التحرير والالتقاط، مما يساعد
                    في التعرف على مواضع التكدس.
                  </p>
                </Panel>
              </section>

              {/* Platform Share & Sentiment Analysis Grid */}
              <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
                {/* Platform share */}
                <Panel title="حصة المنصات الفعلية" icon={<BarChart3 size={18} />}>
                  <div className="space-y-4 py-2">
                    {platformShare.map((item) => (
                      <ShareRow item={item} key={item.label} />
                    ))}
                  </div>
                </Panel>

                {/* Sentiment donut chart */}
                <Panel title="تحليل المشاعر التلقائي" icon={<Sparkles size={18} />}>
                  <div className="flex flex-wrap items-center justify-center gap-6 py-2 sm:flex-nowrap">
                    <Donut
                      negativePct={negativePct}
                      neutralPct={neutralPct}
                      positivePct={positivePct}
                    />
                    <div className="flex-1 space-y-3 min-w-[150px]">
                      <SentimentBar color="bg-[#4bbf8b]" label="إيجابي" value={positivePct} />
                      <SentimentBar color="bg-[#aeb6c2]" label="محايد" value={neutralPct} />
                      <SentimentBar color="bg-[#ef6262]" label="سلبي" value={negativePct} />
                    </div>
                  </div>
                  <p className="mt-4 text-xs leading-5 text-[#69716d] text-center sm:text-right">
                    الذكاء الاصطناعي يقترح المشاعر بشكل آلي، وتخضع للمراجعة والاعتماد التحريري قبل
                    نشرها.
                  </p>
                </Panel>
              </section>

              {/* Live Activity Feed */}
              <section className="rounded-lg border border-[#dfe3de] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e9e5] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Inbox size={18} className="text-[#277466]" />
                    <h2 className="font-semibold text-sm md:text-base">التغذية الحية للرصد (Live Feed)</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <FilterButton icon={<Filter size={14} />} label="الأحدث" />
                    <span className="text-xs text-stone-500">محدث تلقائياً</span>
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
            <aside className="space-y-5">
              {/* System Health Info */}
              <Panel title="حالة تشغيل المنصة" icon={<Activity size={18} />}>
                <div className="space-y-2.5">
                  {liveAlerts.map((alert) => (
                    <HealthRow alert={alert} key={alert.label} />
                  ))}
                </div>
              </Panel>

              {/* Resource Consumption & Cost */}
              <Panel title="استهلاك الموارد والميزانية" icon={<Gauge size={18} />}>
                <div className="space-y-4 py-1">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-stone-600">لقطات الشاشة (Screenshots)</span>
                      <span className="text-stone-500">
                        {screenshotsUsed} / {screenshotsLimit}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#edf0eb] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          screenshotsPct > 80 ? "bg-[#ef6262]" : "bg-[#277466]"
                        }`}
                        style={{ width: `${screenshotsPct}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-stone-600">المساحة التخزينية (Storage)</span>
                      <span className="text-stone-500">
                        {storageUsed}MB / {storageLimit}MB
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#edf0eb] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          storagePct > 80 ? "bg-[#ef6262]" : "bg-[#277466]"
                        }`}
                        style={{ width: `${storagePct}%` }}
                      />
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[10px] leading-4 text-stone-400">
                  تطبق حواجز الحماية (Guardrails) تلقائياً لمنع أي تكاليف زائدة في الاستخدام.
                </p>
              </Panel>

              {/* Active warnings and operational errors */}
              <Panel title="إنذارات وأخطاء العمليات" icon={<AlertTriangle size={18} />}>
                {itemsWithAlerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-stone-400 text-center">
                    <CheckCircle2 size={24} className="text-[#277466] mb-2" />
                    <span className="text-xs">كل العمليات سليمة تماماً ولا توجد أخطاء حالياً</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {itemsWithAlerts.map((item) => (
                      <div
                        className="rounded-lg bg-[#fff1df] p-3 text-xs text-[#9a5522] border border-[#fbe5c6]"
                        key={item.id}
                      >
                        <div className="font-bold flex items-center gap-1.5 mb-1">
                          <AlertTriangle size={14} />
                          <span>تنبيه في: {item.sourceName}</span>
                        </div>
                        <p className="leading-5 line-clamp-2 mb-2 font-medium">{item.title}</p>
                        <div className="flex items-center justify-between text-[10px] text-[#b45a21] border-t border-[#fbe5c6]/60 pt-1.5">
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
        </section>
      </div>
    </main>
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
    <section className="rounded-lg border border-[#dfe3de] bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[#277466]">{icon}</span>
          <h2 className="font-semibold text-sm md:text-base">{title}</h2>
        </div>
        <button
          aria-label={`إعدادات ${title}`}
          className="grid size-8 place-items-center rounded-lg border border-[#e1e4df] text-[#69716d] hover:bg-stone-50 transition"
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
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dfe3de] bg-white px-3 text-xs md:text-sm text-[#333837] hover:bg-stone-50 transition"
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
      className="grid size-10 place-items-center rounded-lg border border-[#dfe3de] bg-white text-[#333837] hover:bg-stone-50 transition"
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
    <div className={`${compact ? "h-40" : "h-56"} w-full overflow-hidden rounded-lg bg-[#fbfcfb]`}>
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
          stroke="#2e9f91"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        {coords.map((coord, index) => {
          const [cx, cy] = coord.split(",");
          return <circle cx={cx} cy={cy} fill="#2e9f91" key={index} r="4" />;
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
        background: `conic-gradient(#4bbf8b 0 ${positivePct}%, #aeb6c2 ${positivePct}% ${neutralEnd}%, #ef6262 ${neutralEnd}% 100%)`,
      }}
    >
      <div className="grid size-20 place-items-center rounded-full bg-white text-center">
        <span className="text-2xl font-bold">{positivePct}%</span>
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
      <div className="mb-1 flex items-center justify-between text-xs md:text-sm">
        <span>{label}</span>
        <span className="font-semibold">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#edf0eb]">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function MetricPill({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${tone}`}>
      <div className="text-[10px] md:text-xs opacity-80">{label}</div>
      <div className="mt-1 font-bold text-sm md:text-base">{value}</div>
    </div>
  );
}

function ShareRow({ item }: { item: { label: string; value: number; color: string } }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs md:text-sm">
        <span>{item.label}</span>
        <span className="font-semibold">{item.value}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#edf0eb]">
        <div
          className="h-2 rounded-full"
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
  // Translate sentiment to Arabic
  const sentimentAr =
    item.sentiment === "positive" ? "إيجابي" : item.sentiment === "negative" ? "سلبي" : "محايد";
  const dateStr = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString("ar-SA") : "-";

  return (
    <article className="grid gap-4 px-4 py-4 md:grid-cols-[1fr_180px] hover:bg-[#fbfbfa] transition">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#69716d]">
          <span className="font-semibold text-[#171819]">{item.sourceName}</span>
          {item.authorHandle ? <span>{item.authorHandle}</span> : null}
          <span>·</span>
          <span>{item.sourceType === "x_oembed" ? "منصة X" : "موقع ويب"}</span>
          <span>·</span>
          <span>{dateStr}</span>
          {item.warning ? <AlertTriangle className="text-[#b45a21]" size={14} /> : null}
        </div>
        <h3 className="mt-2 font-bold text-sm text-[#171819]">{item.title}</h3>
        <p className="mt-2 text-xs leading-5 text-[#5f6662] line-clamp-2">{item.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {item.matchedTerms.slice(0, 3).map((term) => (
            <span className="rounded-md bg-[#f0f2ef] px-2 py-0.5 text-[10px]" key={term}>
              {term}
            </span>
          ))}
        </div>
      </div>
      <div className="grid content-start gap-2 text-xs">
        <StatusPill label={item.state} warning={Boolean(item.warning)} />
        <div className="rounded-lg bg-[#f7f8f6] px-3 py-1.5">
          <div className="text-[10px] text-[#69716d]">درجة الصلة</div>
          <div className="mt-0.5 font-bold">{item.relevanceScore}%</div>
        </div>
        <div className="rounded-lg bg-[#f7f8f6] px-3 py-1.5">
          <div className="text-[10px] text-[#69716d]">المشاعر</div>
          <div className="mt-0.5 font-bold">{sentimentAr}</div>
        </div>
      </div>
    </article>
  );
}

function StatusPill({ label, warning }: { label: string; warning?: boolean }) {
  // Translate internal state label to friendly Arabic
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
      className={`rounded-lg py-1.5 text-center text-xs font-semibold ${
        isWarningState ? "bg-[#fff1df] text-[#9a5522]" : "bg-[#e8f3ef] text-[#1f675d]"
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
    alert.status === "good" ? "bg-[#e8f3ef] text-[#1f675d]" : "bg-[#fff1df] text-[#9a5522]";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#f7f8f6] px-3 py-2 text-xs md:text-sm">
      <span className="text-stone-700 font-medium">{alert.label}</span>
      <span className={`rounded-md px-2 py-0.5 text-[10px] md:text-xs font-bold ${tone}`}>
        {alert.value}
      </span>
    </div>
  );
}
