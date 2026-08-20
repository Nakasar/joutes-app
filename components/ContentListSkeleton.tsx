/**
 * Silhouette d'une liste filtrable — actualités, quizz.
 *
 * Les deux écrans sont bâtis pareil : une barre de filtres, puis une grille de
 * cartes. Ils partagent donc la même silhouette plutôt que deux approximations
 * qui dériveraient chacune de leur côté.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la navigation que la frontière
 * vient de rendre instantanée (voir `components/HeaderFallback.tsx`).
 */
export function ContentListSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="animate-pulse space-y-6" role="status" aria-busy="true">
      <span className="sr-only">Chargement de la liste…</span>
      <div className="flex flex-wrap gap-3">
        <div className="h-10 min-w-0 flex-1 rounded-md bg-muted" />
        <div className="h-10 w-40 rounded-md bg-muted/60" />
        <div className="h-10 w-40 rounded-md bg-muted/60" />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="flex flex-col gap-4 rounded-xl border bg-card p-6">
            <div className="h-6 w-3/4 rounded bg-muted" />
            <div className="h-4 w-1/3 rounded bg-muted/60" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-muted/60" />
              <div className="h-4 w-5/6 rounded bg-muted/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
