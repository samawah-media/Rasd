import React from "react";

export function BentoGrid({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-12 gap-4 ${className}`}>
      {children}
    </div>
  );
}

export function BentoCard({
  children,
  className = "",
  colSpan = "col-span-12",
  rowSpan = "",
  title,
  subtitle,
  icon: Icon,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: string; // col-span-12, md:col-span-6, md:col-span-4, md:col-span-3, md:col-span-8, etc.
  rowSpan?: string; // row-span-1, row-span-2, etc.
  title?: string;
  subtitle?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  action?: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-lg border border-[var(--color-border)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 flex flex-col justify-between overflow-hidden relative hover:border-[#2383E2]/35 hover:shadow-[0_10px_30px_rgba(15,23,42,0.06)] ${colSpan} ${rowSpan} ${className}`}>
      {(title || Icon || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3 mb-4 select-none">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div className="w-8 h-8 rounded-lg bg-[#eef6ff] flex items-center justify-center text-[#2383E2]">
                <Icon size={16} />
              </div>
            )}
            <div>
              {title && <h3 className="text-sm font-extrabold text-[var(--color-text-title)]">{title}</h3>}
              {subtitle && <p className="text-[10px] font-semibold text-[var(--color-text-muted)] mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col justify-center">{children}</div>
    </div>
  );
}
