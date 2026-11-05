"use client";

import React from "react";
import Link from "next/link";
import { UI_DICTIONARY, ROUTE_SLUGS } from "../i18n/messages";

export default function GlobalError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const dict = UI_DICTIONARY.tr;
  return (
    <html lang="tr" dir="ltr">
      <body className="min-h-screen bg-brand text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white text-slate-900 rounded-2xl p-8 text-center shadow-2xl space-y-4">
          <div className="text-4xl font-heading font-extrabold text-red-700">500</div>
          <h1 className="text-xl font-bold text-brand">
            {dict.serverErrorTitle} / {UI_DICTIONARY.uz.serverErrorTitle} /{" "}
            {UI_DICTIONARY.en.serverErrorTitle} / {UI_DICTIONARY.ar.serverErrorTitle}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <button
              type="button"
              onClick={() => reset()}
              className="px-4 py-2.5 rounded-xl bg-brand text-white text-sm font-bold"
            >
              Yeniden Dene / Qayta urinish
            </button>
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