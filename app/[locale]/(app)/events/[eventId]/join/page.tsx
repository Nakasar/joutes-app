import { Suspense } from "react";
import PageClient from "./PageClient.tsx";

/**
 * L'écran est entièrement client et lit lui-même le paramètre d'URL, inconnu au
 * prérendu : il suspend. Cette enveloppe serveur ne porte donc plus un opt-out,
 * mais la frontière et sa silhouette.
 *
 * L'écran ne montre qu'une ligne le temps de rejoindre l'événement : la
 * silhouette n'a rien de plus à réserver.
 */
export default function Page() {
  return (
    <Suspense fallback={<JoinEventFallback />}>
      <PageClient />
    </Suspense>
  );
}

function JoinEventFallback() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Inscription à l&apos;événement en cours…</span>
      <div className="h-6 w-64 max-w-full animate-pulse rounded bg-muted" />
    </div>
  );
}
