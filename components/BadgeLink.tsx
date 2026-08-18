"use client";

import { useRouter } from "@/i18n/navigation";
import type { ReactNode } from "react";

/**
 * Rend un badge cliquable, vers la page d'offres.
 *
 * **Pourquoi pas un `<Link>`.** Ces badges vivent à côté de pseudonymes, et la
 * plupart de ces pseudonymes sont déjà dans une carte enveloppée d'un lien —
 * une ligne d'échange, une fiche d'ami, un membre de groupe. Un `<a>` dans un
 * `<a>` est du HTML invalide : le navigateur referme le premier, et la moitié de
 * la carte cesse de mener où elle promettait.
 *
 * On navigue donc à la main, en arrêtant la propagation pour que le clic ne
 * suive pas aussi le lien de la carte. `role="link"` et la touche Entrée
 * rendent au clavier ce que le `<span>` retire — Entrée seule, comme un vrai
 * lien : sur un lien, la barre d'espace fait défiler la page, et l'intercepter
 * retirerait au clavier un geste que rien ne remplace.
 */
export function BadgeLink({
  children,
  label,
  href = "/pricing",
}: {
  children: ReactNode;
  /** Ce qu'annoncent les lecteurs d'écran, le badge n'étant qu'un mot. */
  label: string;
  href?: string;
}) {
  const router = useRouter();

  const go = () => router.push(href);

  return (
    <span
      role="link"
      tabIndex={0}
      aria-label={label}
      className="cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        go();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        go();
      }}
    >
      {children}
    </span>
  );
}
