/**
 * Silhouette de la page d'une ligue.
 *
 * Une seule frontière ici, contrairement au portail d'un jeu ou à la page d'un
 * lieu : **toutes** les sections de cette page dépendent de la session — le
 * classement en dépend pour savoir qui lit, les boutons Rejoindre et Quitter
 * évidemment, les tournois pour les droits d'organisation. Les découper ferait
 * quatre frontières qui attendent toutes la même chose.
 *
 * La silhouette reprend donc la page entière : en-tête, bannière, puis la
 * grille deux tiers / un tiers.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la coquille que la frontière
 * vient de rendre possible (voir `components/HeaderFallback.tsx`).
 */
export function LeagueDetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">Chargement de la ligue…</span>

      <div className="flex animate-pulse flex-wrap items-start justify-between gap-4" aria-hidden>
        <div className="flex items-start gap-4">
          <div className="h-9 w-9 shrink-0 rounded-md bg-muted" />
          <div className="space-y-2">
            <div className="h-10 w-80 max-w-full rounded bg-muted" />
            <div className="h-6 w-96 max-w-full rounded bg-muted/60" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-44 rounded-md bg-muted/60" />
          <div className="h-9 w-24 rounded-md bg-muted/60" />
        </div>
      </div>

      <div className="grid animate-pulse grid-cols-1 gap-6 lg:grid-cols-3" aria-hidden>
        <div className="space-y-6 lg:col-span-2">
          <div className="h-80 rounded-xl border bg-card" />
          <div className="h-48 rounded-xl border bg-card" />
        </div>
        <div className="space-y-6">
          <div className="h-56 rounded-xl border bg-card" />
          <div className="h-40 rounded-xl border bg-card" />
        </div>
      </div>
    </div>
  );
}
