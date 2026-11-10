/**
 * Corrections à la galerie officielle de Riftbound (extension Radiance).
 *
 * La galerie publie pour certaines cartes de Radiance un type ou un domaine
 * faux, ou vide. Relevé par comparaison avec les cartes imprimées (2026-11-10,
 * 50 cartes). Les valeurs sont les libellés de la galerie (« Unit », « Fury »…),
 * comme ceux que l'import écrit dans `type`, `types` et `domain`.
 *
 * Deux endroits les appliquent : l'import (`scripts/games/riftbound/import-cards.ts`),
 * pour qu'un nouvel import n'écrase pas la correction, et le script
 * `npm run cards:riftbound-corrections` pour la base et l'index de recherche
 * déjà remplis.
 *
 * À retirer d'ici une entrée dont la galerie a fini par publier la bonne valeur.
 */

export type RiftboundCorrection = { type?: string; domain?: string };

export const RIFTBOUND_CORRECTIONS: Readonly<Record<string, RiftboundCorrection>> = {
  RAD001: { domain: "Fury" }, // Amateur Demolitionist
  RAD003: { domain: "Fury" }, // Bilgewater Tracker
  RAD004: { domain: "Fury" }, // Brawl
  RAD006: { type: "Spell", domain: "Fury" }, // Scorched Earth
  RAD007: { type: "Spell" }, // Rally for War
  RAD009: { type: "Unit", domain: "Fury" }, // Antagonistic Apparatus
  RAD012: { type: "Gear", domain: "Fury" }, // Runeblade Anvil
  RAD016: { type: "Unit", domain: "Fury" }, // Coalesced Energy
  RAD017: { domain: "Fury" }, // Detonation Amplifier
  RAD022: { type: "Gear", domain: "Fury" }, // Whirling Twirligig
  RAD024: { domain: "Calm" }, // Blossoming Dreamroot
  RAD025: { type: "Spell" }, // Consult the Heavens
  RAD026: { type: "Unit", domain: "Calm" }, // Entrenched Boar
  RAD033: { type: "Spell" }, // Command: Attack
  RAD034: { type: "Spell" }, // Hunker Down
  RAD035: { type: "Gear" }, // Invigorating Bloom
  RAD039: { type: "Gear" }, // Ephemeral Ward
  RAD041: { type: "Spell", domain: "Calm" }, // Hush
  RAD044: { type: "Gear" }, // Hunting Blind
  RAD046: { type: "Gear" }, // Resplendent Rostrum
  RAD047: { type: "Spell", domain: "Mind" }, // Fanfare
  RAD049: { type: "Unit", domain: "Mind" }, // Industrious Mechsmith
  RAD056: { type: "Spell" }, // Improvised Projectile
  RAD059: { type: "Spell", domain: "Mind" }, // Supernova
  RAD062: { domain: "Mind" }, // Gravity Field
  RAD064: { type: "Gear" }, // Scrutinizing Scope
  RAD067: { domain: "Mind" }, // Clocktower Guardian
  RAD069: { type: "Gear" }, // Zero Point Inflection
  RAD071: { domain: "Body" }, // Nazuman Ntofo
  RAD072: { type: "Unit" }, // Overloaded Traveler
  RAD073: { domain: "Body" }, // Pillaged Armory
  RAD081: { domain: "Body" }, // Elnuk Herd
  RAD087: { type: "Gear" }, // Portable Portal
  RAD093: { domain: "Chaos" }, // Disposal Expert
  RAD097: { type: "Unit" }, // Siren of the Shallows
  RAD101: { type: "Spell" }, // An Offer You Can't Refuse
  RAD102: { domain: "Chaos" }, // Demon Shade
  RAD104: { type: "Unit", domain: "Chaos" }, // Pitiless Stalker
  RAD106: { domain: "Chaos" }, // The Good Stuff
  RAD108: { type: "Gear", domain: "Chaos" }, // Bushwhack Trap
  RAD111: { domain: "Chaos" }, // Mechanical Bandit
  RAD120: { type: "Unit" }, // Meticulous Restorationist
  RAD121: { type: "Spell", domain: "Order" }, // One-Two Punch
  RAD123: { type: "Gear", domain: "Order" }, // Protector's Shield
  RAD124: { type: "Spell", domain: "Order" }, // Burn Away
  RAD127: { type: "Spell" }, // Rousing Display
  RAD130: { type: "Unit" }, // Battlefield Armorer
  RAD131: { type: "Unit" }, // Demacian Illuminators
  RAD134: { type: "Spell", domain: "Order" }, // Raucous Anthem
  RAD136: { type: "Gear" }, // Dockside Lock-Up
};

/** Champs d'une carte que la correction réécrit. */
export type CorrectableCard = { id: string; type?: string; types?: string[]; domain?: string[] };

/**
 * Remplace le type et/ou le domaine d'une carte corrigée. Les autres cartes,
 * et les champs que la correction ne mentionne pas, sont rendus tels quels.
 */
export function applyRiftboundCorrection<T extends CorrectableCard>(card: T): T {
  const correction = RIFTBOUND_CORRECTIONS[card.id];
  if (!correction) return card;
  return {
    ...card,
    ...(correction.type ? { type: correction.type, types: [correction.type] } : {}),
    ...(correction.domain ? { domain: [correction.domain] } : {}),
  };
}

/** Champs à écrire (en base ou dans l'index) pour une carte corrigée, `undefined` si elle ne l'est pas. */
export function riftboundCorrectionFields(cardId: string): Pick<CorrectableCard, "type" | "types" | "domain"> | undefined {
  const correction = RIFTBOUND_CORRECTIONS[cardId];
  if (!correction) return undefined;
  const { type, types, domain } = applyRiftboundCorrection<CorrectableCard>({ id: cardId });
  return { ...(type ? { type, types } : {}), ...(domain ? { domain } : {}) };
}
