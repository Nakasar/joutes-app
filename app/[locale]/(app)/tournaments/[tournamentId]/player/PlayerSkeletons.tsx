/**
 * Silhouettes du portail joueur.
 *
 * Les quatre écrans sont entièrement client : ils lisent le paramètre d'URL avec
 * `use(params)`, et `PlayerShell` consulte l'horloge à chaque rendu pour son
 * minuteur. Rien de tout cela ne se prérend, d'où une frontière `<Suspense>`
 * posée depuis l'enveloppe serveur — c'est la première recette de
 * `blocking-prerender-current-time-client`.
 *
 * Ce repli est donc ce qu'un joueur reçoit en premier, avant même l'hydratation.
 * Il reprend l'ossature de `PlayerShell` au pixel : en-tête sombre de 133 px,
 * contenu remonté de 4 px sous l'en-tête, barre d'onglets fixe de 70 px à
 * quatre entrées.
 *
 * Les onglets sont des blocs inertes, pas des `Link` localisés : un lien
 * localisé rappellerait le chemin courant et rebloquerait ce que cette frontière
 * vient de débloquer (voir `components/HeaderFallback.tsx`).
 */

/** En-tête sombre : tournoi, ronde, minuteur, ligne de participation. */
function PlayerHeader() {
  return (
    <header className="bg-neutral-950 px-5 pb-7 pt-4 text-white">
      {/* 45 px : la colonne du minuteur est plus haute que celle du titre. */}
      <div className="flex h-[45px] items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="h-[15px] w-40 rounded bg-neutral-800" />
          <div className="h-3 w-32 rounded bg-neutral-900" />
        </div>
        <div className="shrink-0 space-y-1.5 text-right">
          <div className="ml-auto h-6 w-20 rounded bg-neutral-800" />
          <div className="ml-auto h-2.5 w-12 rounded bg-neutral-900" />
        </div>
      </div>
      <div className="mt-3 flex h-8 items-center justify-between gap-2">
        <div className="h-3 w-44 rounded bg-neutral-900" />
        <div className="size-8 rounded bg-neutral-900" />
      </div>
    </header>
  );
}

/** Barre d'onglets au pouce. Quatre entrées, comme `SECTIONS` sans le formulaire. */
function PlayerTabs() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-2xl border-t bg-card/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 backdrop-blur">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-2 text-[11px]"
        >
          <div className="size-5 rounded bg-muted" />
          <div className="h-[17px] w-12 rounded bg-muted" />
        </div>
      ))}
    </nav>
  );
}

function PlayerScreen({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl animate-pulse flex-col pb-24"
      aria-hidden
    >
      <PlayerHeader />
      <div className="-mt-4 flex-1 px-4">{children}</div>
      <PlayerTabs />
    </div>
  );
}

/**
 * Mon match : la carte de table (294 px), le bouton de rapport (56 px), le
 * récapitulatif (117 px) et le retrait du tournoi (36 px). Hauteurs relevées sur
 * la vraie page, à quatre blocs comme elle.
 */
export function PlayerMatchSkeleton() {
  return (
    <PlayerScreen>
      <div className="space-y-4">
        <div className="h-[294px] rounded-2xl border bg-card" />
        <div className="h-14 rounded-xl bg-muted" />
        <div className="h-[117px] rounded-xl border bg-muted/40" />
        <div className="h-9 rounded-xl bg-muted/40" />
      </div>
    </PlayerScreen>
  );
}

/**
 * Classement : sélecteur de ronde (36 px), titre de ronde (60 px), la section
 * des matchs puis celle du classement — chacune un intitulé de 20 px suivi de
 * son contenu, avec le champ de recherche à 36 px devant le tableau.
 */
export function PlayerStandingsSkeleton() {
  return (
    <PlayerScreen>
      <div className="space-y-6">
        <div className="flex h-9 items-center gap-2">
          <div className="size-9 shrink-0 rounded-lg border" />
          <div className="h-4 flex-1 rounded bg-muted" />
          <div className="size-9 shrink-0 rounded-lg border" />
        </div>

        <div className="flex h-[60px] flex-wrap items-center justify-between gap-3">
          <div className="h-7 w-40 rounded bg-muted" />
          <div className="h-7 w-32 rounded bg-muted" />
        </div>

        <div className="space-y-2">
          <div className="h-5 w-24 rounded bg-muted" />
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-[125px] rounded-xl border bg-card" />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-5 w-56 rounded bg-muted" />
          <div className="h-9 rounded-lg border" />
          <div className="h-[420px] rounded-lg border" />
        </div>
      </div>
    </PlayerScreen>
  );
}

/**
 * Joueurs : trois cartes empilées — le déroulé du tournoi (116 px), mes matchs
 * (192 px) et la liste des joueurs, qui prend le reste.
 */
export function PlayerPlayersSkeleton() {
  return (
    <PlayerScreen>
      <div className="space-y-4">
        <div className="h-[116px] rounded-xl border bg-card" />
        <div className="h-[192px] rounded-xl border bg-card" />
        <div className="h-[560px] rounded-xl border bg-card" />
      </div>
    </PlayerScreen>
  );
}

/**
 * Mes infos : une seule carte — titre, phrase d'explication, puis les champs du
 * formulaire d'inscription.
 */
export function PlayerFormSkeleton() {
  return (
    <PlayerScreen>
      <div className="rounded-xl border bg-card p-4">
        <div className="h-6 w-44 rounded bg-muted" />
        <div className="mb-3.5 mt-0.5 space-y-1.5">
          <div className="h-4 w-full rounded bg-muted/60" />
          <div className="h-4 w-2/3 rounded bg-muted/60" />
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-[52px] rounded-lg border" />
            </div>
          ))}
        </div>
      </div>
    </PlayerScreen>
  );
}
