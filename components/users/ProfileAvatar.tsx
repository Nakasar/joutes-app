import { UserRound } from "lucide-react";

import { appearanceForPlan } from "@/lib/subscriptions/tone.ts";
import { accountInitials } from "@/lib/users/initials.ts";
import type { SubscriptionPlanKey } from "@/lib/constants/subscription-plans.ts";
import { cn } from "@/lib/utils.ts";

/**
 * L'avatar d'un compte, avec le contour de son palier.
 *
 * **Le contour ne se règle pas.** Il se dérive du palier affiché
 * (`appearanceForPlan`), et un compte sans abonnement porte `ring-primary/20` —
 * pas d'anneau propriétaire, mais pas d'absence non plus : la même épaisseur,
 * dans la couleur de la maison. Un compte gratuit n'est pas un palier zéro,
 * c'est simplement un compte.
 *
 * Sans image, les initiales du pseudonyme, et une silhouette à défaut de
 * pseudonyme : trois replis, parce qu'un rond vide dans une liste de fiches est
 * impossible à distinguer du suivant.
 */
export function ProfileAvatar({
  src,
  name,
  plan,
  size,
  className,
}: {
  src?: string;
  name?: string;
  plan: SubscriptionPlanKey | null;
  /** Le diamètre en pixels. Le contour s'épaissit avec lui. */
  size: number;
  className?: string;
}) {
  const appearance = appearanceForPlan(plan);
  const initials = accountInitials(name);

  // 2 px jusqu'à 56, 3 au-delà, 4 à partir de 92 : un anneau de 2 px autour
  // d'un avatar de 112 disparaîtrait, et de 4 px autour d'un de 24 le mangerait.
  const ring = size >= 92 ? "ring-4" : size >= 56 ? "ring-[3px]" : "ring-2";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-offset-2 ring-offset-background",
        ring,
        appearance?.ring ?? "ring-primary/20",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        // `next/image` refuserait l'hôte : l'URL vient du compte, et
        // `next.config.ts` ne déclare qu'un hôte distant.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : initials ? (
        <span
          aria-hidden
          className="font-semibold text-muted-foreground"
          style={{ fontSize: Math.round(size * 0.42) }}
        >
          {initials}
        </span>
      ) : (
        <UserRound
          aria-hidden
          className="text-muted-foreground"
          style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5) }}
        />
      )}
    </span>
  );
}
