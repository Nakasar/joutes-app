/**
 * Silhouettes des sections du portail organisateur.
 *
 * Chaque page du portail lit la session et le tournoi : rien de son contenu ne
 * se prérend. Le layout garde sa porte d'authentification devant, donc au
 * chargement à froid ces silhouettes ne s'affichent pas — elles servent en
 * navigation d'une section à l'autre, quand la barre latérale est déjà montée
 * et que seule la zone de contenu se rafraîchit.
 *
 * Elles n'ont aucun texte : les libellés viennent des traductions, qui se lisent
 * avec la langue de la requête. Un `Link` localisé y est également exclu — il
 * rebloquerait la navigation que ces frontières viennent de rendre instantanée
 * (voir `components/HeaderFallback.tsx`).
 *
 * Les hauteurs sont relevées sur les vraies pages, pour que le remplacement ne
 * décale rien : titre 33 px, tuiles de compteur 81 px, lignes de tableau 41 px.
 */

function Header({ actions = 0 }: { actions?: number }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-2">
        <div className="h-[33px] w-64 rounded bg-muted" />
        <div className="h-5 w-96 max-w-full rounded bg-muted" />
      </div>
      {actions > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <div key={i} className="h-9 w-32 rounded bg-muted" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Reprend `min-w-36 flex-1` des vraies tuiles : même repli à toute largeur. */
function Tiles({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-[81px] min-w-36 flex-1 rounded-xl border bg-card" />
      ))}
    </div>
  );
}

function Rows({ count = 8, columns = 7 }: { count?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex h-[38px] items-center gap-4 border-b bg-muted/50 px-4">
        {Array.from({ length: columns }, (_, i) => (
          <div key={i} className="h-2.5 flex-1 rounded bg-muted" />
        ))}
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex h-[41px] items-center gap-4 border-b px-4 last:border-b-0">
          {Array.from({ length: columns }, (_, c) => (
            <div key={c} className="h-3 flex-1 rounded bg-muted/60" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Classement : en-tête, barre d'actions, quatre compteurs, tableau. */
export function StandingsSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <Header actions={4} />
      <Tiles />
      <Rows count={8} columns={7} />
    </div>
  );
}

/** Liste de joueurs : en-tête, compteurs de pointage, tableau. */
export function PlayersSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <Header actions={2} />
      <Tiles count={3} />
      <Rows count={10} columns={5} />
    </div>
  );
}

/** Section en tableau simple : en-tête puis lignes. */
export function TableSectionSkeleton({
  actions = 1,
  rows = 8,
  columns = 5,
}: {
  actions?: number;
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <Header actions={actions} />
      <Rows count={rows} columns={columns} />
    </div>
  );
}

/**
 * Ossature commune aux trois écrans de ronde : bandeau collant (titre, minuteur
 * et actions) puis la rangée d'onglets. Hauteurs relevées sur la vraie page :
 * 71 px pour le bandeau, 40 px pour les onglets.
 */
function RoundChrome() {
  return (
    <>
      <div className="sticky top-0 z-20 flex h-[71px] items-center justify-between gap-4 border-b bg-card/95 px-6">
        <div className="space-y-2">
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="h-3.5 w-52 rounded bg-muted" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-9 w-24 rounded bg-muted" />
          ))}
        </div>
      </div>
      <div className="px-6 pt-4">
        <div className="flex h-10 w-fit gap-1 rounded-lg bg-muted p-1">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="h-8 w-28 rounded bg-card" />
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Colonne « À traiter » et « Activité ». Elle passe sous le contenu en dessous
 * de `xl`, exactement comme `RoundSidePanel`.
 */
function RoundAside() {
  return (
    <div className="w-full shrink-0 space-y-5 border-t bg-card p-5 xl:w-[300px] xl:border-l xl:border-t-0">
      <div className="space-y-2">
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="h-24 rounded-xl border" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="h-16 rounded-xl border" />
      </div>
    </div>
  );
}

/**
 * Matchs d'une ronde : bandeau, onglets, puis deux colonnes — la grille des
 * tables à gauche, « À traiter » à droite. La grille reprend les points de
 * rupture réels (`md:grid-cols-2 2xl:grid-cols-3`) et la hauteur de carte,
 * 117 px, pour que la bascule Grille/Tableau ne fasse pas sauter la page.
 */
export function RoundMatchesSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <RoundChrome />
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <div className="min-w-0 flex-1 p-6 pb-28">
          <div className="mb-4 h-[88px] rounded-xl border bg-card" />
          <div className="mb-4 flex h-9 flex-wrap items-center justify-between gap-2">
            <div className="h-9 w-56 rounded bg-muted" />
            <div className="flex gap-2">
              <div className="h-9 w-32 rounded bg-muted" />
              <div className="h-9 w-36 rounded bg-muted" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-[117px] overflow-hidden rounded-xl border bg-card" />
            ))}
          </div>
        </div>
        <RoundAside />
      </div>
    </div>
  );
}

/** Classement d'une ronde : même ossature, tableau à la place de la grille. */
export function RoundStandingsSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <RoundChrome />
      <div className="p-6">
        <Header actions={4} />
        <Tiles />
        <Rows count={8} columns={7} />
      </div>
    </div>
  );
}

/** Arbre d'élimination : même ossature, un grand bloc à la place du tableau. */
export function RoundBracketSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <RoundChrome />
      <div className="space-y-4 p-6">
        <div className="h-[420px] rounded-xl border bg-card" />
      </div>
    </div>
  );
}

/** Section en cartes : en-tête puis blocs empilés. */
export function CardSectionSkeleton({
  actions = 1,
  cards = 3,
}: {
  actions?: number;
  cards?: number;
}) {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <Header actions={actions} />
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="h-40 rounded-xl border bg-card" />
      ))}
    </div>
  );
}
