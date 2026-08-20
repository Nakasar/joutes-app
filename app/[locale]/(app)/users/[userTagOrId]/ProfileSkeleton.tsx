/**
 * Silhouette d'un profil public.
 *
 * L'écran est une colonne de cartes : l'en-tête avec l'avatar, puis les jeux
 * suivis, les lieux, les succès, les listes. La silhouette en reprend la
 * largeur (`max-w-5xl`) et l'espacement (`space-y-8`).
 *
 * Les proportions viennent de l'écran réel : avatar de 80 px cerclé, pseudo en
 * `text-3xl`, cartes bordées avec en-tête et corps.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la coquille que la frontière
 * vient de rendre possible (voir `components/HeaderFallback.tsx`).
 */
export function ProfileSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-8" role="status" aria-busy="true">
      <span className="sr-only">Chargement du profil…</span>

      <div className="animate-pulse rounded-xl border bg-card p-6" aria-hidden>
        <div className="flex items-start gap-4">
          <div className="h-20 w-20 shrink-0 rounded-full bg-muted ring-4 ring-primary/10" />
          <div className="flex-1 space-y-3">
            <div className="h-8 w-64 max-w-full rounded bg-muted" />
            <div className="h-4 w-80 max-w-full rounded bg-muted/60" />
          </div>
        </div>
      </div>

      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="animate-pulse space-y-4 rounded-xl border bg-card p-6" aria-hidden>
          <div className="h-6 w-48 rounded bg-muted" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((tile) => (
              <div key={tile} className="h-24 rounded-lg bg-muted/40" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
