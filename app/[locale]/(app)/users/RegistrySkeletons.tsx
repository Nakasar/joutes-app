/**
 * Les silhouettes du registre.
 *
 * Aucun `Link` localisé : celui-ci lirait le chemin courant et rebloquerait la
 * coquille que ces silhouettes sont là pour libérer.
 */

export function RegistryListSkeleton() {
  return (
    <ul role="status" aria-busy="true" className="flex animate-pulse flex-col gap-3">
      <span className="sr-only">Chargement des profils…</span>
      {[0, 1, 2, 3].map((index) => (
        <li key={index} className="flex gap-4 rounded-xl border p-4">
          <div className="size-16 shrink-0 rounded-full bg-muted" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-5 w-40 rounded bg-muted" />
            <div className="h-3 w-full max-w-[420px] rounded bg-muted" />
            <div className="h-3 w-56 rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RegistrySidebarSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      {[0, 1, 2].map((index) => (
        <div key={index} className="h-40 rounded-xl bg-muted" />
      ))}
    </div>
  );
}
