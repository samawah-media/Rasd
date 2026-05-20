import {
  Activity,
  AlertTriangle,
  Archive,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Filter,
  Gauge,
  Inbox,
  Layers3,
  Link2,
  LineChart,
  LockKeyhole,
  MessageSquareText,
  MoreHorizontal,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { adminRoles } from "@/lib/auth-config";
import { requireRole } from "@/server/auth";

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

const kpis = [
  {
    label: "إجمالي المواد",
    value: "3,142",
    change: "+12%",
    icon: MessageSquareText,
    tone: "text-[#277466]",
  },
  {
    label: "جاهزة للتقرير",
    value: "186",
    change: "+24",
    icon: FileText,
    tone: "text-[#5b55bd]",
  },
  {
    label: "معدل الإيجابية",
    value: "68%",
    change: "+9%",
    icon: TrendingUp,
    tone: "text-[#2f7d48]",
  },
  {
    label: "متوسط المراجعة",
    value: "41 د",
    change: "-18%",
    icon: Clock3,
    tone: "text-[#b45a21]",
  },
];

const volumePoints = [34, 42, 38, 61, 57, 76, 49, 55, 70, 86, 68, 92];
const sentimentPoints = [24, 38, 33, 46, 54, 44, 61, 58, 72, 67, 79, 74];

const platformShare = [
  { label: "X", value: 38, color: "#111111" },
  { label: "مواقع إخبارية", value: 27, color: "#39a0a9" },
  { label: "صحف", value: 19, color: "#ee9b35" },
  { label: "رسمي", value: 16, color: "#7568d8" },
];

const liveFeed = [
  {
    source: "حساب هاكاثون هداية",
    handle: "@Hidayathon",
    platform: "X",
    time: "قبل 12 دقيقة",
    title: "تفاعل واسع مع إعلان الفرق المتأهلة في هاكاثون هداية",
    text: "المنشور يذكر الهاكاثون مباشرة، ويحمل نبرة إيجابية من المشاركين والجهات التقنية.",
    sentiment: "إيجابي",
    relevance: 96,
    state: "جاهزة للتقرير",
    matched: ["هداية", "هاكاثون"],
  },
  {
    source: "صحيفة رقمية",
    handle: "news.example",
    platform: "News",
    time: "قبل 31 دقيقة",
    title: "جامعة تستضيف مبادرة ابتكارية للمهتمين بالهداية الرقمية",
    text: "الخبر يحتاج مراجعة صلة لأن العنوان لا يذكر اسم الفعالية، لكن النص الداخلي مطابق لقواعد الكلمات.",
    sentiment: "محايد",
    relevance: 74,
    state: "تحتاج مراجعة",
    matched: ["هداية"],
  },
  {
    source: "رابط يدوي",
    handle: "manual intake",
    platform: "Web",
    time: "قبل 48 دقيقة",
    title: "مادة مرشحة تعذر التقاط لقطة نهائية لها",
    text: "الاعتماد ممكن بتحذير واضح أو برفع لقطة يدوية، ولا تدخل التقرير بدون قرار تحريري.",
    sentiment: "إيجابي",
    relevance: 88,
    state: "فشل الالتقاط",
    matched: ["هاكاثون", "هداية"],
    warning: true,
  },
];

const filters = [
  ["X", "1,184"],
  ["أخبار", "842"],
  ["مواقع", "611"],
  ["رسمي", "218"],
  ["يدوي", "287"],
];

const alerts = [
  { label: "Capture success", value: "86%", status: "good" },
  { label: "Review backlog", value: "3 مواد", status: "warning" },
  { label: "X API", value: "غير مفعل", status: "warning" },
  { label: "PDF failures", value: "0%", status: "good" },
];

export default async function Home() {
  await requireRole(adminRoles, "/");

  return (
    <main className="min-h-screen bg-[#f5f6f4] text-[#171819]">
      <div className="grid min-h-screen lg:grid-cols-[264px_1fr]">
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
                  RLS، حدود تكلفة، وروابط مشاركة آمنة مفعلة في دورة العمل.
                </p>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-10 border-b border-[#dfe3de] bg-[#fbfbfa]/95 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-7">
              <div>
                <div className="flex items-center gap-2 text-sm text-[#69716d]">
                  <span>مشروع</span>
                  <span className="font-semibold text-[#171819]">هاكاثون هداية</span>
                  <span className="rounded-md bg-[#e8f3ef] px-2 py-1 text-xs text-[#1f675d]">
                    مباشر
                  </span>
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-normal md:text-3xl">
                  لوحة الرصد والتحليل
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <IconButton label="بحث">
                  <Search size={18} />
                </IconButton>
                <FilterButton icon={<CalendarDays size={16} />} label="آخر 30 يوم" />
                <FilterButton icon={<Layers3 size={16} />} label="كل المنصات" />
                <Link
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#18201e] px-4 text-sm font-semibold text-white"
                  href="/ops"
                >
                  <Activity size={17} />
                  تشغيل دورة العمل
                </Link>
              </div>
            </div>
          </header>

          <div className="grid gap-5 px-4 py-5 lg:grid-cols-[1fr_320px] lg:px-7">
            <div className="min-w-0 space-y-5">
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {kpis.map((kpi) => {
                  const Icon = kpi.icon;
                  return (
                    <div className="rounded-lg border border-[#dfe3de] bg-white p-4" key={kpi.label}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm text-[#69716d]">{kpi.label}</div>
                          <div className="mt-4 text-3xl font-semibold">{kpi.value}</div>
                        </div>
                        <Icon className={kpi.tone} size={22} />
                      </div>
                      <div className="mt-4 text-sm font-medium text-[#277466]">{kpi.change}</div>
                    </div>
                  );
                })}
              </section>

              <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
                <Panel title="منحنى الذكر والوصول" icon={<LineChart size={18} />}>
                  <LineViz points={volumePoints} />
                  <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                    <MetricPill label="Mentions" value="3.1K" tone="bg-[#e6f6f4] text-[#1f675d]" />
                    <MetricPill label="Reach" value="1.8M" tone="bg-[#eef0ff] text-[#554bc2]" />
                    <MetricPill label="Peak" value="16 فبراير" tone="bg-[#fff1df] text-[#9a5522]" />
                  </div>
                </Panel>

                <Panel title="توزيع المشاعر" icon={<Sparkles size={18} />}>
                  <div className="flex items-center gap-5">
                    <Donut />
                    <div className="flex-1 space-y-3">
                      <SentimentBar label="إيجابي" value={68} color="bg-[#4bbf8b]" />
                      <SentimentBar label="محايد" value={24} color="bg-[#aeb6c2]" />
                      <SentimentBar label="سلبي" value={8} color="bg-[#ef6262]" />
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-[#69716d]">
                    AI يقترح التصنيف، والمحرر يعتمد النتيجة قبل دخول المادة للتقرير.
                  </p>
                </Panel>
              </section>

              <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <Panel title="حصة المنصات" icon={<BarChart3 size={18} />}>
                  <div className="space-y-3">
                    {platformShare.map((item) => (
                      <ShareRow item={item} key={item.label} />
                    ))}
                  </div>
                </Panel>

                <Panel title="اتجاه الصلة التحريرية" icon={<TrendingUp size={18} />}>
                  <LineViz compact points={sentimentPoints} />
                  <div className="mt-4 rounded-lg bg-[#f7f8f6] p-3 text-sm leading-6 text-[#5f6662]">
                    أعلى ارتفاع في الصلة جاء من X والمواقع الرسمية، بينما الأخبار العامة تحتاج مراجعة بشرية أكبر.
                  </div>
                </Panel>
              </section>

              <section className="rounded-lg border border-[#dfe3de] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e9e5] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Inbox size={18} />
                    <h2 className="font-semibold">Live Feed للمراجعة</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <FilterButton icon={<Filter size={16} />} label="الأحدث أولا" />
                    <IconButton label="المزيد">
                      <MoreHorizontal size={18} />
                    </IconButton>
                  </div>
                </div>
                <div className="divide-y divide-[#edf0eb]">
                  {liveFeed.map((item) => (
                    <FeedItem item={item} key={item.title} />
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <Panel title="فلاتر الرصد" icon={<Filter size={18} />}>
                <div className="space-y-3">
                  {filters.map(([label, count]) => (
                    <label className="flex items-center justify-between gap-3 text-sm" key={label}>
                      <span className="flex items-center gap-2">
                        <input className="size-4 accent-[#277466]" defaultChecked type="checkbox" />
                        {label}
                      </span>
                      <span className="text-[#69716d]">{count}</span>
                    </label>
                  ))}
                </div>
              </Panel>

              <Panel title="حالة التشغيل" icon={<Activity size={18} />}>
                <div className="space-y-2">
                  {alerts.map((alert) => (
                    <HealthRow alert={alert} key={alert.label} />
                  ))}
                </div>
              </Panel>

              <Panel title="إصدارات التقرير" icon={<Archive size={18} />}>
                <div className="space-y-3">
                  {["الإصدار 5 - منشور", "الإصدار 6 - مسودة", "PDF export - جاهز"].map((item) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-lg bg-[#f7f8f6] px-3 py-3 text-sm"
                      key={item}
                    >
                      <span>{item}</span>
                      <ExternalLink size={15} />
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="إنذارات مبكرة" icon={<AlertTriangle size={18} />}>
                <div className="space-y-3 text-sm">
                  <Risk label="نسبة الرفض" value="18%" ok />
                  <Risk label="فشل الالتقاط" value="14%" />
                  <Risk label="تراكم المراجعة" value="3 مواد" ok />
                </div>
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
    <section className="rounded-lg border border-[#dfe3de] bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[#277466]">{icon}</span>
          <h2 className="font-semibold">{title}</h2>
        </div>
        <button
          aria-label={`إعدادات ${title}`}
          className="grid size-8 place-items-center rounded-lg border border-[#e1e4df] text-[#69716d]"
          type="button"
        >
          <Settings size={15} />
        </button>
      </div>
      {children}
    </section>
  );
}

function FilterButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dfe3de] bg-white px-3 text-sm text-[#333837]"
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
      className="grid size-10 place-items-center rounded-lg border border-[#dfe3de] bg-white text-[#333837]"
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
        aria-label="منحنى بيانات"
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

function Donut() {
  return (
    <div
      aria-label="68% إيجابي، 24% محايد، 8% سلبي"
      className="grid size-32 shrink-0 place-items-center rounded-full"
      role="img"
      style={{
        background:
          "conic-gradient(#4bbf8b 0 68%, #aeb6c2 68% 92%, #ef6262 92% 100%)",
      }}
    >
      <div className="grid size-20 place-items-center rounded-full bg-white text-center">
        <span className="text-2xl font-semibold">68%</span>
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
      <div className="mb-1 flex items-center justify-between text-sm">
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
      <div className="text-xs opacity-80">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function ShareRow({ item }: { item: { label: string; value: number; color: string } }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
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
    source: string;
    handle: string;
    platform: string;
    time: string;
    title: string;
    text: string;
    sentiment: string;
    relevance: number;
    state: string;
    matched: string[];
    warning?: boolean;
  };
}) {
  return (
    <article className="grid gap-4 px-4 py-4 md:grid-cols-[1fr_180px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#69716d]">
          <span className="font-semibold text-[#171819]">{item.source}</span>
          <span>{item.handle}</span>
          <span>·</span>
          <span>{item.platform}</span>
          <span>·</span>
          <span>{item.time}</span>
          {item.warning ? <AlertTriangle className="text-[#b45a21]" size={16} /> : null}
        </div>
        <h3 className="mt-2 font-semibold">{item.title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#5f6662]">{item.text}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {item.matched.map((term) => (
            <span className="rounded-md bg-[#f0f2ef] px-2 py-1 text-xs" key={term}>
              {term}
            </span>
          ))}
        </div>
      </div>
      <div className="grid content-start gap-2 text-sm">
        <StatusPill label={item.state} warning={item.warning} />
        <div className="rounded-lg bg-[#f7f8f6] px-3 py-2">
          <div className="text-xs text-[#69716d]">درجة الصلة</div>
          <div className="mt-1 font-semibold">{item.relevance}%</div>
        </div>
        <div className="rounded-lg bg-[#f7f8f6] px-3 py-2">
          <div className="text-xs text-[#69716d]">المشاعر</div>
          <div className="mt-1 font-semibold">{item.sentiment}</div>
        </div>
      </div>
    </article>
  );
}

function StatusPill({ label, warning }: { label: string; warning?: boolean }) {
  return (
    <span
      className={`rounded-lg px-3 py-2 text-center text-sm font-semibold ${
        warning ? "bg-[#fff1df] text-[#9a5522]" : "bg-[#e8f3ef] text-[#1f675d]"
      }`}
    >
      {label}
    </span>
  );
}

function HealthRow({
  alert,
}: {
  alert: { label: string; value: string; status: string };
}) {
  const tone =
    alert.status === "good"
      ? "bg-[#e8f3ef] text-[#1f675d]"
      : "bg-[#fff1df] text-[#9a5522]";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#f7f8f6] px-3 py-2 text-sm">
      <span>{alert.label}</span>
      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${tone}`}>
        {alert.value}
      </span>
    </div>
  );
}

function Risk({ label, value, ok = false }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2">
        {ok ? <CheckCircle2 className="text-[#277466]" size={16} /> : <Bell className="text-[#b45a21]" size={16} />}
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
