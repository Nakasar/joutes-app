/**
 * Silhouettes de la page d'un événement.
 *
 * Deux zones, deux frontières : l'en-tête ne tient qu'à l'événement — nom, jeu,
 * état — quand le corps demande en plus la session, le tournoi rattaché et,
 * pour l'organisation seule, la liste des participants.
 *
 * Seul le corps s'annonce ; l'en-tête est décoratif, sinon la synthèse vocale
 * dirait deux fois la même chose au même moment.
 *
 * Les proportions viennent de l'écran réel : titre en `text-3xl`, deux colonnes
 * à partir de `lg`, cartes bordées.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la coquille que la frontière
 * vient de rendre possible (voir `components/HeaderFallback.tsx`).
 */
export function EventDetailSkeleton({ section }: { section: "header" | "body" }) {
  if (section === "header") {
    return (
      <div className="flex animate-pulse flex-wrap items-start justify-between gap-2" aria-hidden>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-9 w-72 max-w-full rounded bg-muted" />
            <div className="h-6 w-24 rounded-full bg-muted/60" />
          </div>
          <div className="h-5 w-48 rounded bg-muted/60" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-6 w-24 rounded-full bg-muted/60" />
          <div className="h-8 w-8 rounded-md bg-muted/60" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3" role="status" aria-busy="true">
      <span className="sr-only">Chargement de l&apos;événement…</span>
      <div className="space-y-6 lg:col-span-2" aria-hidden>
        <div className="h-64 animate-pulse rounded-xl border bg-card" />
        <div className="h-40 animate-pulse rounded-xl border bg-card" />
      </div>
      <div className="space-y-6" aria-hidden>
        <div className="h-48 animate-pulse rounded-xl border bg-card" />
        <div className="h-32 animate-pulse rounded-xl border bg-card" />
      </div>
    </div>
  );
}
