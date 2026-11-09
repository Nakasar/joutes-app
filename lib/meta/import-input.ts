/**
 * Découpe le texte collé dans l'écran d'import des decks méta.
 *
 * Trois sortes d'entrées, mélangeables dans le même collage :
 *
 * - un lien Piltover Archive (`https://piltoverarchive.com/decks/view/<id>`),
 *   une ligne chacun ;
 * - un code de deck Piltover Archive, une ligne chacun ;
 * - une liste écrite. Elle se met entre deux lignes `---` ; des lignes qui ne
 *   sont ni un lien ni un code, hors de tout bloc, forment aussi une liste —
 *   c'est ce que l'on obtient en collant un seul deck sans rien autour.
 *
 * Sur la ligne d'un lien ou d'un code, ce qui suit `#` est le classement et ce
 * qui suit `@` le joueur : `https://… #1 @Kevin`. Dans un bloc `---`, une
 * ligne `# 1` ou `@Kevin` dit la même chose pour tout le bloc ; hors bloc,
 * elle se place avant les cartes de la liste qu'elle annonce.
 *
 * Fonction pure : rien n'est lu ni vérifié ici, seulement découpé.
 */
export type MetaImportEntry = {
  /** Numéro de ligne (à partir de 1) où commence l'entrée, pour la désigner dans la vérification. */
  line: number;
  placement?: string;
  pilot?: string;
} & (
  | { kind: "piltover-link"; deckId: string; url: string }
  | { kind: "piltover-code"; code: string }
  | { kind: "list"; text: string }
  | { kind: "invalid"; raw: string; reason: string }
);

const PILTOVER_LINK = /^https?:\/\/(?:www\.)?piltoverarchive\.com\/decks\/view\/([A-Za-z0-9-]+)/i;
/** Les codes Piltover Archive sont du base32 : des majuscules et des chiffres de 2 à 7, sans espace. */
const PILTOVER_CODE = /^[A-Z2-7]{16,}$/;
/** riftdecks.com est derrière une protection anti-robots : ses pages ne se lisent pas depuis le serveur. */
const RIFTDECKS_LINK = /^https?:\/\/(?:www\.)?riftdecks\.com(?:[/?#]|$)/i;
const SEPARATOR = /^-{3,}$/;
/** Le classement et le joueur, en fin de ligne : `#1`, `# Top 8`, `@Kevin`. */
const ANNOTATIONS = /\s+([#@])\s*([^#@]+?)\s*(?=\s[#@]|$)/g;

/** Retire de la ligne `#classement` et `@joueur`, et les rend à part. */
function readAnnotations(line: string): { rest: string; placement?: string; pilot?: string } {
  let placement: string | undefined;
  let pilot: string | undefined;
  const rest = ` ${line}`
    .replace(ANNOTATIONS, (_match, sign: string, value: string) => {
      if (sign === "#") placement = value.trim();
      else pilot = value.trim();
      return "";
    })
    .trim();

  return { rest, ...(placement ? { placement } : {}), ...(pilot ? { pilot } : {}) };
}

export function splitMetaImportInput(input: string): MetaImportEntry[] {
  const entries: MetaImportEntry[] = [];
  const lines = input.split(/\r?\n/);

  // La liste en cours : ouverte par `---`, ou implicite (des lignes de cartes
  // hors bloc). Une liste implicite se ferme au prochain lien ou code.
  let list: { line: number; lines: string[]; explicit: boolean; placement?: string; pilot?: string } | null = null;

  const closeList = () => {
    if (list) {
      const text = list.lines.join("\n").trim();
      if (text) {
        entries.push({
          kind: "list",
          line: list.line,
          text,
          ...(list.placement ? { placement: list.placement } : {}),
          ...(list.pilot ? { pilot: list.pilot } : {}),
        });
      }
    }
    list = null;
  };

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const line = raw.trim();

    if (SEPARATOR.test(line)) {
      // Un `---` ferme le bloc ouvert, ou en ouvre un.
      const wasExplicit = list?.explicit ?? false;
      closeList();
      if (!wasExplicit) {
        list = { line: lineNumber + 1, lines: [], explicit: true };
      }
      return;
    }

    if (list?.explicit) {
      // Dans un bloc, une ligne `# 1` ou `@Kevin` annote la liste au lieu d'en être une carte.
      const placement = line.match(/^#\s*(.+)$/);
      const pilot = line.match(/^@\s*(.+)$/);
      if (placement) list.placement = placement[1].trim();
      else if (pilot) list.pilot = pilot[1].trim();
      else list.lines.push(raw);
      return;
    }

    if (!line) {
      // Une liste implicite peut contenir des lignes vides entre ses sections.
      list?.lines.push(raw);
      return;
    }

    const { rest, placement, pilot } = readAnnotations(line);
    const annotations = { ...(placement ? { placement } : {}), ...(pilot ? { pilot } : {}) };

    const link = rest.match(PILTOVER_LINK);
    if (link) {
      closeList();
      entries.push({ kind: "piltover-link", line: lineNumber, deckId: link[1], url: link[0], ...annotations });
      return;
    }

    if (PILTOVER_CODE.test(rest)) {
      closeList();
      entries.push({ kind: "piltover-code", line: lineNumber, code: rest, ...annotations });
      return;
    }

    if (RIFTDECKS_LINK.test(rest)) {
      closeList();
      entries.push({
        kind: "invalid",
        line: lineNumber,
        raw: line,
        reason:
          "riftdecks ne se lit pas automatiquement : sur la page du deck, copiez l'export texte et collez-le ici, avec # et @ pour le classement et le joueur.",
      });
      return;
    }

    if (/^https?:\/\//i.test(rest)) {
      closeList();
      entries.push({
        kind: "invalid",
        line: lineNumber,
        raw: line,
        reason: "Seuls les liens Piltover Archive (piltoverarchive.com/decks/view/…) sont lus.",
      });
      return;
    }

    if (!rest && (placement || pilot)) {
      // Hors bloc, une ligne `# 1` ou `@Kevin` seule annonce la liste qui
      // suit : elle en ouvre une nouvelle si la liste en cours a déjà des cartes.
      if (list && list.lines.some((candidate) => candidate.trim())) closeList();
      if (!list) list = { line: lineNumber, lines: [], explicit: false };
      if (placement) list.placement = placement;
      if (pilot) list.pilot = pilot;
      return;
    }

    if (!list) {
      list = { line: lineNumber, lines: [], explicit: false };
    }
    list.lines.push(raw);
  });

  closeList();
  return entries;
}

/**
 * Le classement tel qu'il s'affiche : un nombre seul devient un rang (« 1er »,
 * « 2e »), une plage de nombres aussi (« 3e-4e ») ; le reste (« Top 8 ») reste tel quel.
 */
export function formatPlacement(placement: string | undefined): string | undefined {
  const value = placement?.trim();
  if (!value) return undefined;

  const ordinal = (n: string) => (n === "1" ? "1er" : `${n}e`);
  const single = value.match(/^(\d+)$/);
  if (single) return ordinal(single[1]);
  const range = value.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (range) return `${ordinal(range[1])}-${ordinal(range[2])}`;

  return value;
}
