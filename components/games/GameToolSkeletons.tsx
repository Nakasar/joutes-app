/**
 * Silhouettes du cadre commun aux outils de jeu.
 *
 * Onze pages partagent la même tête : un bouton de retour, un titre, et la
 * barre d'outils à droite. Elles partagent donc la même silhouette, plutôt que
 * onze approximations qui dériveraient chacune de leur côté.
 *
 * Les hauteurs sont relevées sur l'écran réel : bouton par défaut de 36 px,
 * titre en `text-3xl` (36 px de hauteur de ligne), boutons `secondary` de la
 * barre d'outils de 36 px eux aussi.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la navigation que la frontière
 * vient de rendre instantanée (voir `components/HeaderFallback.tsx`).
 */

/**
 * La barre d'outils seule. Elle montre trois pastilles sur grand écran et une
 * seule en dessous, comme la vraie barre qui bascule en menu déroulant à
 * `lg`. Le nombre exact d'outils dépend du jeu et reste inconnu ici : trois est
 * la valeur la plus fréquente, et un écart d'une pastille ne décale rien
 * puisque le bloc est aligné à droite.
 */
export function GameToolsNavBarSkeleton() {
  return (
    <div className="flex flex-row flex-wrap justify-end gap-2" aria-hidden>
      <div className="hidden h-9 w-24 rounded-md bg-muted lg:block" />
      <div className="hidden h-9 w-24 rounded-md bg-muted lg:block" />
      <div className="h-9 w-28 rounded-md bg-muted" />
    </div>
  );
}

/** Le cadre complet : retour, titre, barre d'outils. */
export function GameToolHeaderSkeleton({ titleWidth = "w-72" }: { titleWidth?: string }) {
  return (
    <div className="flex animate-pulse flex-row flex-wrap justify-between" aria-hidden>
      <div className="flex flex-row flex-wrap gap-4">
        <div className="h-9 w-24 rounded-md bg-muted" />
        <div className={`h-9 max-w-full rounded bg-muted ${titleWidth}`} />
      </div>
      <GameToolsNavBarSkeleton />
    </div>
  );
}

/** Une grille de cartes, pour les outils qui en listent. */
export function GameToolGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid animate-pulse gap-6 md:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="flex flex-col gap-4 rounded-xl border bg-card p-6">
          <div className="h-6 w-3/4 rounded bg-muted" />
          <div className="h-4 w-1/2 rounded bg-muted/60" />
        </div>
      ))}
    </div>
  );
}
