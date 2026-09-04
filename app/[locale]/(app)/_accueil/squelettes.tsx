/**
 * Les squelettes de l'accueil.
 *
 * Ils réservent la place de ce qui VA venir, jamais de ce qui pourrait ne pas
 * venir : le bandeau des directs et la tuile du sondage n'en ont donc pas —
 * le cas courant, pour eux, est de ne rien afficher.
 */

function Plaque({ className }: { className?: string }) {
  return <div aria-hidden className={`bg-card/60 animate-pulse rounded-xl border ${className}`} />;
}

export function SqueletteAgenda() {
  return (
    <div className="flex flex-col gap-4">
      <Plaque className="h-6 w-48 rounded-md border-0" />
      <div className="grid gap-5 pt-3 sm:grid-cols-3 sm:gap-0">
        <Plaque className="h-52 sm:-mr-4" />
        <Plaque className="h-52 sm:mt-4 sm:-mr-4" />
        <Plaque className="h-52 sm:mt-[7px]" />
      </div>
    </div>
  );
}

export function SqueletteFil() {
  return (
    <div className="flex flex-col gap-5">
      <Plaque className="h-9 w-full rounded-md border-0" />
      <Plaque className="h-[132px]" />
      <Plaque className="h-[132px]" />
      <Plaque className="h-[132px]" />
    </div>
  );
}

export function SqueletteTuile() {
  return <Plaque className="h-56" />;
}
