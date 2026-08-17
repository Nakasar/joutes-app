import { Badge } from "@/components/ui/badge";
import { BadgeLink } from "@/components/BadgeLink";
import type { SubscriptionPlanKey } from "@/lib/constants/subscription-plans";
import { appearanceForPlan, labelForPlan } from "@/lib/subscriptions/tone";
import { cn } from "@/lib/utils";

/**
 * Le badge du palier d'abonnement, à côté d'un nom de compte.
 *
 * Purement présentationnel : il reçoit le palier, il ne le cherche pas. C'est ce
 * qui lui permet d'être rendu partout — profil public, liste d'amis, membres
 * d'un groupe, auteur d'une actualité — sans qu'aucun de ces endroits ne paie
 * une lecture de plus. Les badges d'une liste se lisent en un coup, par
 * `lib/db/user-badges.ts`.
 *
 * Ne rend rien sans palier, plutôt qu'un badge neutre : un compte gratuit ne
 * porte aucune marque, ce n'est pas un « palier zéro ».
 *
 * Il mène à la page d'offres — c'est la seule façon qu'a quelqu'un de savoir ce
 * que ce mot désigne. `interactive={false}` le rend inerte là où il décrit
 * l'abonnement de la page elle-même : sur « mon abonnement », s'y renvoyer
 * n'apprendrait rien.
 */
export function PlanBadge({
  plan,
  className,
  interactive = true,
}: {
  plan: SubscriptionPlanKey | null;
  className?: string;
  interactive?: boolean;
}) {
  const appearance = appearanceForPlan(plan);
  const label = labelForPlan(plan);

  if (!appearance || !label) {
    return null;
  }

  const badge = (
    <Badge variant="outline" className={cn(appearance.badge, className)}>
      {label}
    </Badge>
  );

  return interactive ? <BadgeLink label={label}>{badge}</BadgeLink> : badge;
}
