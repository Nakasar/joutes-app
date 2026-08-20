/**
 * Silhouette d'un article — actualité, quizz.
 *
 * Une barre d'actions, un titre, une ligne de métadonnées, puis le corps. Les
 * deux écrans sont bâtis pareil et partagent donc la même silhouette.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la navigation que la frontière
 * vient de rendre instantanée (voir `components/HeaderFallback.tsx`).
 */
export function ArticleSkeleton({ paragraphs = 6 }: { paragraphs?: number }) {
  return (
    <div className="animate-pulse space-y-6" role="status" aria-busy="true">
      <span className="sr-only">Chargement de l&apos;article…</span>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="h-8 w-40 rounded-md bg-muted" />
        <div className="h-8 w-28 rounded-md bg-muted/60" />
      </div>

      <div className="space-y-3">
        <div className="h-10 w-4/5 rounded bg-muted" />
        <div className="h-4 w-56 rounded bg-muted/60" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: paragraphs }, (_, index) => (
          <div key={index} className="space-y-2">
            <div className="h-4 w-full rounded bg-muted/60" />
            <div className="h-4 w-11/12 rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
