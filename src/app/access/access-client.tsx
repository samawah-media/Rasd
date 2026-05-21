"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Eye, KeyRound, Loader2, LockKeyhole, Mail, RefreshCw, UserRound } from "lucide-react";
import Link from "next/link";

type ViewerSummary = {
  userId: string;
  email: string;
  displayName: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  organizations: Array<{
    id: string;
    name: string;
    role: "viewer";
  }>;
};

type AccessState =
  | { status: "loading"; viewers: ViewerSummary[]; error: null }
  | { status: "ready"; viewers: ViewerSummary[]; error: null }
  | { status: "error"; viewers: ViewerSummary[]; error: string };

type ApiError = {
  error?: string;
  message?: string;
};

const apiErrorMessages: Record<string, string> = {
  auth_required: "انتهت الجلسة. سجّل دخولك مرة أخرى.",
  insufficient_role: "هذه الصفحة للمالك فقط.",
  email_required: "اكتب بريد العميل.",
  email_invalid: "صيغة البريد غير صحيحة.",
  password_required: "اكتب كلمة مرور للعميل.",
  password_too_short: "كلمة المرور يجب أن تكون 8 أحرف على الأقل.",
  account_has_admin_role: "هذا البريد لديه صلاحية إدارية، ولا يمكن تحويله إلى حساب عميل.",
  supabase_admin_not_configured: "إعدادات Supabase الخاصة بالسيرفر غير مكتملة.",
  client_viewer_save_failed: "تعذر حفظ حساب العميل.",
  client_viewers_list_failed: "تعذر تحميل حسابات العملاء.",
};

export function AccessClient() {
  const clientReportUrl = "/client-report";
  const [state, setState] = useState<AccessState>({ status: "loading", viewers: [], error: null });
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function loadViewers() {
    setState((current) => ({ status: "loading", viewers: current.viewers, error: null }));
    try {
      const data = await apiJson<{ viewers: ViewerSummary[] }>("/api/access/client-viewers");
      setState({ status: "ready", viewers: data.viewers, error: null });
    } catch (error) {
      setState((current) => ({
        status: "error",
        viewers: current.viewers,
        error: error instanceof Error ? error.message : "تعذر تحميل حسابات العملاء.",
      }));
    }
  }

  useEffect(() => {
    void loadViewers();
  }, []);

  async function saveViewer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      await apiJson("/api/access/client-viewers", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          display_name: displayName,
        }),
      });
      setMessage("تم تجهيز حساب العميل. يستطيع الدخول الآن إلى تقرير العميل فقط.");
      setEmail("");
      setDisplayName("");
      setPassword("");
      await loadViewers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حفظ حساب العميل.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f6f2] text-[#171819]" dir="rtl">
      <header className="border-b border-[#dfe3d9] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#66736d]">إدارة الوصول</p>
            <h1 className="mt-1 text-3xl font-semibold">حسابات العملاء</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#dfe3d9] bg-white px-4 text-sm font-semibold text-[#26312d]"
              href="/"
            >
              لوحة الأدمن
            </Link>
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#116a5c] px-4 text-sm font-semibold text-white"
              href="/client-report"
            >
              <Eye className="h-4 w-4" />
              عرض تقرير العميل
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <form className="rounded-lg border border-[#dfe3d9] bg-white p-5" onSubmit={saveViewer}>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-[#e7f4ef] text-[#116a5c]">
              <UserRound className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">تجهيز حساب Viewer</h2>
              <p className="mt-1 text-sm text-[#66736d]">إيميل وكلمة مرور مخصصة للعميل.</p>
            </div>
          </div>

          <label className="mt-5 block text-sm">
            <span className="font-semibold">بريد العميل</span>
            <div className="relative mt-2">
              <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#66736d]" />
              <input
                autoComplete="email"
                className="h-11 w-full rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] pr-10 pl-3 text-left text-sm outline-none focus:border-[#116a5c]"
                dir="ltr"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </div>
          </label>

          <label className="mt-4 block text-sm">
            <span className="font-semibold">اسم اختياري</span>
            <input
              className="mt-2 h-11 w-full rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] px-3 text-sm outline-none focus:border-[#116a5c]"
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="مثال: عميل هداية"
              type="text"
              value={displayName}
            />
          </label>

          <label className="mt-4 block text-sm">
            <span className="font-semibold">كلمة المرور</span>
            <div className="relative mt-2">
              <KeyRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#66736d]" />
              <input
                autoComplete="new-password"
                className="h-11 w-full rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] pr-10 pl-3 text-left text-sm outline-none focus:border-[#116a5c]"
                dir="ltr"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>
          </label>

          <button
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#17201d] px-4 text-sm font-semibold text-white disabled:opacity-50"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {isSaving ? "جاري الحفظ..." : "حفظ حساب العميل"}
          </button>

          {message ? (
            <div className="mt-4 rounded-lg border border-[#dfe3d9] bg-[#fbfbf8] p-3 text-sm leading-6 text-[#26312d]">
              {message}
            </div>
          ) : null}
        </form>

        <div className="space-y-5">
          <section className="rounded-lg border border-[#dfe3d9] bg-white p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-[#fff3c4] text-[#7a5a00]">
                <LockKeyhole className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold">طريقة التسليم للعميل</h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-[#66736d]">
                  أعطِ العميل البريد وكلمة المرور فقط. بعد الدخول يفتح تقرير العميل، ولا تظهر له أدوات الإدارة أو المراجعة أو الاستيراد.
                </p>
                <div className="mt-3 rounded-lg border border-[#e6eadf] bg-[#fbfbf8] p-3 text-left text-sm font-semibold text-[#116a5c]" dir="ltr">
                  {clientReportUrl}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-[#dfe3d9] bg-white">
            <div className="flex items-center justify-between border-b border-[#dfe3d9] p-4">
              <div>
                <h2 className="font-semibold">حسابات Viewer</h2>
                <p className="mt-1 text-sm text-[#66736d]">حسابات تفتح واجهة العميل فقط.</p>
              </div>
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#dfe3d9] bg-white px-3 text-sm font-semibold"
                onClick={loadViewers}
                type="button"
              >
                <RefreshCw className={`h-4 w-4 ${state.status === "loading" ? "animate-spin" : ""}`} />
                تحديث
              </button>
            </div>

            {state.error ? <div className="m-4 rounded-lg bg-[#fff1df] p-3 text-sm text-[#8f4a1e]">{state.error}</div> : null}

            <div className="divide-y divide-[#edf0e9]">
              {state.viewers.length ? (
                state.viewers.map((viewer) => (
                  <div className="grid gap-3 p-4 md:grid-cols-[1fr_auto]" key={viewer.userId}>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold" dir="ltr">
                        {viewer.email}
                      </div>
                      <div className="mt-1 text-sm text-[#66736d]">{viewer.displayName ?? "عميل بدون اسم ظاهر"}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {viewer.organizations.map((organization) => (
                          <span className="rounded-full bg-[#e7f4ef] px-2 py-1 text-xs font-semibold text-[#116a5c]" key={organization.id}>
                            {organization.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-sm text-[#66736d]">
                      آخر دخول: {formatDate(viewer.lastSignInAt)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-5 text-sm text-[#66736d]">
                  {state.status === "loading" ? "جاري تحميل الحسابات..." : "لا توجد حسابات Viewer بعد."}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as ApiError;

  if (!response.ok) {
    const key = payload.error ?? "request_failed";
    throw new Error(apiErrorMessages[key] ?? payload.message ?? "تعذر تنفيذ الطلب.");
  }

  return payload as T;
}

function formatDate(value: string | null) {
  if (!value) return "لم يدخل بعد";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
