import React from "react";

export function BentoGrid({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-12 gap-5 ${className}`}>
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
    <div className={`bg-white rounded-3xl border border-[var(--color-border)] p-6 shadow-sm hover:shadow-premium transition-all duration-300 flex flex-col justify-between overflow-hidden relative group hover:border-[#2383E2]/35 ${colSpan} ${rowSpan} ${className}`}>
      {/* Subtle hover gradient */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#2383E2]/[0.01] to-[#00C853]/[0.01] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      
      {(title || Icon || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4 mb-4 select-none">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div className="w-9 h-9 rounded-xl bg-[#2383E2]/10 flex items-center justify-center text-[#2383E2]">
                <Icon size={16} />
              </div>
            )}
            <div>
              {title && <h3 className="text-sm font-bold text-[var(--color-text-title)]">{title}</h3>}
              {subtitle && <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col justify-center">{children}</div>
    </div>
  );
}
