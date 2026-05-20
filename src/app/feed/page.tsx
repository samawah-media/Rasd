import {
  AlertTriangle,
  Archive,
  ArrowUpDown,
  BarChart3,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock3,
  Eye,
  FilePlus2,
  Filter,
  Inbox,
  Link2,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { adminRoles } from "@/lib/auth-config";
import { requireRole } from "@/server/auth";

const feedItems = [
  {
    id: "m-101",
    platform: "X",
    source: "حساب هاكاثون هداية",
    author: "@Hidayathon",
    time: "10:20 ص",
    title: "إعلان الفرق المتأهلة يرفع التفاعل حول هاكاثون هداية",
    excerpt:
      "منشور رسمي يحقق تفاعلًا مرتفعًا، ويتضمن كلمات مطابقة مباشرة وارتباطًا واضحًا بالفعالية.",
    sentiment: "إيجابي",
    state: "جاهزة للتقرير",
    relevance: 96,
    reach: "42K",
    capture: "Report-grade",
    matched: ["هداية", "هاكاثون", "الفرق المتأهلة"],
    tone: "ready",
  },
  {
    id: "m-102",
    platform: "News",
    source: "صحيفة رقمية",
    author: "فريق التحرير",
    time: "11:05 ص",
    title: "جامعة تستضيف مبادرة ابتكارية مرتبطة بالهداية الرقمية",
    excerpt:
      "العنوان قريب من نطاق المشروع، لكن يحتاج محررًا لتأكيد أن المقصود هو الفعالية نفسها وليس موضوعًا عامًا.",
    sentiment: "محايد",
    state: "تحتاج مراجعة",
    relevance: 74,
    reach: "18K",
    capture: "Evidence-lite",
    matched: ["هداية"],
    tone: "review",
  },
  {
    id: "m-103",
    platform: "Web",
    source: "رابط يدوي",
    author: "مشارك",
    time: "12:14 م",
    title: "تجربة مشارك في هاكاثون هداية مع صور من موقع الفعالية",
    excerpt:
      "المادة ذات صلة عالية، لكن الالتقاط النهائي فشل بسبب بطء الصفحة. النشر يتطلب قبول تحذير أو رفع لقطة يدوية.",
    sentiment: "إيجابي",
    state: "فشل الالتقاط",
    relevance: 88,
    reach: "4K",
    capture: "Capture failed",
    matched: ["هاكاثون", "هداية"],
    tone: "danger",
  },
  {
    id: "m-104",
    platform: "Official",
    source: "موقع جهة شريكة",
    author: "إدارة التواصل",
    time: "01:40 م",
    title: "إعلان شراكة تقنية ضمن برنامج هاكاثون هداية",
    excerpt:
      "مصدر رسمي موثوق، ودرجة الصلة مرتفعة. يحتاج لقطة نهائية قبل إضافته لنسخة التقرير القادمة.",
    sentiment: "إيجابي",
    state: "معتمد بانتظار الالتقاط",
    relevance: 91,
    reach: "12K",
    capture: "Preview",
    matched: ["شراكة", "هاكاثون هداية"],
    tone: "capture",
  },
];

const sourceFilters = [
  ["X", "1,184", true],
  ["أخبار", "842", true],
  ["مواقع", "611", true],
  ["رسمي", "218", true],
  ["يدوي", "287", false],
] as const;

const workflowCounts = [
  ["تحتاج مراجعة", 42, "#f59e0b"],
  ["معتمدة", 186, "#10b981"],
  ["فشل الالتقاط", 14, "#ef4444"],
  ["داخل التقرير", 97, "#6366f1"],
] as const;

const selectedItem = feedItems[0];

export default async function FeedPage() {
  await requireRole(adminRoles, "/feed");

  return (
    <main className="min-h-screen bg-[#f5f6f4] text-[#171819]">
      <header className="border-b border-[#dfe3de] bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-4 lg:px-7">
          <div>
            <div className="flex items-center gap-2 text-sm text-[#69716d]">
              <Link className="hover:text-[#1f675d]" href="/">
                لوحة الرصد
              </Link>
              <span>/</span>
              <span className="font-semibold text-[#171819]">Live Feed</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold md:text-3xl">
              صفحة الرصد الحي
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToolbarButton icon={<CalendarDays size={16} />} label="آخر 30 يوم" />
            <ToolbarButton icon={<ArrowUpDown size={16} />} label="الأحدث أولا" />
            <ToolbarButton icon={<SlidersHorizontal size={16} />} label="تخصيص الأعمدة" />
            <Link
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#18201e] px-4 text-sm font-semibold text-white"
              href="/ops"
            >
              <FilePlus2 size={17} />
              إدخال رابط
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 lg:grid-cols-[280px_1fr_340px] lg:px-7">
        <aside className="space-y-5">
          <section className="rounded-lg border border-[#dfe3de] bg-white p-4">
            <div className="flex items-center gap-2">
              <Search className="text-[#277466]" size={18} />
              <h2 className="font-semibold">بحث وفلاتر</h2>
            </div>
            <div className="mt-4">
              <label className="text-sm text-[#69716d]" htmlFor="feed-search">
                كلمة أو رابط
              </label>
              <input
                className="mt-2 h-10 w-full rounded-lg border border-[#dfe3de] bg-[#fbfbfa] px-3 text-sm"
                defaultValue="هداية"
                id="feed-search"
              />
            </div>
            <div className="mt-5 space-y-3">
              <FilterTitle title="المصادر" />
              {sourceFilters.map(([label, count, checked]) => (
                <label className="flex items-center justify-between gap-3 text-sm" key={label}>
                  <span className="flex items-center gap-2">
                    <input className="size-4 accent-[#277466]" defaultChecked={checked} type="checkbox" />
                    {label}
                  </span>
                  <span className="text-[#69716d]">{count}</span>
                </label>
              ))}
            </div>
            <div className="mt-5 space-y-3">
              <FilterTitle title="الحالة التحريرية" />
              {workflowCounts.map(([label, count, color]) => (
                <div className="flex items-center justify-between gap-3 text-sm" key={label}>
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                    {label}
                  </span>
                  <span className="text-[#69716d]">{count}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-[#dfe3de] bg-white p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="text-[#277466]" size={18} />
              <h2 className="font-semibold">ملخص سريع</h2>
            </div>
            <div className="mt-4 grid gap-3">
              <MiniStat label="مواد اليوم" value="214" />
              <MiniStat label="نسبة الرفض" value="18%" />
              <MiniStat label="معدل الالتقاط" value="86%" />
            </div>
          </section>
        </aside>

        <section className="min-w-0 rounded-lg border border-[#dfe3de] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e9e5] px-4 py-3">
            <div className="flex items-center gap-2">
              <Inbox className="text-[#277466]" size={19} />
              <h2 className="font-semibold">المواد المرصودة</h2>
              <span className="rounded-md bg-[#eef3ef] px-2 py-1 text-xs text-[#1f675d]">
                89 جديدة
              </span>
            </div>
            <ToolbarButton icon={<Filter size={16} />} label="فلاتر متقدمة" />
          </div>

          <div className="divide-y divide-[#edf0eb]">
            {feedItems.map((item) => (
              <article
                className={`grid gap-4 px-4 py-4 transition hover:bg-[#fbfcfb] xl:grid-cols-[1fr_190px] ${
                  item.id === selectedItem.id ? "bg-[#fbfcfb]" : ""
                }`}
                key={item.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-[#69716d]">
                    <PlatformBadge platform={item.platform} />
                    <span className="font-semibold text-[#171819]">{item.source}</span>
                    <span>{item.author}</span>
                    <span>·</span>
                    <span>{item.time}</span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold leading-7">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#5f6662]">{item.excerpt}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.matched.map((term) => (
                      <span className="rounded-md bg-[#f0f2ef] px-2 py-1 text-xs" key={term}>
                        {term}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid content-start gap-2 text-sm">
                  <StateBadge tone={item.tone} label={item.state} />
                  <Fact label="الصلة" value={`${item.relevance}%`} />
                  <Fact label="الوصول" value={item.reach} />
                  <Fact label="الدليل" value={item.capture} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-[#dfe3de] bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm text-[#69716d]">
                  <Eye size={16} />
                  المادة المحددة
                </div>
                <h2 className="mt-2 font-semibold leading-7">{selectedItem.title}</h2>
              </div>
              <PlatformBadge platform={selectedItem.platform} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <Fact label="المصدر" value={selectedItem.source} />
              <Fact label="المشاعر" value={selectedItem.sentiment} />
              <Fact label="الصلة" value={`${selectedItem.relevance}%`} />
              <Fact label="الدليل" value={selectedItem.capture} />
            </div>

            <div className="mt-4 rounded-lg border border-[#dfe3de] bg-[#fbfbfa] p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles size={16} />
                سبب الدخول
              </div>
              <p className="mt-2 text-sm leading-6 text-[#5f6662]">
                دخلت المادة لأنها تطابق الكلمات الإلزامية والاختيارية، ومصدرها رسمي، ونبرة التفاعل إيجابية.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <ActionButton icon={<CheckCircle2 size={16} />} label="اعتماد" tone="primary" />
              <ActionButton icon={<XCircle size={16} />} label="رفض" />
              <ActionButton icon={<Camera size={16} />} label="التقاط" />
              <ActionButton icon={<Archive size={16} />} label="للتقرير" />
            </div>
          </section>

          <section className="rounded-lg border border-[#dfe3de] bg-white p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-[#277466]" size={18} />
              <h2 className="font-semibold">حواجز السلامة</h2>
            </div>
            <div className="mt-4 space-y-3">
              <SafetyItem icon={<CheckCircle2 size={16} />} text="لا تدخل مادة التقرير قبل المراجعة." />
              <SafetyItem icon={<Camera size={16} />} text="الالتقاط النهائي Job مستقل." />
              <SafetyItem icon={<AlertTriangle size={16} />} text="النشر بلا لقطة يحتاج تحذير صريح." />
              <SafetyItem icon={<Link2 size={16} />} text="الروابط الآمنة قابلة للإلغاء والانتهاء." />
            </div>
          </section>

          <section className="rounded-lg border border-[#dfe3de] bg-white p-4">
            <div className="flex items-center gap-2">
              <Clock3 className="text-[#277466]" size={18} />
              <h2 className="font-semibold">نشاط حديث</h2>
            </div>
            <div className="mt-4 space-y-3 text-sm text-[#5f6662]">
              <Timeline text="اعتماد مادة من X بواسطة المحرر." />
              <Timeline text="فشل التقاط رابط يدوي وإضافة سبب الفشل." />
              <Timeline text="إنشاء نسخة تقرير جديدة كمسودة." />
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function ToolbarButton({ icon, label }: { icon: React.ReactNode; label: string }) {
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

function FilterTitle({ title }: { title: string }) {
  return <div className="text-sm font-semibold text-[#333837]">{title}</div>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f7f8f6] px-3 py-3">
      <div className="text-xs text-[#69716d]">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const classes: Record<string, string> = {
    X: "bg-[#191919] text-white",
    News: "bg-[#e6f6f4] text-[#1f675d]",
    Web: "bg-[#fff1df] text-[#9a5522]",
    Official: "bg-[#eef0ff] text-[#554bc2]",
  };
  return (
    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${classes[platform] ?? "bg-[#f0f2ef]"}`}>
      {platform}
    </span>
  );
}

function StateBadge({ tone, label }: { tone: string; label: string }) {
  const classes: Record<string, string> = {
    ready: "bg-[#e8f3ef] text-[#1f675d]",
    review: "bg-[#fff1df] text-[#9a5522]",
    danger: "bg-[#feecec] text-[#b42323]",
    capture: "bg-[#eef0ff] text-[#554bc2]",
  };
  return <span className={`rounded-lg px-3 py-2 text-center font-semibold ${classes[tone]}`}>{label}</span>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f7f8f6] px-3 py-2">
      <div className="text-xs text-[#69716d]">{label}</div>
      <div className="mt-1 truncate font-semibold">{value}</div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "primary";
}) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold ${
        tone === "primary"
          ? "bg-[#18201e] text-white"
          : "border border-[#dfe3de] bg-white text-[#333837]"
      }`}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function SafetyItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2 text-sm leading-6 text-[#5f6662]">
      <span className="mt-1 text-[#277466]">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function Timeline({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-2 size-2 rounded-full bg-[#277466]" />
      <span>{text}</span>
    </div>
  );
}
