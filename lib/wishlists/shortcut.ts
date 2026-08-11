import type { Wishlist } from "@/lib/types/Wishlist";

/**
 * Le raccourci « ajouter à ma liste » posé à côté du cœur.
 *
 * Ajouter une carte demandait deux gestes : ouvrir le panneau, puis choisir la
 * liste — à chaque carte, alors que la réponse est presque toujours la même.
 * Le raccourci vise **une** liste, nommée sur le bouton : il ne devine jamais
 * en silence.
 *
 * Module pur, sans accès au réseau ni au stockage : c'est ce qui le rend
 * testable. La lecture de la préférence vit dans
 * `lib/wishlists/my-wishlists-client.ts`.
 */

export type MyWishlists = {
  personal: Wishlist[];
  groups: { group: { id: string; name: string }; wishlists: Wishlist[] }[];
};

export function allWishlists(data: MyWishlists): Wishlist[] {
  return [...data.personal, ...data.groups.flatMap((entry) => entry.wishlists)];
}

/**
 * La liste que vise le raccourci, ou `null` s'il ne doit pas s'afficher.
 *
 * Dans l'ordre :
 *
 *  1. la **dernière liste utilisée**, si elle existe toujours. C'est le seul
 *     signal qui vient de l'utilisateur, il passe donc avant ;
 *  2. à défaut, son **unique liste personnelle** : là où il n'y a pas de choix,
 *     il n'y a pas de doute ;
 *  3. sinon rien. Deux listes et aucune préférence, c'est à l'utilisateur de
 *     trancher — un raccourci qui choisirait à sa place ferait perdre plus de
 *     temps à défaire qu'il n'en fait gagner.
 *
 * Les listes de groupe ne servent jamais de repli : elles appartiennent à
 * plusieurs, et y verser une carte d'un geste distrait se voit.
 */
export function pickShortcutWishlist(
  data: MyWishlists,
  preferredId: string | null
): Wishlist | null {
  if (preferredId) {
    const preferred = allWishlists(data).find((wishlist) => wishlist.id === preferredId);
    if (preferred) return preferred;
  }

  return data.personal.length === 1 ? data.personal[0] : null;
}
