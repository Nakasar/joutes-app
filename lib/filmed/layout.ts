import type { Area, Found, Layout, Override, Point } from "@/lib/filmed/types";

/**
 * Le calibrage de la table filmée : zones par défaut, taille des cartes,
 * champs de bataille posés, et ce que l'opérateur a corrigé de la lecture.
 * Rien ici ne touche à l'image : des nombres en entrée, des nombres en sortie.
 */

/** Le code moteur d'une carte lue (`OGN-042#OGN042a` → `OGN-042`). */
export function codeOf(id: string): string {
  return id.split("#")[0];
}

/**
 * Les zones d'une table vue du dessus, avant tout réglage. Le siège 0 est en
 * bas de l'image (à gauche si les joueurs sont assis sur les côtés), le siège 1
 * en face ; les deux champs de bataille sont au milieu.
 */
export function defaultLayout(width: number, height: number, sideways: boolean): Layout {
  // Tracées pour des joueurs en haut et en bas, sur un carré de côté 1.
  const unit: { kind: Area["kind"]; index: number; rect: [number, number, number, number] }[] = [
    { kind: "base", index: 1, rect: [0.04, 0.05, 0.66, 0.24] },
    { kind: "trash", index: 1, rect: [0.72, 0.05, 0.24, 0.24] },
    { kind: "battlefield", index: 1, rect: [0.04, 0.31, 0.45, 0.38] },
    { kind: "battlefield", index: 0, rect: [0.51, 0.31, 0.45, 0.38] },
    { kind: "base", index: 0, rect: [0.04, 0.71, 0.66, 0.24] },
    { kind: "trash", index: 0, rect: [0.72, 0.71, 0.24, 0.24] },
  ];
  const areas = unit.map(({ kind, index, rect: [x, y, w, h] }) => {
    // Sur les côtés : le bas de l'image devient la gauche.
    const [ux, uy, uw, uh] = sideways ? [1 - y - h, x, h, w] : [x, y, w, h];
    return {
      kind,
      index,
      rect: [ux * width, uy * height, uw * width, uh * height].map(Math.round) as Area["rect"],
    };
  });
  return { areas, sideways, facedown: [[0, 0], [0, 0]] };
}

export function inArea(area: Area, [x, y]: Point): boolean {
  const [ax, ay, w, h] = area.rect;
  return x >= ax && x < ax + w && y >= ay && y < ay + h;
}

/** La zone où tombe un point, ou `null` hors de toute zone. */
export function areaAt(layout: Layout, at: Point): Area | null {
  return layout.areas.find((area) => inArea(area, at)) ?? null;
}

function side(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * La largeur d'une carte dans l'image, en pixels : la médiane des cartes sûres
 * (le petit côté, pour ne pas dépendre de leur sens). `null` sans carte sûre.
 */
export function cardWidth(found: Found[]): number | null {
  const widths = found
    .filter((card) => card.sure)
    .map((card) => Math.min(side(card.quad[0], card.quad[1]), side(card.quad[1], card.quad[2])))
    .sort((a, b) => a - b);
  if (widths.length === 0) return null;
  return widths[Math.floor(widths.length / 2)];
}

/** Les bornes de taille données à la lecture une fois la largeur d'une carte connue. */
export function cardRange(width: number): { card_min: number; card_max: number } {
  return { card_min: Math.round(width * 0.72), card_max: Math.round(width * 1.4) };
}

/**
 * Le champ de bataille posé par chaque joueur, d'après ceux que la lecture a
 * trouvés. Un champ de bataille que les deux listes contiennent va au joueur
 * qui n'a pas d'autre candidat. `null` pour un siège dont rien ne décide.
 */
export function battlefieldsOnTable(found: Found[], lists: string[][]): (string | null)[] {
  const seen = [...new Set(found.map((card) => codeOf(card.id)))];
  const candidates = lists.map((list) => seen.filter((code) => list.includes(code)));
  const chosen: (string | null)[] = lists.map(() => null);
  // Plusieurs tours : ce qu'un siège prend n'est plus candidat pour l'autre.
  for (let round = 0; round < lists.length; round++) {
    for (let seat = 0; seat < lists.length; seat++) {
      if (chosen[seat]) continue;
      const free = (at: number) => candidates[at].filter((code) => !chosen.includes(code));
      const mine = free(seat);
      if (mine.length !== 1) continue;
      // Un autre siège qui n'aurait que cette carte-là : rien ne les départage.
      const disputed = lists.some((_, other) => {
        if (other === seat || chosen[other]) return false;
        const theirs = free(other);
        return theirs.length === 1 && theirs[0] === mine[0];
      });
      const shared = lists.some((list, other) => other !== seat && !chosen[other] && list.includes(mine[0]));
      // Seule sur la table et jouable par les deux : on ne devine pas.
      if (!disputed && !(shared && seen.filter((code) => lists.some((list) => list.includes(code))).length === 1)) {
        chosen[seat] = mine[0];
      }
    }
  }
  return chosen;
}

/**
 * Pose la zone de chaque champ de bataille autour de sa carte, quand la
 * lecture l'a trouvée : trois cartes et demie de large, deux de haut dans le
 * sens des joueurs.
 */
export function aroundBattlefields(layout: Layout, found: Found[], battlefields: (string | null)[], card: number): Layout {
  const long = card * 4.2;
  const short = card * 2.4;
  const areas = layout.areas.map((area) => {
    if (area.kind !== "battlefield") return area;
    const code = battlefields[area.index];
    const at = code ? found.find((one) => codeOf(one.id) === code)?.at : undefined;
    if (!at) return area;
    const [w, h] = layout.sideways ? [short, long] : [long, short];
    return { ...area, rect: [at[0] - w / 2, at[1] - h / 2, w, h].map(Math.round) as Area["rect"] };
  });
  return { ...layout, areas };
}

/** Une correction de l'opérateur s'applique à la carte lue au même endroit, à une demi-carte près. */
function overrideOf(card: Found, overrides: Override[], reach: number): Override | undefined {
  return overrides.find((one) => Math.hypot(one.at[0] - card.at[0], one.at[1] - card.at[1]) < reach);
}

/**
 * Les cartes à donner au suivi : celles qui sont sûres, et celles que
 * l'opérateur a confirmées ou renommées. Une carte qu'il a écartée n'y est pas.
 */
export function spotted(found: Found[], overrides: Override[], card: number): { card: string; at: Point; angle: number }[] {
  const out: { card: string; at: Point; angle: number }[] = [];
  for (const one of found) {
    const said = overrideOf(one, overrides, card / 2);
    if (said) {
      if (said.card) out.push({ card: said.card, at: one.at, angle: one.angle });
      continue;
    }
    if (one.sure) out.push({ card: one.id, at: one.at, angle: one.angle });
  }
  return out;
}

/** Les cartes lues sans certitude, dans une zone suivie, que l'opérateur n'a pas encore tranchées. */
export function doubtful(found: Found[], overrides: Override[], layout: Layout, card: number): Found[] {
  return found.filter(
    (one) => !one.sure && areaAt(layout, one.at) !== null && !overrideOf(one, overrides, card / 2),
  );
}

/** Garde les corrections qui désignent encore une carte de l'image. */
export function liveOverrides(found: Found[], overrides: Override[], card: number): Override[] {
  return overrides.filter((one) => found.some((seen) => Math.hypot(one.at[0] - seen.at[0], one.at[1] - seen.at[1]) < card / 2));
}
