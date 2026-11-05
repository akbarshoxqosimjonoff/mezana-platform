"use client";

import React, { useState } from "react";

export function TrackingShareClient({ label }: { label: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Ezan Vakfı Kurban Takip", url });
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(true);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      data-testid="tracking-video-share-btn"
      className="px-4 py-2.5 rounded-xl bg-accent text-brand font-bold text-xs hover:bg-accent-hover"
    >
      {copied ? "✓ Bağlantı Kopyalandı / Nusxalandi" : label}
    </button>
  );
}
