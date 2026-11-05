import React from "react";
import Link from "next/link";
import { UI_DICTIONARY, ROUTE_SLUGS } from "../i18n/messages";

export default function NotFound() {
  const dict = UI_DICTIONARY.tr;
  return (
    <html lang="tr" dir="ltr">
      <body className="min-h-screen bg-brand text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white text-slate-900 rounded-2xl p-8 text-center shadow-2xl space-y-4">
          <div className="text-4xl font-heading font-extrabold text-brand">404</div>
          <h1 className="text-xl font-bold text-brand">
            {dict.notFoundTitle} / {UI_DICTIONARY.uz.notFoundTitle} / {UI_DICTIONARY.en.notFoundTitle} /{" "}
            {UI_DICTIONARY.ar.notFoundTitle}
          </h1>
          <p className="text-sm text-slate-600">{dict.notFoundDesc}</p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <Link
              href="/tr"
              className="px-4 py-2.5 rounded-xl bg-brand text-white text-sm font-bold"
            >
              Ana Sayfa / Bosh sahifa
            </Link>
            <Link
              href={`/tr/${ROUTE_SLUGS.donate.tr}`}
              className="px-4 py-2.5 rounded-xl bg-accent text-brand text-sm font-bold"
            >
              {dict.donateNow} / {UI_DICTIONARY.uz.donateNow}
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}