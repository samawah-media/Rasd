import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RASD | منصة التقارير الإعلامية",
  description: "منصة SaaS لرصد التغطيات الإعلامية وبناء تقارير عربية آمنة.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
