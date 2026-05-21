import React from "react";
import RichRightSidebar from "./RichRightSidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-[var(--color-bg-main)] text-[var(--color-text-body)] font-sans" dir="rtl">
      {/* Descriptive Sidebar Navigation */}
      <RichRightSidebar />
      
      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col pt-16 lg:pt-0">
        {children}
      </main>
    </div>
  );
}
