/**
 * Lecture du compendium de Donjon & Procrastination — les « Explications de cas
 * particuliers » que l'éditeur publie en PDF sur `/contenu-telechargeable`.
 *
 * Séparé de `import-erratas.ts`, qui l'écrit en base : ce module ne connaît que
 * la forme du document, et se lit — ou s'essaie — sans base de données.
 *
 * ## Une carte par page, toujours la même mise en page
 *
 * Chaque page porte le nom d'une carte en tête, son effet dans une colonne de
 * droite sous le titre `EFFET`, et sous le titre `EXPLICATIONS`, à gauche, ce
 * que l'éditeur en précise. Seules ces explications sont reprises : l'effet est
 * le texte de la carte, que l'application tient déjà de l'inventaire des
 * séries.
 *
 * Les explications sont tantôt une liste à puces, tantôt un seul paragraphe —
 * les séries récentes ont laissé tomber les puces. Les deux sont lues de la
 * même façon : les lignes sont réunies en paragraphes sur l'écart qui les
 * sépare (cf. `blocksOf`), et la puce n'est qu'une décoration à retirer.
 *
 * ## Le nom ne suffit pas à désigner une carte
 *
 * Le compendium nomme la carte sans dire ni son extension ni son numéro : c'est
 * à l'appelant de retrouver la ou les cartes qui portent ce nom — une même
 * carte est parfois imprimée dans plusieurs extensions, et l'entrée
 * « Esbroufe » vise les huit Esbroufe du jeu, une par extension.
 */
import { blocksOf, blockText, linesOf, readPdf, squeeze, type Fragment } from "./source.ts";

/** Une entrée du compendium : une carte, et ce que l'éditeur en précise. */
export type CompendiumEntry = {
  /** Numéro de page, pour dire où regarder quand une entrée pose question. */
  page: number;
  /** Le nom de la carte, tel que le compendium l'écrit. */
  name: string;
  /** Un paragraphe par explication, la puce retirée. */
  explanations: string[];
};

/** Les titres de colonne de la page, qui bornent ce qui est une explication. */
const EXPLANATIONS = "EXPLICATIONS";
const EFFECT = "EFFET";

/**
 * Hauteur du texte au-delà de laquelle un fragment est un titre et non du
 * corps : le nom de la carte est composé en 31 points, les titres de colonne en
 * 32, les explications en 24.
 */
const TITLE_HEIGHT = 28;

/** Le nom de la carte, en tête de page. */
function nameOf(fragments: Fragment[], labels: Fragment[]): string {
  const top = Math.max(...fragments.map((fragment) => fragment.y));
  const title = fragments.filter(
    (fragment) => fragment.height >= TITLE_HEIGHT && fragment.y > top - 2 && !labels.includes(fragment)
  );

  return blockText(linesOf(title));
}

/**
 * Une page du compendium, ou `undefined` si elle n'en est pas une : une page de
 * garde, une table des matières ou une page de règles n'a pas de titre
 * `EXPLICATIONS`, et il n'y a alors rien à en tirer.
 */
function readPage(fragments: Fragment[], page: number): CompendiumEntry | undefined {
  const labels = fragments.filter((fragment) => [EXPLANATIONS, EFFECT].includes(squeeze(fragment.str)));
  const heading = labels.find((fragment) => squeeze(fragment.str) === EXPLANATIONS);

  if (!heading) {
    return undefined;
  }

  // L'effet occupe la colonne de droite et descend parfois plus bas que le
  // titre `EXPLICATIONS` : sans la borne en largeur, sa fin passerait pour une
  // explication.
  const rightColumn = labels.find((fragment) => squeeze(fragment.str) === EFFECT)?.x;
  const body = fragments.filter(
    (fragment) => fragment.y < heading.y - 5 && (rightColumn === undefined || fragment.x < rightColumn - 10)
  );

  const explanations = blocksOf(linesOf(body))
    // La puce est une décoration de la mise en page : le rendu de l'errata fait
    // la liste lui-même, et les entrées récentes n'en ont plus.
    .map((block) => squeeze(blockText(block).replace(/^\s*[•·-]\s*/, "")))
    .filter(Boolean);

  const name = nameOf(fragments, labels);

  if (!name || explanations.length === 0) {
    console.warn(`Compendium, page ${page} : ${name ? "aucune explication" : "aucun nom de carte"}, elle est ignorée.`);
    return undefined;
  }

  return { page, name, explanations };
}

/**
 * Les entrées du compendium, dans l'ordre des pages, et la date à laquelle
 * l'éditeur l'a publié — celle que porte le fichier, faute d'en imprimer une.
 */
export async function readCompendium(
  pdf: Uint8Array
): Promise<{ entries: CompendiumEntry[]; publishedAt?: Date }> {
  const { pages, createdAt } = await readPdf(pdf);

  return {
    entries: pages.flatMap((fragments, index) => readPage(fragments, index + 1) ?? []),
    publishedAt: createdAt,
  };
}

/**
 * Le contenu de la clarification, en markdown.
 *
 * Une explication seule reste un paragraphe : en faire une liste d'un élément
 * poserait une puce là où le compendium n'en met pas. Plusieurs deviennent une
 * liste, comme sur la page dont elles viennent.
 */
export function clarificationDetails(entry: CompendiumEntry): string {
  return entry.explanations.length === 1
    ? entry.explanations[0]
    : entry.explanations.map((explanation) => `- ${explanation}`).join("\n");
}
