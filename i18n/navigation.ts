import { createNavigation } from "next-intl/navigation";

import { routing } from "@/i18n/routing";

/**
 * Ces outils remplacent leurs homonymes de `next/link` et `next/navigation`
 * partout où l'on navigue dans le site : ils portent la langue courante sans
 * qu'aucun appelant ait à l'écrire. Un `href="/decks"` reste écrit tel quel et
 * mène à `/en/decks` pour un visiteur anglophone.
 *
 * Les liens sortants (Discord, GitHub) n'ont rien à y gagner et gardent
 * `next/link`.
 */
export const { Link, redirect, permanentRedirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
