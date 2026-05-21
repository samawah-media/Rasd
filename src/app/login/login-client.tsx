"use client";

import { FormEvent, useMemo, useState } from "react";
import { Eye, LockKeyhole, Mail, Radio, ShieldCheck } from "lucide-react";

import { createBrowserSupabaseClient } from "@/lib/supabase";

type AuthResponse = {
  ok?: boolean;
  error?: string;
};

const authErrorMessages: Record<string, string> = {
  email_password_required: "اكتب البريد وكلمة المرور.",
  invalid_login: "تعذر الدخول. تأكد من البريد وكلمة المرور أو أعد حفظ حساب العميل من صفحة حسابات العملاء.",
  request_timeout: "تأخر التحقق أكثر من المتوقع. حدّث الصفحة وجرب مرة أخرى.",
  signup_disabled: "هذا البريد لم تتم دعوته بعد.",
  signup_not_allowed: "هذا البريد لم تتم دعوته بعد.",
  access_denied: "تم رفض الدخول من مزود تسجيل الدخول. جرّب بريدًا تمت دعوته للمنصة.",
  auth_callback_failed: "عاد مزود الدخول بدون جلسة صالحة. راجع روابط Redirect ثم جرّب مرة أخرى.",
};

export function LoginClient({ authError, nextPath }: { authError: string | null; nextPath: string }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(() => describeAuthError(authError));

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetchWithTimeout("/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as AuthResponse;

      if (!response.ok || !payload.ok) {
        setError(describeAuthError(payload.error ?? "invalid_login"));
        setIsSubmitting(false);
        return;
      }

      window.location.assign(`/auth/redirect?next=${encodeURIComponent(nextPath)}`);
    } catch (caught) {
      setError(caught instanceof Error ? describeAuthError(caught.message) : describeAuthError("request_timeout"));
      setIsSubmitting(false);
    }
  }

  async function signInWithGoogle() {
    setIsSubmitting(true);
    setError(null);

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (googleError) {
      setError("تعذر بدء الدخول عبر Google. راجع إعدادات OAuth في Supabase.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f6f4] px-4 py-10 text-[#171819]" dir="rtl">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-[#dfe3de] bg-white shadow-sm lg:grid-cols-[0.95fr_1.05fr]">
        <div className="bg-[#17201d] p-8 text-white">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-lg bg-white/10">
              <Radio size={21} />
            </div>
            <div>
              <div className="text-xl font-semibold">رصد هداية هاكاثون</div>
              <div className="text-sm text-white/65">بوابة خاصة بالأعضاء المدعوين</div>
            </div>
          </div>

          <div className="mt-14 space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-white/8 p-4">
              <ShieldCheck className="mt-1 text-[#8fe2ca]" size={19} />
              <div>
                <h2 className="font-semibold">صلاحيات واضحة</h2>
                <p className="mt-1 text-sm leading-6 text-white/68">
                  المالك والمحرر يديران الرصد، والعميل يرى تقريره فقط بدون أدوات الإدارة.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-white/8 p-4">
              <Eye className="mt-1 text-[#8fe2ca]" size={19} />
              <div>
                <h2 className="font-semibold">واجهة عميل حية</h2>
                <p className="mt-1 text-sm leading-6 text-white/68">
                  الفلاتر والإحصائيات والروابط واللقطات متاحة للعميل داخل مساحته.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-md bg-[#e8f3ef] px-3 py-2 text-sm font-semibold text-[#1f675d]">
            <LockKeyhole size={16} />
            الدخول بالدعوة فقط
          </div>
          <h1 className="mt-5 text-2xl font-semibold md:text-3xl">تسجيل الدخول</h1>
          <p className="mt-2 text-sm leading-6 text-[#69716d]">
            استخدم بريدًا تمت إضافته للمنصة. حساب العميل يفتح تقرير العميل فقط.
          </p>

          <button
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#dfe3de] bg-[#fbfbfa] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            onClick={signInWithGoogle}
            type="button"
          >
            <span className="grid size-5 place-items-center rounded-full bg-white text-xs font-bold text-[#4285f4]">G</span>
            الدخول عبر Google
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-[#8a928d]">
            <span className="h-px flex-1 bg-[#e1e4df]" />
            أو البريد وكلمة المرور
            <span className="h-px flex-1 bg-[#e1e4df]" />
          </div>

          <form className="space-y-4" onSubmit={signInWithPassword}>
            <label className="block text-sm">
              <span className="font-semibold text-[#333837]">البريد الإلكتروني</span>
              <div className="relative mt-2">
                <Mail className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#69716d]" size={16} />
                <input
                  autoComplete="email"
                  className="h-11 w-full rounded-lg border border-[#dfe3de] bg-[#fbfbfa] pr-10 pl-3 text-left text-sm outline-none focus:border-[#277466]"
                  dir="ltr"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </div>
            </label>

            <label className="block text-sm">
              <span className="font-semibold text-[#333837]">كلمة المرور</span>
              <div className="relative mt-2">
                <LockKeyhole className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#69716d]" size={16} />
                <input
                  autoComplete="current-password"
                  className="h-11 w-full rounded-lg border border-[#dfe3de] bg-[#fbfbfa] pr-10 pl-3 text-left text-sm outline-none focus:border-[#277466]"
                  dir="ltr"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </div>
            </label>

            <button
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#18201e] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "جاري التحقق..." : "دخول"}
            </button>
          </form>

          {error ? (
            <div className="mt-4 rounded-lg border border-[#f4d7b0] bg-[#fff1df] p-3 text-sm leading-6 text-[#9a5522]">
              {error}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(new Error("request_timeout")), 12000);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("request_timeout");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function describeAuthError(error: string | null) {
  if (!error) return null;
  return authErrorMessages[error] ?? `تعذر إكمال تسجيل الدخول: ${error}`;
}
