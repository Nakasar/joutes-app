import type { SubscriptionPlanKey } from "@/lib/constants/subscription-plans";
import { seatsFor } from "./entitlements";

/**
 * Qui peut rattacher un lieu à son abonnement Pro, et sous quelles conditions.
 *
 * Un **siège** est le lien entre un abonnement et un lieu de jeu. Il vit dans le
 * document d'abonnement et non sur le lieu, pour une raison précise : la borne
 * « N lieux au maximum » est un invariant de l'abonnement, et MongoDB ne sait
 * l'imposer sans course que si tout tient dans un seul document.
 *
 * Le statut Pro d'un lieu n'est jamais copié sur le lieu : il se **dérive** de
 * l'abonnement qui détient son siège. C'est ce qui rend la fin d'abonnement
 * gratuite — quand Patreon retire le palier, la liste de plans se vide et le
 * lieu perd Pro au rendu suivant, sans qu'aucun travail de révocation ne tourne
 * et sans fenêtre d'incohérence.
 *
 * Corollaire assumé : le siège, lui, **survit**. Il enregistre une intention, pas
 * un droit. Un abonné éteint occupe donc toujours son propre siège — ce qui ne
 * borne que lui — et retrouve son lieu tel quel si son abonnement reprend.
 */

export type Seat = {
  lairId: string;
  attachedAt: Date;
  attachedBy: string;
};

/** Ce que la règle a besoin de savoir du lieu visé, et rien de plus. */
export type SeatLair = {
  id: string;
  isPrivate?: boolean;
};

export type AttachRefusal =
  | "not-pro"
  | "seats-full"
  | "already-attached"
  | "private-lair";

export type AttachCheck = { ok: true } | { ok: false; reason: AttachRefusal };

/**
 * Un lieu privé ne se rattache pas.
 *
 * Ce n'est pas une restriction inventée ici : `lib/schemas/lair.schema.ts` refuse
 * déjà bannière et sources d'évènements aux lieux privés, parce qu'ils n'ont pas
 * de vitrine publique. Or les fonctionnalités Pro — mise en avant d'évènements,
 * personnalisation de la page — sont précisément des fonctionnalités de vitrine.
 * La règle tient donc en un booléen, et se renverse en une ligne si le produit
 * en décide autrement.
 */
export function canAttachPro({
  plans,
  seats,
  lair,
}: {
  plans: readonly SubscriptionPlanKey[];
  seats: readonly Seat[];
  lair: SeatLair;
}): AttachCheck {
  const capacity = seatsFor(plans);

  if (capacity === 0) {
    return { ok: false, reason: "not-pro" };
  }

  if (lair.isPrivate) {
    return { ok: false, reason: "private-lair" };
  }

  if (seats.some((seat) => seat.lairId === lair.id)) {
    return { ok: false, reason: "already-attached" };
  }

  if (seats.length >= capacity) {
    return { ok: false, reason: "seats-full" };
  }

  return { ok: true };
}

/**
 * Sièges restants. Jamais négatif : un abonné qui descend de palier garde ses
 * rattachements — ils cessent simplement d'ouvrir des droits — et l'écran doit
 * afficher « 0 restant », pas un nombre négatif.
 */
export function remainingSeats({
  plans,
  seats,
}: {
  plans: readonly SubscriptionPlanKey[];
  seats: readonly Seat[];
}): number {
  return Math.max(0, seatsFor(plans) - seats.length);
}
