import { Link } from "@/i18n/navigation";
import { UserBadges } from "@/components/UserBadges";
import type { AuthorSummary } from "@/lib/db/user-badges";
import { cn } from "@/lib/utils";

/**
 * Un pseudonyme suivi de ses badges.
 *
 * Le tag complet — `Pseudo#1234` — plutôt que le seul nom d'affichage : c'est ce
 * qui identifie un compte sans ambiguïté, deux personnes pouvant porter le même
 * pseudonyme. Le discriminant retombe silencieusement sur le nom d'utilisateur
 * pour les comptes qui n'en ont pas.
 *
 * La rangée porte `flex-wrap` : un pseudonyme long suivi de deux badges déborde
 * sinon de sa ligne, `Badge` étant `shrink-0`.
 */
export function userLabel(user: {
  username: string;
  displayName?: string;
  discriminator?: string;
}): string {
  return user.displayName && user.discriminator
    ? `${user.displayName}#${user.discriminator}`
    : user.displayName || user.username;
}

export function UserLabel({
  user,
  className,
  linkToProfile = true,
}: {
  user: AuthorSummary | null | undefined;
  className?: string;
  linkToProfile?: boolean;
}) {
  if (!user) {
    return null;
  }

  const label = userLabel(user);

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {linkToProfile ? (
        <Link href={`/users/${user.id}`} className="hover:underline">
          {label}
        </Link>
      ) : (
        label
      )}
      <UserBadges badges={user.badges} />
    </span>
  );
}
