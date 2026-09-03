import { UserRound } from "lucide-react";

import { accountInitials } from "@/lib/users/initials.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Le rond du compte connecté, tel que le porte le déclencheur du menu
 * utilisateur dans l'en-tête.
 *
 * Distinct de `ProfileAvatar`, qui cercle l'avatar de l'anneau du palier :
 * l'en-tête ne connaît pas l'abonnement (la session ne le transporte pas), et
 * un `plan: null` afficherait à tort « compte sans abonnement ». Ici, pas
 * d'anneau — le rond ne dit que qui est connecté.
 *
 * Sans image, les initiales ; sans nom exploitable, une silhouette : un rond
 * vide en haut à droite ne se distinguerait pas d'un bouton qui n'a pas fini
 * de charger.
 */
export function AccountAvatar({
  src,
  name,
  size = 32,
  className,
}: {
  src?: string | null;
  name?: string | null;
  /** Le diamètre en pixels. Les initiales suivent. */
  size?: number;
  className?: string;
}) {
  const initials = accountInitials(name);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted",
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
          className="font-semibold leading-none"
          style={{ fontSize: Math.round(size * 0.4) }}
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
