/**
 * Silhouettes de la vitrine d'un lieu.
 *
 * Deux niveaux, comme les deux frontières de la page : la vitrine entière
 * — bannière, barre d'onglets, deux colonnes — tant que le lieu n'est pas lu,
 * puis chaque colonne séparément, le temps des événements et des jeux.
 *
 * Les proportions sont relevées sur l'écran réel : bannière de 300 px, barre
 * d'onglets de 50 px, lignes d'événement de 62 px.
 *
 * Seule la vitrine s'annonce. Les colonnes sont décoratives : elles chargent
 * ensemble, et deux « Chargement de… » d'affilée seraient illisibles à la
 * synthèse vocale.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la coquille que la frontière
 * vient de rendre possible (voir `components/HeaderFallback.tsx`).
 */

/** La vitrine entière, tant que le lieu n'est pas lu. */
export function LairPortalSkeleton() {
  return (
    <div className="min-h-screen" role="status" aria-busy="true">
      <span className="sr-only">Chargement du lieu…</span>

      <div
        className="relative h-72 w-full bg-gradient-to-br from-primary/40 to-purple-600/40 md:h-[300px]"
        aria-hidden
      >
        <div className="absolute inset-0 flex items-end bg-black/40">
          <div className="container mx-auto max-w-7xl animate-pulse px-4 pb-6 lg:px-10">
            <div className="mb-4 h-12 w-2/3 max-w-xl rounded bg-white/20" />
            <div className="flex flex-wrap items-center gap-4">
              <div className="h-8 w-32 rounded-md bg-white/20" />
              <div className="h-8 w-28 rounded-md bg-white/15" />
            </div>
          </div>
        </div>
      </div>

      <div className="border-b bg-card/95" aria-hidden>
        <div className="container mx-auto flex max-w-7xl animate-pulse items-center gap-5 px-4 py-3.5 lg:px-10">
          {[80, 64, 96, 72].map((width, index) => (
            <div key={index} className="h-5 rounded bg-muted" style={{ width }} />
          ))}
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 pt-8 pb-11 lg:px-10" aria-hidden>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <LairEventsSkeleton />
          <LairSidebarSkeleton />
        </div>
      </div>
    </div>
  );
}

/** La colonne principale : quelques blocs de hauteurs décroissantes. */
export function LairEventsSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-[34px]" aria-hidden>
      <div className="h-64 rounded-xl border bg-card" />
      <div className="flex flex-col gap-3.5">
        <div className="h-7 w-48 rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-56 rounded-xl border bg-card" />
          <div className="h-56 rounded-xl border bg-card" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="mb-1.5 h-7 w-56 rounded bg-muted" />
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-[62px] rounded-[10px] border bg-card" />
        ))}
      </div>
    </div>
  );
}

/** La colonne de droite : quatre cartes, de la plus haute à la plus basse. */
export function LairSidebarSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      {[300, 210, 190, 260].map((height, index) => (
        <div key={index} className="rounded-xl border bg-card" style={{ height }} />
      ))}
    </div>
  );
}
