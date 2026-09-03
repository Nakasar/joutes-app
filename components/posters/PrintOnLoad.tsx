"use client";

import { useEffect } from "react";

/**
 * Ouvre la boîte d'impression une fois la page chargée — polices comprises,
 * sans quoi la première page imprimée sortirait avec les polices de
 * remplacement. C'est le chemin « enregistrer en PDF » de l'écran de gestion.
 */
export default function PrintOnLoad() {
  useEffect(() => {
    let cancelled = false;

    const ready = typeof document.fonts?.ready?.then === "function" ? document.fonts.ready : Promise.resolve();

    ready.then(() => {
      if (!cancelled) {
        window.print();
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
