/**
 * Silhouettes de la liste des quizz.
 *
 * Deux zones distinctes, deux frontières : l'en-tête ne dépend que du jeu, la
 * liste dépend en plus de la page demandée. Les séparer évite qu'un changement
 * de page fasse clignoter le titre.
 *
 * Les hauteurs sont relevées sur l'écran réel : bouton de retour de 36 px,
 * titre en `text-3xl`, cartes bâties sur la `Card` de l'interface.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la navigation que la frontière
 * vient de rendre instantanée (voir `components/HeaderFallback.tsx`).
 */

export function QuizzHeaderSkeleton() {
  return (
    <div className="flex animate-pulse flex-row flex-wrap items-center gap-4" aria-hidden>
      <div className="h-9 w-28 rounded-md bg-muted" />
      <div className="h-9 w-72 max-w-full rounded bg-muted" />
    </div>
  );
}

export function QuizzListSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid animate-pulse gap-6 md:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="flex flex-col gap-6 rounded-xl border bg-card py-6">
          <div className="px-6 pb-2">
            <div className="h-7 w-3/4 rounded bg-muted" />
          </div>
          <div className="px-6 pb-3">
            <div className="h-[22px] w-32 rounded-full bg-muted/60" />
          </div>
          <div className="px-6">
            <div className="h-5 w-20 rounded bg-muted/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
