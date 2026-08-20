/**
 * Silhouettes de la page des rulings.
 *
 * Deux zones, deux frontières : l'en-tête ne dépend que du jeu, la liste dépend
 * en plus de la session — les droits d'ajout et de vote — et de la page
 * demandée. Les séparer garde le titre en place pendant que la liste se
 * rafraîchit.
 *
 * Le bouton d'ajout n'a pas de silhouette : il ne s'affiche qu'aux personnes
 * qui en ont le droit, et en réserver la place à tout le monde ferait sauter la
 * mise en page pour la majorité qui ne le verra jamais.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la navigation que la frontière
 * vient de rendre instantanée (voir `components/HeaderFallback.tsx`).
 */

export function PoliciesHeaderSkeleton() {
  return (
    <div className="flex animate-pulse flex-row flex-wrap justify-between" aria-hidden>
      <div className="flex flex-row flex-wrap gap-4">
        <div className="h-9 w-28 rounded-md bg-muted" />
        <div className="h-9 w-72 max-w-full rounded bg-muted" />
      </div>
      <div className="h-9 w-64 max-w-full rounded-md bg-muted/60" />
    </div>
  );
}

export function PoliciesListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex flex-col gap-4 rounded-xl border bg-card p-6">
          <div className="h-5 w-1/2 rounded bg-muted" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-muted/60" />
            <div className="h-4 w-11/12 rounded bg-muted/60" />
            <div className="h-4 w-2/3 rounded bg-muted/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
