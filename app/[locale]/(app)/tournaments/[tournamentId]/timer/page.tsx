import type { ComponentProps } from "react";
import { Suspense } from "react";

import PageClient from "./PageClient.tsx";

/**
 * L'écran est entièrement client et ne tient qu'au paramètre d'URL, inconnu au
 * prérendu : il suspend. Cette enveloppe serveur ne porte donc plus un opt-out,
 * mais la frontière et sa silhouette. Les props sont retransmises telles
 * quelles, `params` compris, qui reste une promesse jusqu'au client.
 */
export default function Page(props: ComponentProps<typeof PageClient>) {
  return (
    <Suspense fallback={<TimerFallback />}>
      <PageClient {...props} />
    </Suspense>
  );
}

/**
 * Le minuteur est une surcouche plein écran qui recouvre l'en-tête du site. La
 * silhouette l'est aussi, sans quoi la page d'attente laisserait voir un cadre
 * que le minuteur masque aussitôt — le contraire de ce qu'on cherche sur un
 * écran projeté en salle.
 *
 * Les proportions sont celles du vrai chiffre : `text-[24vw]`, `md:text-[20vw]`.
 */
function TimerFallback() {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-background p-8 text-foreground"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Chargement du minuteur…</span>
      <div className="h-7 w-64 max-w-full animate-pulse rounded bg-muted/60 md:h-8" />
      <div className="h-[24vw] w-[68vw] animate-pulse rounded bg-muted md:h-[20vw] md:w-[56vw]" />
    </div>
  );
}
