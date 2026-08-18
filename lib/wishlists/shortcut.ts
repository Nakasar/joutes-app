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
 * C'est la **liste par défaut** de l'utilisateur, celle qu'il désigne lui-même
 * depuis l'écran de ses listes, et qui est automatiquement la première qu'il a
 * créée.
 *
 * La version précédente suivait la dernière liste utilisée, mémorisée dans le
 * navigateur. Cette préférence-là était une approximation du même signal — « où
 * veut-il que ça aille ? » — mais devinée plutôt que dite, et invisible. La
 * liste par défaut la remplace : elle s'affiche, elle se change, et elle vaut
 * d'un appareil à l'autre.
 *
 * Les listes de groupe ne sont jamais visées : elles appartiennent à plusieurs,
 * et y verser une carte d'un geste distrait se voit. Un utilisateur qui n'a que
 * des listes de groupe n'a donc pas de raccourci.
 */
export function pickShortcutWishlist(data: MyWishlists): Wishlist | null {
  return data.personal.find((wishlist) => wishlist.isDefault) ?? null;
}

/**
 * Le nom donné à la liste créée d'office au premier ajout rapide.
 *
 * Une donnée stockée, pas un libellé d'interface : elle n'est donc pas traduite.
 * La faire dépendre de la langue du navigateur au moment de la création
 * donnerait à deux comptes de la même personne deux noms différents, pour une
 * liste qu'elle peut de toute façon renommer.
 */
export const DEFAULT_WISHLIST_NAME = "Générale";

/**
 * Ce que vise le raccourci : une liste existante, ou la création de la
 * première.
 *
 * Un compte tout neuf n'a aucune liste, et le raccourci disparaissait — le
 * premier ajout demandait donc d'ouvrir le panneau, de nommer une liste, puis
 * d'ajouter. Il crée maintenant « Générale » au passage, en le disant sur le
 * bouton : le raccourci ne devine toujours rien en silence.
 *
 * La création n'est proposée que si le compte n'a **aucune liste personnelle**.
 * En proposer une à qui en a déjà — mais sans liste par défaut, ce qui ne
 * devrait pas arriver — ajouterait une liste de plus, et pourrait buter sur la
 * limite au lieu d'ajouter la carte.
 */
export type ShortcutTarget =
  | { kind: "existing"; wishlist: Wishlist }
  | { kind: "create"; name: string }
  | null;

export function pickShortcutTarget(data: MyWishlists): ShortcutTarget {
  const wishlist = pickShortcutWishlist(data);
  if (wishlist) {
    return { kind: "existing", wishlist };
  }

  return data.personal.length === 0 ? { kind: "create", name: DEFAULT_WISHLIST_NAME } : null;
}
