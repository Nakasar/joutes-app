/**
 * État de peinture d'un exemplaire de figurine.
 *
 * C'est l'équivalent, pour les figurines, de l'état d'une carte (`condition`) —
 * à ceci près qu'une carte se dégrade quand une figurine progresse. L'échelle
 * est donc **ordonnée et monotone** : une figurine ne redescend pas de « peinte »
 * à « montée ». Un axe unique plutôt que plusieurs booléens (monté ? sous-couché ?
 * peint ?) donne un contrôle simple à l'écran et une statistique lisible.
 */
export const PAINT_STATES = {
  unassembled: "Non montée",
  assembled: "Montée",
  primed: "Sous-couchée",
  partial: "En cours",
  painted: "Peinte",
  based: "Peinte et socle terminé",
} as const;

export type PaintStateKey = keyof typeof PAINT_STATES;

/** Dans l'ordre de progression : l'ordre de déclaration fait foi. */
export const PAINT_STATE_KEYS = Object.keys(PAINT_STATES) as PaintStateKey[];

export const PAINT_STATE_OPTIONS = Object.entries(PAINT_STATES).map(([value, label]) => ({
  value: value as PaintStateKey,
  label,
}));

/** État par défaut d'une figurine qui vient d'être ajoutée : elle sort de sa boîte. */
export const DEFAULT_PAINT_STATE: PaintStateKey = "unassembled";

/**
 * Une figurine compte comme peinte à partir du moment où sa peinture est
 * terminée. « En cours » n'y suffit pas : c'est justement ce qui reste à faire
 * que la statistique doit montrer.
 */
export function isPainted(state: PaintStateKey | undefined): boolean {
  return state === "painted" || state === "based";
}

export function paintStateRank(state: PaintStateKey | undefined): number {
  return state ? PAINT_STATE_KEYS.indexOf(state) : -1;
}
