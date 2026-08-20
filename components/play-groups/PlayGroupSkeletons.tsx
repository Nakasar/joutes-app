/**
 * Silhouettes des écrans de groupe de jeu.
 *
 * Les deux écrans — portail et membres — ont la même tête : un titre, une
 * phrase d'explication, et à droite un bouton de retour suivi de la barre
 * d'outils. Ils partagent donc la même silhouette.
 *
 * Les hauteurs sont relevées sur l'écran réel : titre en `text-3xl`,
 * explication en `mt-2`, boutons de 36 px, cartes de membre bordées en `p-4`.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la coquille que la frontière
 * vient de rendre possible (voir `components/HeaderFallback.tsx`).
 */

export function PlayGroupScreenSkeleton({
  rows = 4,
  label = "Chargement du groupe",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">{label}…</span>

      <div className="flex animate-pulse flex-wrap items-center justify-between gap-4">
        <div>
          <div className="h-9 w-64 max-w-full rounded bg-muted" />
          <div className="mt-2 h-5 w-80 max-w-full rounded bg-muted/60" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-9 w-24 rounded-md bg-muted" />
          <div className="h-9 w-32 rounded-md bg-muted/60" />
        </div>
      </div>

      <div className="animate-pulse space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="rounded-lg border p-4">
            <div className="h-5 w-48 max-w-full rounded bg-muted" />
            <div className="mt-2 h-4 w-24 rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * La rangée d'outils d'un groupe : le bouton de retour à gauche, la barre
 * d'onglets à droite. Elle coiffe les écrans de collection, de listes d'envies
 * et de vente.
 *
 * Elle est décorative : l'écran qu'elle coiffe porte déjà la région annoncée.
 */
export function PlayGroupToolsRowSkeleton() {
  return (
    <div
      className="mb-4 flex animate-pulse flex-row flex-wrap items-center justify-between gap-2"
      aria-hidden
    >
      <div className="h-9 w-28 rounded-md bg-muted" />
      <div className="h-9 w-40 rounded-md bg-muted/60" />
    </div>
  );
}

/**
 * Une vue de collection : titre, sous-titre, puis une grille de vignettes de
 * jeu ou d'extension.
 */
export function PlayGroupCollectionSkeleton({
  tiles = 8,
  label = "Chargement de la collection",
}: {
  tiles?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}…</span>

      <div className="animate-pulse space-y-2">
        <div className="h-8 w-72 max-w-full rounded bg-muted" />
        <div className="h-5 w-96 max-w-full rounded bg-muted/60" />
      </div>

      <div className="mt-6 grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: tiles }, (_, index) => (
          <div key={index} className="space-y-3 rounded-xl border p-4">
            <div className="aspect-[3/2] rounded-lg bg-muted" />
            <div className="h-5 w-2/3 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
