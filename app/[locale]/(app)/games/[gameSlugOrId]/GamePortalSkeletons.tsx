/**
 * Silhouettes du portail d'un jeu.
 *
 * L'écran est fait de sections aux dépendances différentes : le héros et les
 * outils ne tiennent qu'au jeu, les boutons de suivi à la session, l'agenda à
 * une seconde lecture en base. Chacune a donc sa frontière, et chacune sa
 * silhouette.
 *
 * Les proportions sont relevées sur l'écran réel : héros de `70vh` (minimum
 * 500 px), vignette du jeu de 128 px, titre en `text-5xl md:text-7xl`, grilles
 * en deux puis trois colonnes.
 *
 * Fond sombre volontaire : le portail est le seul écran de l'application à
 * l'être. Des rectangles clairs y auraient éclairé la page avant de disparaître.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la coquille que la frontière
 * vient de rendre possible (voir `components/HeaderFallback.tsx`).
 */

export function GameHeroSkeleton() {
  return (
    <div
      className="relative h-[70vh] min-h-[500px] overflow-hidden bg-gradient-to-br from-gray-800 via-gray-900 to-black"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Chargement du portail du jeu…</span>

      <div className="absolute inset-0 z-10 flex items-end" aria-hidden>
        <div className="mx-auto w-full max-w-7xl animate-pulse space-y-6 px-8 pb-16">
          <div className="h-32 w-32 rounded-lg border-4 border-white/10 bg-white/10" />
          <div className="h-16 w-2/3 max-w-2xl rounded bg-white/15 md:h-20" />
          <div className="h-9 w-40 rounded-full bg-white/10" />
          <div className="h-7 w-full max-w-3xl rounded bg-white/10" />
          <div className="flex flex-wrap gap-4 pt-4">
            <div className="h-11 w-40 rounded-md bg-white/10" />
            <div className="h-11 w-44 rounded-md bg-white/10" />
            <div className="h-11 w-44 rounded-md bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** La place des boutons de suivi, le temps que la session réponde. */
export function GameActionsSkeleton() {
  return (
    <div className="flex gap-4" aria-hidden>
      <div className="h-11 w-40 animate-pulse rounded-md bg-white/10" />
    </div>
  );
}

/**
 * Une section de cartes sombres, sur deux ou trois colonnes.
 *
 * Décorative, et c'est voulu : cinq sections chargent en même temps sur cet
 * écran. Si chacune s'annonçait, une synthèse vocale débiterait cinq
 * « Chargement de… » d'affilée. Seul le héros parle, au nom de la page.
 */
export function GameSectionSkeleton({
  cards = 4,
  columns = 2,
}: {
  cards?: number;
  columns?: 2 | 3;
}) {
  return (
    <section className="space-y-6" aria-hidden>
      <div className="h-9 w-64 max-w-full animate-pulse rounded bg-white/10" />
      <div className={`grid animate-pulse gap-6 ${columns === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-8">
            <div className="h-6 w-1/2 rounded bg-white/15" />
            <div className="h-4 w-3/4 rounded bg-white/10" />
          </div>
        ))}
      </div>
    </section>
  );
}
