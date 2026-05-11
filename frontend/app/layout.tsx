import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "異常報告管理システム",
  description: "現場の異常報告をデジタル化・一元管理するシステム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
