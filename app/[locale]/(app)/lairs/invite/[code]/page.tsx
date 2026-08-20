import type { ComponentProps } from "react";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import PageClient from "./PageClient.tsx";

/**
 * L'écran est entièrement client et ne tient qu'au paramètre d'URL, lu avec
 * `use(params)`. Ce paramètre est inconnu au prérendu, donc le composant
 * suspend : cette enveloppe serveur ne sert plus à porter un opt-out, mais la
 * frontière et sa silhouette.
 *
 * Le repli reprend l'écran de chargement que le composant client affiche
 * lui-même le temps d'accepter l'invitation — même carte, même roue. Le
 * remplacement ne se voit donc pas : c'est le contenu qui change, pas la mise
 * en page.
 */
export default function Page(props: ComponentProps<typeof PageClient>) {
  return (
    <Suspense fallback={<InviteLoadingFallback />}>
      <PageClient {...props} />
    </Suspense>
  );
}

function InviteLoadingFallback() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl" aria-hidden>
      <div className="rounded-xl border bg-card">
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <div className="h-5 w-56 max-w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
