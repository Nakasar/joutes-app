/**
 * Même identité qu'affiche `PlayerNameTag`, mais en texte simple, pour les
 * endroits qui attendent une chaîne (titres de boîtes de dialogue, phrases
 * interpolées, listes compactes) et ne peuvent pas rendre de balisage.
 */
export function playerTag(name: string, discriminator?: string): string {
  return discriminator ? `${name} #${discriminator}` : name;
}

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
