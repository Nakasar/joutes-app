/**
 * Ce que la table Cyberpunk TCG déduit d'une mise à jour du moteur : quelles
 * cartes et quels dés portent quels choix, et quels identifiants sont sur la
 * table. Sans React, pour être testé seul.
 *
 * Les cartes et les Gigs n'ont pas les mêmes numéros : une clé les distingue
 * (`o12` pour l'objet 12, `g3` pour le Gig 3, `z1` pour la zone de Gigs du siège 1).
 */

import type { CpAction, CpChoice, CpPrompt, CpTold, CpView } from "@/lib/engine/cyberpunk/types";

export type Key = `o${number}` | `g${number}` | `z${number}`;

export const objKey = (id: number): Key => `o${id}`;
export const gigKey = (id: number): Key => `g${id}`;
export const zoneKey = (seat: number): Key => `z${seat}`;

/** Ce qu'on clique pour faire un choix : la carte qui agit, ou le dé choisi. */
export function subjectOf(action: CpAction): Key | null {
  switch (action.type) {
    case "sell":
    case "play":
      return objKey(action.card);
    case "call":
    case "go_solo":
      return objKey(action.legend);
    case "activate":
      return objKey(action.source);
    case "attack":
      return objKey(action.attacker);
    case "block":
      return objKey(action.unit);
    case "pick":
      return objKey(action.obj);
    case "pay":
      return objKey(action.source);
    case "roll":
    case "pick_gig":
      return gigKey(action.gig);
    default:
      return null;
  }
}

/**
 * Ce qu'on clique ensuite, une fois la carte choisie : l'Unité attaquée, la
 * zone de Gigs adverse (`rival`), ou ce qui reçoit l'Équipement.
 */
export function targetOf(action: CpAction, rival: number): Key | null {
  if (action.type === "attack") return action.target !== undefined ? objKey(action.target) : zoneKey(rival);
  if (action.type === "play" && action.on !== undefined) return objKey(action.on);
  return null;
}

/** Tous les objets visibles d'une vue : identifiant → code de carte. */
export function viewCodes(view: CpView, known: Map<number, string> = new Map()): Map<number, string> {
  const note = (ref: { id: number; code?: string | null } | null | undefined) => {
    if (ref?.code) known.set(ref.id, ref.code);
  };
  for (const unit of view.field) {
    note(unit);
    unit.gears.forEach(note);
  }
  for (const player of view.players) {
    for (const legend of player.legends) {
      note(legend);
      legend.gears.forEach(note);
    }
    player.hand?.forEach(note);
    player.trash.forEach(note);
    player.removed.forEach(note);
  }
  return known;
}

/** Les champs d'un évènement qui désignent un objet de la partie (pas un siège ni un Gig). */
export const OBJECT_FIELDS = [
  "card",
  "obj",
  "legend",
  "source",
  "attacker",
  "target",
  "unit",
  "defender",
  "actor",
  "gear",
  "host",
  "saved",
  "on",
] as const;

/** Les champs d'un évènement qui désignent un Gig. */
export const GIG_FIELDS = ["gig", "a", "b"] as const;

/** Une ligne du récit, avec les cartes qu'elle nomme (leurs codes). */
export type CpJournalEntry = CpTold & { text: string; key: number; codes: string[] };

/**
 * Les évènements d'une mise à jour qui se racontent. `first` est le numéro du
 * premier évènement reçu : il sert de clé stable à chaque ligne. `known` donne
 * le code d'un objet de la partie, `byDef` celui d'une carte du catalogue.
 */
export function tellEvents(
  events: CpTold[],
  first: number,
  known: Map<number, string>,
  byDef: Map<number, string>,
): CpJournalEntry[] {
  const out: CpJournalEntry[] = [];
  events.forEach((entry, index) => {
    if (!entry.text) return;
    const codes = new Set<string>();
    const def = entry.event.def;
    if (typeof def === "number") {
      const code = byDef.get(def);
      if (code) codes.add(code);
    }
    for (const field of OBJECT_FIELDS) {
      const value = entry.event[field];
      const code = typeof value === "number" ? known.get(value) : undefined;
      if (code) codes.add(code);
    }
    const cards = entry.event.cards;
    if (Array.isArray(cards)) {
      for (const value of cards) {
        const code = typeof value === "number" ? byDef.get(value) : undefined;
        if (code) codes.add(code);
      }
    }
    out.push({ ...entry, text: entry.text, key: first + index, codes: [...codes] });
  });
  return out;
}

/** Les objets et les Gigs que la table dessine et qu'on peut donc cliquer, pour le joueur assis en `me`. */
export function clickableKeys(view: CpView, me: number): Set<Key> {
  const keys = new Set<Key>();
  for (const unit of view.field) {
    keys.add(objKey(unit.id));
    for (const gear of unit.gears) keys.add(objKey(gear.id));
  }
  for (const gig of view.gigs) keys.add(gigKey(gig.id));
  for (const player of view.players) {
    keys.add(zoneKey(player.seat));
    for (const legend of player.legends) {
      keys.add(objKey(legend.id));
      for (const gear of legend.gears) keys.add(objKey(gear.id));
    }
    if (player.seat === me) for (const card of player.hand ?? []) keys.add(objKey(card.id));
  }
  return keys;
}

export type ChoiceGroups = {
  /** Les choix portés par une carte ou un dé de la table, par clé. */
  bySubject: Map<Key, CpChoice[]>;
  /** Les autres : boutons de la barre, ou cartes hors de la table (deck regardé, défausse). */
  loose: CpChoice[];
};

export function groupChoices(prompt: CpPrompt | null, onTable: Set<Key>): ChoiceGroups {
  const bySubject = new Map<Key, CpChoice[]>();
  const loose: CpChoice[] = [];
  for (const choice of prompt?.choices ?? []) {
    const subject = subjectOf(choice.action);
    if (subject === null || !onTable.has(subject)) {
      loose.push(choice);
      continue;
    }
    const list = bySubject.get(subject) ?? [];
    list.push(choice);
    bySubject.set(subject, list);
  }
  return { bySubject, loose };
}

/** Les choix qui se font d'un seul clic : désigner, bloquer, lancer un Gig, payer. */
const DIRECT = new Set<CpAction["type"]>(["pick", "pick_gig", "roll", "block", "pay"]);

export function isDirect(choices: CpChoice[]): boolean {
  return choices.length === 1 && DIRECT.has(choices[0].action.type);
}

/** Les cartes qu'un choix nomme : la sienne et celles que son action désigne. */
export function choiceCodes(choice: CpChoice, codes: Map<number, string>): string[] {
  const out = new Set<string>();
  if (choice.card) out.add(choice.card);
  for (const [field, value] of Object.entries(choice.action)) {
    if (field === "gig" || field === "ability" || field === "index" || field === "n") continue;
    const code = typeof value === "number" ? codes.get(value) : undefined;
    if (code) out.add(code);
  }
  return [...out];
}
