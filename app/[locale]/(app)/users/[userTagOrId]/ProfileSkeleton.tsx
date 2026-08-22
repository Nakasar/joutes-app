/**
 * La silhouette d'une vitrine de profil, le temps qu'elle se lise.
 *
 * Elle ne contient **aucun `Link` localisé** : celui-ci lirait le chemin
 * courant, inconnu au prérendu d'un segment dynamique, et rebloquerait la
 * coquille que cette silhouette est justement là pour libérer.
 */
export function ProfileSkeleton() {
  return (
    <div role="status" aria-busy="true" className="animate-pulse">
      <span className="sr-only">Chargement du profil…</span>

      <div className="h-[132px] w-full bg-muted md:h-[210px]" aria-hidden />

      <div className="container mx-auto max-w-7xl px-4 lg:px-10">
        <div className="-mt-[38px] flex flex-col gap-4 md:-mt-[52px] md:flex-row md:items-end">
          <div className="size-[84px] rounded-full bg-muted ring-4 ring-background md:size-[112px]" />
          <div className="flex flex-1 flex-col gap-2 pb-1">
            <div className="h-8 w-56 rounded bg-muted md:h-10" />
            <div className="h-4 w-72 rounded bg-muted" />
          </div>
          <div className="h-11 w-48 rounded-md bg-muted" />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-[34px]">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex flex-col gap-3">
                <div className="h-6 w-48 rounded bg-muted" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[0, 1, 2].map((card) => (
                    <div key={card} className="h-32 rounded-[10px] bg-muted" />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-40 rounded-xl bg-muted" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
