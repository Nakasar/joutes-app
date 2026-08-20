/**
 * Silhouettes de la fiche d'une carte.
 *
 * L'écran est en deux colonnes à partir de `lg` : l'illustration à gauche,
 * collante, et tout le texte à droite. La silhouette reprend cette grille —
 * `minmax(0,22rem)_1fr` — sinon le remplacement décale toute la page.
 *
 * Les proportions viennent de l'écran réel : illustration au format d'une
 * carte à jouer (63 × 88), titre en `text-3xl`, blocs d'errata bordés.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la coquille que la frontière
 * vient de rendre possible (voir `components/HeaderFallback.tsx`).
 */

/** La rangée de navigation : retour à gauche, barre d'outils à droite. */
export function CardNavSkeleton() {
  return (
    <div className="flex animate-pulse flex-row flex-wrap justify-between gap-4" aria-hidden>
      <div className="h-9 w-32 rounded-md bg-muted" />
      <div className="h-9 w-40 rounded-md bg-muted/60" />
    </div>
  );
}

export function CardDetailSkeleton({ erratas = 2 }: { erratas?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-start"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Chargement de la carte…</span>

      <div className="flex animate-pulse flex-col gap-4" aria-hidden>
        <div className="aspect-[63/88] w-full rounded-xl bg-muted shadow-lg" />
        <div className="flex gap-2">
          <div className="h-9 w-32 rounded-md bg-muted/60" />
          <div className="h-9 w-32 rounded-md bg-muted/60" />
        </div>
        <div className="h-20 rounded-lg border bg-card" />
      </div>

      <div className="flex min-w-0 animate-pulse flex-col gap-6" aria-hidden>
        <div className="space-y-3">
          <div className="h-9 w-2/3 max-w-md rounded bg-muted" />
          <div className="h-4 w-40 rounded bg-muted/60" />
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-6 w-20 rounded-full bg-muted/60" />
            ))}
          </div>
        </div>

        <div className="h-32 rounded-lg border bg-card" />

        <div className="space-y-4">
          <div className="h-7 w-48 rounded bg-muted" />
          {Array.from({ length: erratas }, (_, index) => (
            <div key={index} className="space-y-3 rounded-lg border p-4">
              <div className="h-4 w-40 rounded bg-muted/60" />
              <div className="h-4 w-full rounded bg-muted/60" />
              <div className="h-4 w-5/6 rounded bg-muted/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
