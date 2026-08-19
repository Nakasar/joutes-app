/**
 * Silhouette du calendrier, affichée le temps que le vrai calendrier arrive.
 *
 * Le calendrier dépend de trois choses qu'on ne connaît qu'à la requête : le
 * mois demandé dans l'URL, la session, et les lieux que l'utilisateur suit. Il
 * attend donc derrière une frontière, et c'est cette silhouette qui part dans
 * la coquille statique à sa place.
 *
 * Les dimensions reprennent celles mesurées sur la vraie page — bandeau, carte
 * du mois, carte de la grille, cellules à `min-h-[96px]` sur six rangées —
 * pour que le remplacement ne décale rien. Le bloc du haut diffère selon qu'on
 * soit connecté ou non : il reste neutre.
 *
 * Aucun `Link` localisé ici : il rappellerait le chemin courant et rebloquerait
 * ce que cette frontière vient de débloquer (voir `HeaderFallback`).
 */
export default function EventsCalendarSkeleton() {
  return (
    <div className="container mx-auto p-6 max-w-4xl" aria-hidden>
      <div className="space-y-6 animate-pulse">
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="size-16 rounded-lg bg-muted" />
          <div className="h-10 w-[26rem] max-w-full rounded bg-muted" />
          <div className="h-7 w-[22rem] max-w-full rounded bg-muted" />
        </div>

        <div className="h-[66px] rounded-lg border" />

        <div className="rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="size-9 rounded bg-muted" />
            <div className="flex flex-col items-center gap-2">
              <div className="h-7 w-40 rounded bg-muted" />
              <div className="h-4 w-28 rounded bg-muted" />
            </div>
            <div className="size-9 rounded bg-muted" />
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <div className="h-9 w-40 rounded bg-muted" />
            <div className="h-9 w-28 rounded bg-muted" />
            <div className="h-9 w-36 rounded bg-muted" />
          </div>
        </div>

        <div className="rounded-xl border p-6 space-y-2">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }, (_, index) => (
              <div key={index} className="h-9 rounded bg-muted" />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 42 }, (_, index) => (
              <div key={index} className="min-h-[96px] rounded-lg border" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
