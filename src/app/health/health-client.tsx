"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Shield,
  XCircle,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { BrandIcon, brandFromLabel } from "@/components/BrandIcon";

type AutomationRun = {
  status: string;
  fetchedCount: number;
  failureReason: string | null;
  startedAt: string;
  finishedAt: string | null;
};

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
      tiktok_research?: string;
      instagram_public_profile?: string;
    };
    usage?: {
      xReadsToday: number;
      xReadsThisMonth: number;
      aiTokensThisMonth: number;
      screenshotsThisMonth: number;
      storageMb: number;
    };
    automation?: {
      schemaReady: boolean;
      schemaError?: string;
      cronSecretConfigured: boolean;
      connectorCronPath: string;
      connectorCronScheduleUtc: string;
      mocksEnabled: boolean;
      mediaMetadataExtractor?: {
        enabled: boolean;
        mode: "auto" | "yt-dlp";
        ytDlpAvailable: boolean;
        cookiesConfigured: boolean;
        proxyConfigured: boolean;
        status: "healthy" | "degraded" | "disabled";
        message: string;
        lastError?: string;
      };
      apify?: {
        configured: boolean;
        status: "healthy" | "not_configured";
        message: string;
      };
      sourceRulesCount: number;
      activeSourceRulesCount: number;
      queuedJobsCount: number;
      failedJobsCount: number;
      latestRun: AutomationRun | null;
      latestSuccessfulRun?: AutomationRun | null;
      latestFailedJob: {
        status: string;
        failureReason: string | null;
        createdAt: string;
      } | null;
      tiktok: {
        status?: string;
        message?: string;
        enabled: boolean;
        credentialsConfigured: boolean;
        activeRulesCount: number;
      };
      instagram: {
        status?: string;
        message?: string;
        enabled: boolean;
        extractorConfigured: boolean;
        activeRulesCount: number;
      };
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
  initialSources: {
    id: string;
    name: string;
    type: string;
    lastCheckedAt?: string;
    lastSuccessAt?: string;
    lastError?: string;
  }[];
}

type ServiceState = "healthy" | "warning" | "down";
type HealthService = {
  id: string;
  name: string;
  title: string;
  logo: string;
  state: ServiceState;
  message: string;
  last: string;
  next: string;
};

export default function HealthClient({ initialHealth, initialLogs, initialSources }: HealthClientProps) {
  const [health, setHealth] = useState(initialHealth);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const services = useMemo<HealthService[]>(
    () => [
      {
        id: "apify",
        name: "Apify",
        title: "استخراج البيانات",
        logo: "A",
        state: health.automation?.apify?.configured ? "healthy" : "warning",
        message: health.automation?.apify?.message ?? "لم يتم فحص إعدادات Apify بعد.",
        last: latestRunText(health.automation?.latestRun?.finishedAt ?? health.automation?.latestRun?.startedAt),
        next: health.automation?.connectorCronScheduleUtc ?? "حسب إعدادات Vercel",
      },
      {
        id: "supabase",
        name: "قاعدة البيانات Supabase",
        title: "تخزين المواد والصلاحيات",
        logo: "S",
        state: normalizeState(health.status),
        message: health.status === "good" || health.status === "healthy" || health.status === "ok" ? "الاتصال بقاعدة البيانات مستقر." : "راجع اتصال قاعدة البيانات.",
        last: "منذ دقيقة",
        next: "مراقبة مستمرة",
      },
      {
        id: "cron",
        name: "Vercel Cron",
        title: "المهام المجدولة",
        logo: "▲",
        state: health.automation?.cronSecretConfigured ? "healthy" : "warning",
        message: health.automation?.cronSecretConfigured
          ? "تم ضبط سر المهام المجدولة؛ تفاصيل التنفيذ تظهر في لوحة الرصد أدناه."
          : "أضف CRON_SECRET حتى تعمل المهام المحمية.",
        last: latestRunText(health.automation?.latestRun?.finishedAt ?? health.automation?.latestRun?.startedAt),
        next: health.automation?.connectorCronScheduleUtc ? `خلال ${health.automation.connectorCronScheduleUtc}` : "غير محدد",
      },
      {
        id: "x",
        name: "بحث X / Grok X",
        title: "بحث المنشورات العامة",
        logo: "X",
        state: normalizeState(health.connectors?.x_recent_search ?? "not_configured"),
        message: connectorMessage(health.connectors?.x_recent_search),
        last: `${(health.usage?.xReadsToday ?? 0).toLocaleString("ar-SA")} طلب اليوم`,
        next: "حسب الرصيد والمفاتيح",
      },
      {
        id: "ytdlp",
        name: "yt-dlp",
        title: "تفاصيل TikTok/Instagram",
        logo: "♪",
        state: mediaExtractorState(health.automation?.mediaMetadataExtractor),
        message: health.automation?.mediaMetadataExtractor?.message ?? "لم يتم تفعيل فاحص بيانات الفيديو.",
        last: health.automation?.mediaMetadataExtractor?.ytDlpAvailable ? "متوفر" : "غير متوفر",
        next: `cookies: ${health.automation?.mediaMetadataExtractor?.cookiesConfigured ? "موجودة" : "غير مضبوطة"} · proxy: ${
          health.automation?.mediaMetadataExtractor?.proxyConfigured ? "موجود" : "غير مضبوط"
        }`,
      },
    ],
    [health],
  );

  const activityLogs = useMemo(
    () =>
      initialLogs.slice(0, 8).map((log) => ({
        id: log.id,
        level: log.action.includes("failed") || log.action.includes("error") ? "error" : log.action.includes("created") || log.action.includes("ingested") ? "success" : "info",
        time: new Date(log.createdAt).toLocaleString("ar-SA", { hour12: false }),
        message: readableLog(log.action, log.entityId),
      })),
    [initialLogs],
  );

  const latestRssPoll = useMemo(() => initialLogs.find((log) => log.action === "source.rss_polled"), [initialLogs]);
  const latestRssFailure = useMemo(() => initialLogs.find((log) => log.action === "source.rss_poll_failed"), [initialLogs]);
  const latestSuccessfulConnectorRun =
    health.automation?.latestSuccessfulRun ?? (health.automation?.latestRun?.status === "success" ? health.automation.latestRun : null);
  const latestSuccessAt = latestTimestamp([
    latestRssPoll?.createdAt,
    latestSuccessfulConnectorRun?.finishedAt ?? latestSuccessfulConnectorRun?.startedAt,
  ]);
  const rssCreated = numberFromMetadata(latestRssPoll?.metadata, "created");
  const rssFetched = numberFromMetadata(latestRssPoll?.metadata, "fetched");
  const rssSkipped = numberFromMetadata(latestRssPoll?.metadata, "skipped");
  const rssFailed = numberFromMetadata(latestRssPoll?.metadata, "failed");
  const rssLowConfidence = numberFromMetadata(latestRssPoll?.metadata, "lowConfidence");
  const connectorCreated = latestSuccessfulConnectorRun?.fetchedCount ?? 0;
  const openErrors = (health.automation?.failedJobsCount ?? 0) + rssFailed;
  const monitoringIsFresh = latestSuccessAt ? !isOlderThanHours(latestSuccessAt, 24) : false;
  const latestRssFailureAt = latestRssFailure?.createdAt;
  const rssFailureIsUnresolved = latestRssFailureAt
    ? !latestRssPoll || new Date(latestRssPoll.createdAt).getTime() < new Date(latestRssFailureAt).getTime()
    : false;
  const rssFailureOver24h = Boolean(latestRssFailureAt && rssFailureIsUnresolved && isOlderThanHours(latestRssFailureAt, 24));
  const staleRssSources = initialSources.filter((source) => {
    if (source.type !== "rss" || !source.lastError) return false;
    const referenceTime = source.lastSuccessAt ?? source.lastCheckedAt;
    return referenceTime ? isOlderThanHours(referenceTime, 24) : true;
  });
  const activeRssSourcesCount = initialSources.filter((source) => source.type === "rss").length;
  const needsSetupAction =
    !health.automation?.cronSecretConfigured ||
    !health.automation?.apify?.configured ||
    Boolean(health.automation?.mocksEnabled);

  const triggerRefresh = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/admin/health");
      if (response.ok) setHealth(await response.json());
    } finally {
      setIsRefreshing(false);
    }
  };

  const healthyCount = services.filter((service) => service.state === "healthy").length;
  const warningCount = services.filter((service) => service.state === "warning").length;
  const downCount = services.filter((service) => service.state === "down").length;

  return (
    <AppShell>
      <div className="min-h-screen bg-[#f7f8fa] p-4 md:p-5" dir="rtl">
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(560px,1.34fr)_minmax(300px,0.82fr)]">
          <aside className="rounded-lg border border-[var(--color-border)] bg-white p-4 shadow-sm">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--color-text-muted)]">
                  <Shield className="h-4 w-4 text-[#2383E2]" />
                  <span>ملخص التشغيل</span>
                </div>
                <h2 className="mt-2 text-xl font-black text-[var(--color-text-title)]">حالة المنصة</h2>
              </div>
              <Link
                href="/ops"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] transition hover:border-[#2383E2]/40 hover:text-[#2383E2]"
                title="الرصد اليومي"
              >
                <ExternalLink className="h-4 w-4" />
              </Link>
            </header>

            <div className="grid gap-3">
              <HealthMetric label="يعمل" value={healthyCount.toLocaleString("ar-SA")} tone="green" />
              <HealthMetric label="تحذير" value={warningCount.toLocaleString("ar-SA")} tone="orange" />
              <HealthMetric label="متوقف" value={downCount.toLocaleString("ar-SA")} tone="red" />
            </div>

            <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[#fbfbfc] p-3">
              <h3 className="text-sm font-black text-[var(--color-text-title)]">استهلاك هذا الشهر</h3>
              <UsageLine label="طلبات X" value={health.usage?.xReadsThisMonth ?? 0} limit={6000} />
              <UsageLine label="لقطات الشاشة" value={health.usage?.screenshotsThisMonth ?? 0} limit={2000} />
              <UsageLine label="التخزين MB" value={Math.round(health.usage?.storageMb ?? 0)} limit={500} />
            </div>
          </aside>

          <main className="rounded-lg border border-[var(--color-border)] bg-white p-4 shadow-sm">
            <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Shield className="h-7 w-7 text-[var(--color-text-muted)]" />
                  <h1 className="text-2xl font-black tracking-tight text-[var(--color-text-title)]">صحة الربط</h1>
                </div>
                <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">
                  حالة الخدمات الخارجية والتكاملات التي تعتمد عليها المنصة.
                </p>
              </div>
              <button
                type="button"
                onClick={triggerRefresh}
                disabled={isRefreshing}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1f6feb] px-4 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#195ec9] disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                افحص الآن
              </button>
            </header>

            <div className="space-y-3">
              {services.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>

            {health.automation?.latestFailedJob && (
              <div className="mt-4 rounded-lg border border-[#f1b6aa] bg-[#fff1ed] p-3 text-xs font-bold leading-6 text-[#8f321d]">
                آخر فشل: {formatFailureReason(health.automation.latestFailedJob.failureReason ?? health.automation.latestFailedJob.status)} ·{" "}
                {latestRunText(health.automation.latestFailedJob.createdAt)}
              </div>
            )}

            {needsSetupAction && (
              <section className="mt-4 rounded-lg border border-[#efd4ad] bg-[#fff8ec] p-4">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-bold text-[#9a5b00]">
                  <AlertTriangle className="h-4 w-4" />
                  <span>إجراءات مطلوبة لتفعيل الرصد الكامل</span>
                </div>
                <div className="grid gap-2">
                  <SetupAction
                    ok={Boolean(health.automation?.cronSecretConfigured)}
                    label="CRON_SECRET"
                    detail="مطلوب حتى تعمل مهام Vercel المجدولة للرصد اليومي."
                  />
                  <SetupAction
                    ok={Boolean(health.automation?.apify?.configured)}
                    label="APIFY_API_TOKEN"
                    detail="مطلوب لتشغيل رصد TikTok/Instagram الفعلي."
                  />
                  <SetupAction
                    ok={!health.automation?.mocksEnabled}
                    label="وضع البيانات التجريبية"
                    detail="يجب أن يكون متوقفًا في الإنتاج حتى تظهر نتائج الموصلات الحقيقية."
                  />
                </div>
              </section>
            )}

            <section className="mt-4 rounded-lg border border-[#c7d8f3] bg-[#f6f9ff] p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-[#1f6feb]">
                    <Activity className="h-4 w-4" />
                    <span>لوحة مراقبة الرصد الآلي</span>
                  </div>
                  <h2 className="mt-1 text-lg font-black text-[var(--color-text-title)]">تشغيل المصادر والموصلات</h2>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold text-[#1f6feb] ring-1 ring-[#c7d8f3]">
                  بيانات فعلية
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <MonitorTile
                  label="آخر تشغيل ناجح"
                  value={latestSuccessAt ? latestRunText(latestSuccessAt) : "لا يوجد"}
                  caption={monitoringIsFresh ? "تم خلال آخر 24 ساعة" : "لم يثبت تشغيل ناجح خلال آخر 24 ساعة"}
                  tone={monitoringIsFresh ? "green" : "red"}
                />
                <MonitorTile
                  label="مواد مكتشفة"
                  value={(rssCreated + connectorCreated).toLocaleString("ar-SA")}
                  caption="حسب آخر تشغيل ناجح متاح"
                  tone="green"
                />
                <MonitorTile
                  label="أخطاء تحتاج متابعة"
                  value={openErrors.toLocaleString("ar-SA")}
                  caption={latestRssFailure ? formatFailureReason(latestRssFailure.metadata?.error ?? "فشل RSS") : "وظائف فاشلة أو عناصر RSS فاشلة"}
                  tone={openErrors > 0 ? "red" : "green"}
                />
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-4">
                <MiniInfo icon={<Clock className="h-3.5 w-3.5" />} label="RSS آخر فحص" value={latestRssPoll ? latestRunText(latestRssPoll.createdAt) : "لا يوجد"} />
                <MiniInfo icon={<Activity className="h-3.5 w-3.5" />} label="RSS مكتشف/مضاف/متخطى/منخفض" value={`${rssFetched}/${rssCreated}/${rssSkipped}/${rssLowConfidence}`} />
                <MiniInfo icon={<Shield className="h-3.5 w-3.5" />} label="مصادر RSS" value={activeRssSourcesCount.toLocaleString("ar-SA")} />
                <MiniInfo
                  icon={<Shield className="h-3.5 w-3.5" />}
                  label="قواعد نشطة / انتظار"
                  value={`${health.automation?.activeSourceRulesCount ?? 0}/${health.automation?.queuedJobsCount ?? 0}`}
                />
              </div>

              {(rssFailureOver24h || staleRssSources.length > 0) && (
                <div className="mt-3 rounded-lg border border-[#f1b6aa] bg-[#fff1ed] p-3 text-xs font-bold leading-6 text-[#8f321d]">
                  تنبيه RSS: يوجد فشل غير محلول منذ أكثر من 24 ساعة.
                  {staleRssSources.length > 0 ? ` المصادر المتأثرة: ${staleRssSources.map((source) => source.name).slice(0, 3).join("، ")}.` : " راجع آخر فشل في سجل النشاط."}
                  {" "}راجع المصدر أو رابط الخلاصة من صفحة إدارة المصادر.
                </div>
              )}
            </section>
          </main>

          <aside className="rounded-lg border border-[var(--color-border)] bg-white p-4 shadow-sm">
            <header className="mb-4">
              <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--color-text-muted)]">
                <Activity className="h-4 w-4 text-[#2383E2]" />
                <span>سجل النشاط الأخير</span>
              </div>
              <h2 className="mt-2 text-xl font-black text-[var(--color-text-title)]">ما الذي حدث؟</h2>
            </header>

            <div className="space-y-2">
              {activityLogs.length ? (
                activityLogs.map((log) => <ActivityRow key={log.id} level={log.level} time={log.time} message={log.message} />)
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[#fbfbfc] p-6 text-center text-xs font-bold text-[var(--color-text-muted)]">
                  لا توجد أحداث مسجلة بعد.
                </div>
              )}
            </div>

            <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[#fbfbfc] p-3">
              <h3 className="text-sm font-black text-[var(--color-text-title)]">الرصد الاجتماعي</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <SocialPulse
                  label="TikTok"
                  value={health.automation?.tiktok.activeRulesCount ?? 0}
                  ok={health.automation?.tiktok.status === "healthy" || Boolean(health.automation?.apify?.configured)}
                />
                <SocialPulse
                  label="Instagram"
                  value={health.automation?.instagram.activeRulesCount ?? 0}
                  ok={health.automation?.instagram.status === "healthy" || Boolean(health.automation?.apify?.configured)}
                />
              </div>
              <Link
                href="/sources"
                className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg border border-[#c7d8f3] bg-white text-xs font-extrabold text-[#1f6feb]"
              >
                إدارة المصادر
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function SetupAction({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/70 bg-white/65 p-3">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0f6b57]" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#9a5b00]" />}
      <div className="min-w-0">
        <div className="text-xs font-black text-[var(--color-text-title)]">{label}</div>
        <div className="mt-1 text-[10px] font-bold leading-5 text-[var(--color-text-muted)]">{ok ? "جاهز." : detail}</div>
      </div>
    </div>
  );
}

function MonitorTile({
  label,
  value,
  caption,
  tone = "slate",
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "slate" | "green" | "red";
}) {
  const className = {
    slate: "border-[#d7e3f7] bg-white text-[var(--color-text-title)]",
    green: "border-[#b7ddce] bg-[#ecf7f2] text-[#0f6b57]",
    red: "border-[#f1b6aa] bg-[#fff1ed] text-[#9a341f]",
  }[tone];

  return (
    <div className={`rounded-lg border p-3 ${className}`}>
      <span className="block text-[10px] font-extrabold opacity-75">{label}</span>
      <span className="mt-1 block text-lg font-black leading-6">{value}</span>
      <span className="mt-1 line-clamp-2 block text-[10px] font-bold opacity-70">{caption}</span>
    </div>
  );
}

function ServiceCard({
  service,
}: {
  service: {
    name: string;
    title: string;
    logo: string;
    state: ServiceState;
    message: string;
    last: string;
    next: string;
  };
}) {
  const tone = serviceTone(service.state);

  return (
    <article className="rounded-lg border border-[var(--color-border)] bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.03)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ServiceLogo label={service.logo} />
          <div className="min-w-0">
            <h3 className="text-sm font-black text-[var(--color-text-title)]">{service.name}</h3>
            <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">{service.title}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${tone.badge}`}>
          {tone.icon}
          {tone.label}
        </span>
      </div>

      <p className="mt-3 min-h-10 text-xs font-semibold leading-5 text-[var(--color-text-muted)]">{service.message}</p>
      <div className="mt-3 grid gap-2 border-t border-[var(--color-border)] pt-3 sm:grid-cols-2">
        <MiniInfo icon={<Clock className="h-3.5 w-3.5" />} label="آخر تشغيل ناجح" value={service.last} />
        <MiniInfo icon={<Activity className="h-3.5 w-3.5" />} label="التشغيل القادم" value={service.next} />
      </div>
    </article>
  );
}

function ServiceLogo({ label }: { label: string }) {
  return <BrandIcon brand={brandFromLabel(label)} size="lg" />;
}

function MiniInfo({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[#fbfbfc] p-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--color-text-muted)]">
        {icon}
        {label}
      </div>
      <p className="mt-1 truncate text-xs font-black text-[var(--color-text-title)]">{value}</p>
    </div>
  );
}

function HealthMetric({ label, value, tone }: { label: string; value: string; tone: "green" | "orange" | "red" }) {
  const className = {
    green: "border-[#b7ddce] bg-[#ecf7f2] text-[#0f6b57]",
    orange: "border-[#efd4ad] bg-[#fff8ec] text-[#9a5b00]",
    red: "border-[#f1b6aa] bg-[#fff1ed] text-[#9a341f]",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${className}`}>
      <span className="block text-[10px] font-extrabold opacity-80">{label}</span>
      <span className="mt-1 block text-xl font-black">{value}</span>
    </div>
  );
}

function UsageLine({ label, value, limit }: { label: string; value: number; limit: number }) {
  const percent = Math.min(100, Math.round((value / limit) * 100));
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[10px] font-extrabold text-[var(--color-text-muted)]">
        <span>{label}</span>
        <span>
          {value.toLocaleString("ar-SA")} / {limit.toLocaleString("ar-SA")}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-[#1f6feb]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function ActivityRow({ level, time, message }: { level: string; time: string; message: string }) {
  const icon =
    level === "error" ? (
      <XCircle className="h-4 w-4 text-[#9a341f]" />
    ) : level === "success" ? (
      <CheckCircle2 className="h-4 w-4 text-[#0f6b57]" />
    ) : (
      <AlertTriangle className="h-4 w-4 text-[#9a5b00]" />
    );

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[#fbfbfc] p-3">
      <div className="flex items-start gap-2">
        {icon}
        <div className="min-w-0">
          <p className="text-xs font-bold leading-5 text-[var(--color-text-title)]">{message}</p>
          <p className="mt-1 text-[10px] font-semibold text-[var(--color-text-muted)]">{time}</p>
        </div>
      </div>
    </div>
  );
}

function SocialPulse({ label, value, ok }: { label: string; value: number; ok: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white p-3">
      <div className="flex items-center justify-center gap-2">
        <BrandIcon brand={brandFromLabel(label)} size="sm" />
        <span className="text-[10px] font-bold text-[var(--color-text-muted)]">{label}</span>
      </div>
      <span className="mt-1 block text-lg font-black text-[var(--color-text-title)]">{value.toLocaleString("ar-SA")}</span>
      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-extrabold ${ok ? "bg-[#ecf7f2] text-[#0f6b57]" : "bg-stone-100 text-stone-500"}`}>
        {ok ? "يعمل" : "متوقف"}
      </span>
    </div>
  );
}

function serviceTone(state: ServiceState) {
  if (state === "healthy") {
    return {
      label: "يعمل",
      badge: "bg-[#ecf7f2] text-[#0f6b57]",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    };
  }
  if (state === "warning") {
    return {
      label: "تحذير",
      badge: "bg-[#fff8ec] text-[#9a5b00]",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
    };
  }
  return {
    label: "متوقف",
    badge: "bg-[#fff1ed] text-[#9a341f]",
    icon: <XCircle className="h-3.5 w-3.5" />,
  };
}

function normalizeState(status?: string): ServiceState {
  if (status === "healthy" || status === "good" || status === "ok") return "healthy";
  if (status === "degraded" || status === "warning" || status === "not_configured" || status === "ready") return "warning";
  return "down";
}

function mediaExtractorState(extractor?: NonNullable<HealthClientProps["initialHealth"]["automation"]>["mediaMetadataExtractor"]): ServiceState {
  if (!extractor?.enabled) return "warning";
  if (extractor.status === "healthy" && extractor.ytDlpAvailable) return "healthy";
  if (extractor.status === "degraded") return "warning";
  return "down";
}

function connectorMessage(status?: string) {
  if (status === "healthy") return "بحث X يعمل وجاهز للرصد الآلي.";
  if (status === "ready") return "بحث X مهيأ في المنصة، لكن لم يتم تأكيد تشغيل المزود بعد. جرّب بحث X أو راجع XAI_API_KEY والرصيد.";
  if (status === "degraded") return "بحث X يعمل مع تحذيرات. راجع الرصيد أو الإعدادات.";
  if (status === "not_configured") return "أضف مفاتيح مزود بحث X حتى يعمل الرصد الآلي.";
  return "تعذر تأكيد حالة بحث X.";
}

function numberFromMetadata(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function latestTimestamp(values: Array<string | null | undefined>) {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
  );
}

function isOlderThanHours(value: string, hours: number) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp > hours * 60 * 60 * 1000;
}

function formatFailureReason(reason: unknown) {
  if (!reason) return "فشل غير محدد";
  const text = typeof reason === "string" ? reason : JSON.stringify(reason);
  if (text === "[object Object]") return "فشل مزود بيانات. افتح صفحة المصادر لمعرفة الحساب أو المصدر المتأثر.";
  if (text.includes("input.username is required")) return "حساب Instagram يحتاج اسم مستخدم واضح.";
  if (text.includes("apify_http_400")) return "Apify رفض مدخلات أحد حسابات Instagram.";
  if (text.includes("This operation was aborted")) return "انتهت مهلة مزود البيانات قبل اكتمال الفحص.";
  return text.length > 140 ? `${text.slice(0, 140)}...` : text;
}

function latestRunText(value?: string | null) {
  if (!value) return "لا يوجد";
  return new Date(value).toLocaleString("ar-SA", { hour12: false });
}

function readableLog(action: string, entityId: string) {
  if (action === "item.ingested") return `تمت إضافة مادة جديدة (${entityId.slice(0, 8)}).`;
  if (action === "item.duplicate_detected") return "تم تخطي رابط مكرر.";
  if (action === "source.rss_polled") return "تم فحص مصادر الأخبار.";
  if (action === "source.rss_poll_failed") return "فشل فحص مصدر أخبار ويحتاج مراجعة.";
  if (action === "keyword_rule.updated") return "تم تحديث كلمات الرصد.";
  return `حدث تشغيلي: ${action}`;
}
