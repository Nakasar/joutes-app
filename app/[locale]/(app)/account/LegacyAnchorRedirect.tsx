"use client";

import { useEffect } from "react";

import { useRouter } from "@/i18n/navigation.ts";

/**
 * Les ancres d'avant les onglets.
 *
 * `/account#jeux` et `/account#prices` sont partis dans des marque-pages et des
 * liens que le dépôt ne contrôle pas. Un fragment d'URL n'étant **jamais**
 * envoyé au serveur, aucune redirection ne peut le voir : il faut le lire dans
 * le navigateur, ce que fait ce composant, et il faut le lire une seule fois —
 * le remplacement de l'URL efface le fragment, donc l'effet ne se rejoue pas.
 *
 * Les quatre liens internes ont été corrigés à la source ; ceci ne sert qu'à ce
 * qui vient du dehors.
 */

const TARGETS: Record<string, string> = {
  "#jeux": "/account?tab=games",
  "#prices": "/account?tab=profile#prices",
};

export default function LegacyAnchorRedirect() {
  const router = useRouter();

  useEffect(() => {
    const target = TARGETS[window.location.hash];
    if (target) {
      router.replace(target);
    }
  }, [router]);

  return null;
}
