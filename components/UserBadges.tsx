import { PlanBadge } from "@/components/PlanBadge";
import { StatusBadge } from "@/components/StatusBadge";
import type { UserBadges as Badges } from "@/lib/db/user-badges";

/**
 * Les badges d'un compte, dans l'ordre : le palier d'abord, les statuts ensuite.
 *
 * Un seul composant plutôt que deux appels côte à côte, pour que l'ordre et
 * l'espacement soient les mêmes partout. Ne rend rien quand il n'y a rien à
 * montrer — pas même un conteneur vide, qui laisserait une chasse après le
 * pseudonyme des comptes sans badge.
 *
 * **La rangée qui l'accueille doit porter `flex-wrap`** : `Badge` est
 * `shrink-0`, et deux badges derrière un pseudonyme long débordent sinon de leur
 * ligne. `scripts/check-flex-rows.mjs` le vérifie.
 */
export function UserBadges({ badges, className }: { badges: Badges | undefined; className?: string }) {
  if (!badges || (!badges.plan && badges.statuses.length === 0)) {
    return null;
  }

  return (
    <span className={className ?? "inline-flex flex-wrap items-center gap-1"}>
      <PlanBadge plan={badges.plan} />
      {badges.statuses.map((status) => (
        <StatusBadge key={status.id} status={status} />
      ))}
    </span>
  );
}
