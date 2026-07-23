/**
 * Nom d'un joueur suivi, en plus discret, de son discriminateur à 4 chiffres
 * (compte ou invité) pour différencier les homonymes.
 */
export function PlayerNameTag({
  name,
  discriminator,
  className,
}: {
  name: string;
  discriminator?: string;
  className?: string;
}) {
  return (
    <span className={className}>
      {name}
      {discriminator && (
        <span className="ml-1 text-xs font-normal text-muted-foreground">#{discriminator}</span>
      )}
    </span>
  );
}
