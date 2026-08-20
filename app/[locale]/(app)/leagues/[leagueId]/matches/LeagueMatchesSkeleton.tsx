/**
 * Silhouettes de l'historique des matchs d'une ligue.
 *
 * Deux zones, deux frontières : l'en-tête sort du document de ligue déjà lu,
 * la liste demande une seconde requête paginée. L'en-tête est décoratif —
 * seule la liste s'annonce, sinon la synthèse vocale dirait deux fois la même
 * chose au même moment.
 *
 * Les proportions viennent de l'écran réel : titre en `text-3xl`, cartes de
 * match bordées.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la coquille que la frontière
 * vient de rendre possible (voir `components/HeaderFallback.tsx`).
 */
export function LeagueMatchesSkeleton({
  section,
  rows = 4,
}: {
  section: "header" | "list";
  rows?: number;
}) {
  if (section === "header") {
    return (
      <div className="flex animate-pulse flex-wrap items-start justify-between gap-4" aria-hidden>
        <div className="flex items-start gap-4">
          <div className="h-9 w-9 shrink-0 rounded-md bg-muted" />
          <div className="space-y-1">
            <div className="h-9 w-72 max-w-full rounded bg-muted" />
            <div className="h-5 w-64 max-w-full rounded bg-muted/60" />
          </div>
        </div>
        <div className="h-9 w-40 rounded-md bg-muted/60" />
      </div>
    );
  }

  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">Chargement des matchs…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="animate-pulse space-y-3 rounded-xl border bg-card p-6" aria-hidden>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="h-5 w-48 rounded bg-muted" />
            <div className="h-5 w-28 rounded bg-muted/60" />
          </div>
          <div className="h-4 w-2/3 rounded bg-muted/60" />
        </div>
      ))}
    </div>
  );
}
