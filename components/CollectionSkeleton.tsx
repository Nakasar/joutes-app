/**
 * Silhouette d'une vue en grille : titre, sous-titre, puis vignettes.
 *
 * Collections, cubes, extensions, boosters — une douzaine d'écrans sont bâtis
 * pareil, avec un conteneur `container mx-auto p-4 sm:p-6` et un composant
 * client qui affiche une grille. Ils partagent donc la même silhouette plutôt
 * qu'une douzaine d'approximations.
 *
 * Aucun `Link` localisé dedans : il rebloquerait la coquille que la frontière
 * vient de rendre possible (voir `components/HeaderFallback.tsx`).
 */
export function CollectionSkeleton({
  tiles = 8,
  label = "Chargement",
}: {
  tiles?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}…</span>

      <div className="animate-pulse space-y-2">
        <div className="h-8 w-72 max-w-full rounded bg-muted" />
        <div className="h-5 w-96 max-w-full rounded bg-muted/60" />
      </div>

      <div className="mt-6 grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: tiles }, (_, index) => (
          <div key={index} className="space-y-3 rounded-xl border p-4">
            <div className="aspect-[3/2] rounded-lg bg-muted" />
            <div className="h-5 w-2/3 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
