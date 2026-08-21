import { STREAM_MAX_TARGETS, type StreamTarget } from "@/lib/types/StreamLink";

/**
 * Les destinations d'une liaison, manipulées comme un ensemble.
 *
 * Sans base ni réseau : ce sont les règles de la liste elle-même — pas de
 * doublon, une borne, un ordre stable — et elles se lisent et se testent seules.
 * Qui a le droit d'ajouter quoi se décide ailleurs, dans `announce.ts`, parce
 * que cela demande de relire le lieu ou le groupe.
 */

/** La clé d'une destination : « lair:64f… ». Sert aux comparaisons et aux `Set`. */
export function targetKey(target: StreamTarget): string {
  return `${target.kind}:${target.id}`;
}

export function sameTarget(a: StreamTarget, b: StreamTarget): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export function hasTarget(targets: StreamTarget[], target: StreamTarget): boolean {
  return targets.some((item) => sameTarget(item, target));
}

export type AddTargetResult =
  | { ok: true; targets: StreamTarget[] }
  | { ok: false; reason: "ALREADY_ADDED" | "TOO_MANY_TARGETS" };

/**
 * Ajoute une destination à la fin.
 *
 * Le doublon est refusé plutôt qu'absorbé en silence : l'utilisateur qui
 * rajoute un lieu déjà présent a plus probablement choisi la mauvaise ligne
 * qu'exprimé une intention, et un écran qui ne bronche pas ne l'aide pas.
 */
export function addTarget(targets: StreamTarget[], target: StreamTarget): AddTargetResult {
  if (hasTarget(targets, target)) {
    return { ok: false, reason: "ALREADY_ADDED" };
  }

  if (targets.length >= STREAM_MAX_TARGETS) {
    return { ok: false, reason: "TOO_MANY_TARGETS" };
  }

  return { ok: true, targets: [...targets, target] };
}

export function removeTarget(targets: StreamTarget[], target: StreamTarget): StreamTarget[] {
  return targets.filter((item) => !sameTarget(item, target));
}
