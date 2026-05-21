import { LogOut, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { defaultPathForRole, isAdminRole } from "@/lib/auth-config";
import { getCurrentAuthContext } from "@/server/auth";

export default async function UnauthorizedPage() {
  const context = await getCurrentAuthContext();
  const homeHref = context ? defaultPathForRole(context.membership.role) : "/login";

  if (context && !isAdminRole(context.membership.role)) {
    redirect(homeHref);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f6f4] px-4 py-10 text-[#171819]">
      <section className="w-full max-w-xl rounded-lg border border-[#dfe3de] bg-white p-6 text-center shadow-sm">
        <div className="mx-auto grid size-14 place-items-center rounded-lg bg-[#fff1df] text-[#9a5522]">
          <ShieldAlert size={28} />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">غير مصرح بالوصول</h1>
        <p className="mt-3 text-sm leading-7 text-[#69716d]">
          هذا الحساب لا يملك صلاحية فتح هذه الصفحة. أدوات الإدارة مخصصة للمالك والمحررين، وواجهة العميل منفصلة.
        </p>

        {context ? (
          <div className="mt-5 rounded-lg bg-[#f7f8f6] p-3 text-sm leading-6">
            <div className="font-semibold">{context.user.email}</div>
            <div className="text-[#69716d]">الدور الحالي: {context.membership.role}</div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link className="inline-flex h-10 items-center rounded-lg bg-[#18201e] px-4 text-sm font-semibold text-white" href={homeHref}>
            العودة للمساحة المناسبة
          </Link>
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dfe3de] bg-[#fbfbfa] px-4 text-sm font-semibold"
            href="/auth/logout"
          >
            <LogOut size={16} />
            خروج
          </Link>
        </div>
      </section>
    </main>
  );
}
