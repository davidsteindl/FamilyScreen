"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type AutoRefreshProps = {
  /** Poll interval. The screen uploads about 15 s after the last stroke. */
  seconds: number;
};

/**
 * Re-runs the server component this sits in, so a drawing that arrives while the
 * page is open replaces the one on screen. A hidden tab skips its turn: nobody is
 * looking, and every tick is a query against a serverless database.
 */
export function AutoRefresh({ seconds }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) {
        router.refresh();
      }
    }, seconds * 1000);

    return () => clearInterval(timer);
  }, [router, seconds]);

  return null;
}
