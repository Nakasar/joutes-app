/**
 * Silhouette d'un écran de compte.
 *
 * Les six écrans sont bâtis pareil : un bouton de retour, un titre, une phrase
 * d'explication, puis une ou deux cartes bordées. Ils partagent donc la même
 * silhouette.
 *
 * Tout y est derrière la porte, titre compris — on ne montre pas la mise en
 * page d'un espace personnel avant de savoir à qui il appartient. La silhouette
 * ne nomme donc rien.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la coquille que la frontière
 * vient de rendre possible (voir `components/HeaderFallback.tsx`).
 */
export function AccountPanelSkeleton({
  cards = 1,
  label = "Chargement de votre compte",
}: {
  cards?: number;
  label?: string;
}) {
  return (
    <div className="space-y-8" role="status" aria-busy="true">
      <span className="sr-only">{label}…</span>

      <div className="flex animate-pulse items-center gap-4">
        <div className="h-8 w-24 shrink-0 rounded-md bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-10 w-72 max-w-full rounded bg-muted" />
          <div className="h-5 w-96 max-w-full rounded bg-muted/60" />
        </div>
      </div>

      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="animate-pulse space-y-4 rounded-xl border-2 p-6">
          <div className="h-6 w-56 max-w-full rounded bg-muted" />
          <div className="h-4 w-80 max-w-full rounded bg-muted/60" />
          <div className="h-32 rounded-lg bg-muted/40" />
        </div>
      ))}
    </div>
  );
}
