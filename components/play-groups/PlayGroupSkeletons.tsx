/**
 * Silhouettes des écrans de groupe de jeu.
 *
 * Les deux écrans — portail et membres — ont la même tête : un titre, une
 * phrase d'explication, et à droite un bouton de retour suivi de la barre
 * d'outils. Ils partagent donc la même silhouette.
 *
 * Les hauteurs sont relevées sur l'écran réel : titre en `text-3xl`,
 * explication en `mt-2`, boutons de 36 px, cartes de membre bordées en `p-4`.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la coquille que la frontière
 * vient de rendre possible (voir `components/HeaderFallback.tsx`).
 */

export function PlayGroupScreenSkeleton({
  rows = 4,
  label = "Chargement du groupe",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">{label}…</span>

      <div className="flex animate-pulse flex-wrap items-center justify-between gap-4">
        <div>
          <div className="h-9 w-64 max-w-full rounded bg-muted" />
          <div className="mt-2 h-5 w-80 max-w-full rounded bg-muted/60" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-9 w-24 rounded-md bg-muted" />
          <div className="h-9 w-32 rounded-md bg-muted/60" />
        </div>
      </div>

      <div className="animate-pulse space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="rounded-lg border p-4">
            <div className="h-5 w-48 max-w-full rounded bg-muted" />
            <div className="mt-2 h-4 w-24 rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
