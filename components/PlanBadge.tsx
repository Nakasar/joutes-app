import { Badge } from "@/components/ui/badge";
import type { SubscriptionPlanKey } from "@/lib/constants/subscription-plans";
import { appearanceForPlan, labelForPlan } from "@/lib/subscriptions/tone";
import { cn } from "@/lib/utils";

/**
 * Le badge du palier d'abonnement, à côté d'un nom de compte.
 *
 * Purement présentationnel : il reçoit le palier, il ne le cherche pas. C'est ce
 * qui lui permet d'être rendu partout — profil public, page de compte, plus tard
 * une liste — sans qu'aucun de ces endroits ne paie une lecture de plus.
 *
 * Ne rend rien sans palier, plutôt qu'un badge neutre : un compte gratuit ne
 * porte aucune marque, ce n'est pas un « palier zéro ».
 */
export function PlanBadge({
  plan,
  className,
}: {
  plan: SubscriptionPlanKey | null;
  className?: string;
}) {
  const appearance = appearanceForPlan(plan);
  const label = labelForPlan(plan);

  if (!appearance || !label) {
    return null;
  }

  return (
    <Badge variant="outline" className={cn(appearance.badge, className)}>
      {label}
    </Badge>
  );
}
