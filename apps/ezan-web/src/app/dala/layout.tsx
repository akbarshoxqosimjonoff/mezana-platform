import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Saha Kurban Ekibi Portalı (/dala) — Ezan Vakfı",
  robots: { index: false, follow: false }
};

export default function DalaLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" dir="ltr">
      <body className="min-h-screen bg-surface text-slate-900 font-body antialiased">{children}</body>
    </html>
  );
}
