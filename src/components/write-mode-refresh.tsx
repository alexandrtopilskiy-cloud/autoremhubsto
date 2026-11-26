"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function WriteModeRefresh({ readOnly }: { readOnly: boolean }) {
  const router = useRouter();
  useEffect(() => {
    let pending = false;
    let disposed = false;
    async function check() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/offline/write-mode", { cache: "no-store" });
        if (!response.ok) return;
        const state = await response.json() as { readOnly: boolean };
        if (!disposed && state.readOnly !== readOnly) router.refresh();
      } catch {
        // The server still enforces permissions even if the banner cannot refresh.
      } finally {
        pending = false;
      }
    }
    const timer = window.setInterval(() => void check(), 12_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [readOnly, router]);
  return null;
}
