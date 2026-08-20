import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import PageClient from "./PageClient.tsx";

/**
 * L'écran est entièrement client et lit lui-même le paramètre d'URL, inconnu au
 * prérendu : il suspend. Cette enveloppe serveur ne porte donc plus un opt-out,
 * mais la frontière et sa silhouette.
 *
 * Le repli reprend l'état d'attente que le composant client affiche lui-même le
 * temps d'ajouter l'ami — même colonne centrée, même roue. Le remplacement ne
 * se voit pas : c'est le texte qui change, pas la mise en page.
 */
export default function Page() {
  return (
    <Suspense fallback={<AddFriendFallback />}>
      <PageClient />
    </Suspense>
  );
}

function AddFriendFallback() {
  return (
    <div
      className="container mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Ajout de l&apos;ami en cours…</span>
      <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      <div className="h-5 w-48 max-w-full animate-pulse rounded bg-muted" />
    </div>
  );
}
