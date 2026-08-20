/**
 * Silhouettes de la page d'un lieu.
 *
 * Quatre sections aux dépendances différentes : la bannière et les informations
 * pratiques ne tiennent qu'au lieu, les boutons à la session, les jeux à autant
 * de lectures qu'il y a de jeux, l'agenda aux événements et à la page demandée.
 *
 * Les proportions sont relevées sur l'écran réel : bannière de 256 px (384 en
 * `md`), titre en `text-4xl md:text-6xl`, vignettes de jeu de 320 × 192 px.
 *
 * Seule la bannière s'annonce. Les autres sont décoratives : quatre sections
 * chargent ensemble, et quatre « Chargement de… » d'affilée seraient illisibles
 * à la synthèse vocale.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la coquille que la frontière
 * vient de rendre possible (voir `components/HeaderFallback.tsx`).
 */

export function LairHeroSkeleton() {
  return (
    <div
      className="relative h-64 w-full bg-gradient-to-br from-primary/40 to-purple-600/40 md:h-96"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Chargement du lieu…</span>
      <div className="absolute inset-0 flex items-end bg-black/40" aria-hidden>
        <div className="container mx-auto animate-pulse px-4 py-8">
          <div className="mb-4 h-12 w-2/3 max-w-xl rounded bg-white/20 md:h-16" />
          <div className="flex flex-wrap items-center gap-4">
            <div className="h-8 w-32 rounded-md bg-white/20" />
            <div className="h-8 w-28 rounded-md bg-white/15" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** La place des informations pratiques — adresse, site, coordonnées. */
export function LairInfoSkeleton() {
  return (
    <div className="mb-8 animate-pulse rounded-lg border bg-card p-6" aria-hidden>
      <div className="mb-4 h-6 w-56 rounded bg-muted" />
      <div className="space-y-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-start gap-3">
            <div className="h-4 w-24 shrink-0 rounded bg-muted/60" />
            <div className="h-4 w-64 max-w-full rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Le carrousel des jeux proposés : des vignettes de 320 × 192 px. */
export function LairGamesSkeleton({ tiles = 3 }: { tiles?: number }) {
  return (
    <div className="mb-12 animate-pulse" aria-hidden>
      <div className="mb-6 space-y-2">
        <div className="h-9 w-72 max-w-full rounded bg-muted" />
        <div className="h-5 w-96 max-w-full rounded bg-muted/60" />
      </div>
      <div className="flex gap-6 overflow-hidden pb-6">
        {Array.from({ length: tiles }, (_, index) => (
          <div key={index} className="h-48 w-80 shrink-0 rounded-xl bg-muted shadow-lg" />
        ))}
      </div>
    </div>
  );
}

/** L'agenda : un en-tête de carte, puis la grille du calendrier. */
export function LairEventsSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border bg-card" aria-hidden>
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-9 w-72 max-w-full rounded bg-muted" />
        <div className="h-9 w-40 rounded-md bg-muted/60" />
      </div>
      <div className="px-6 pb-6">
        <div className="h-80 rounded-lg bg-muted/40" />
      </div>
    </div>
  );
}
