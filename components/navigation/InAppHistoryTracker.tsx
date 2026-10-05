"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordNavigation } from "@/lib/navigation/in-app-history.ts";

/**
 * Compte les pages parcourues dans l'app, pour les navigateurs sans Navigation
 * API (voir `lib/navigation/in-app-history`). Ne rend rien.
 */
export function InAppHistoryTracker() {
  const pathname = usePathname();

  useEffect(() => {
    recordNavigation();
  }, [pathname]);

  return null;
}
