/**
 * Ce que donjonprocrastination.com publie, et comment le lire.
 *
 * L'éditeur ne sert aucune API : tout ce que les scripts d'import de ce dossier
 * savent du jeu vient de ses pages et des PDF qu'elles proposent au
 * téléchargement — l'inventaire d'une série pour `import-cards.ts`, le
 * compendium pour `import-erratas.ts`. Les deux lisent donc le site de la même
 * façon, et un PDF de la même façon : ce module porte ce qu'ils ont en commun,
 * les scripts gardant chacun la forme du document qu'il attend.
 */
import { getDocument, PDFDateString } from "pdfjs-dist/legacy/build/pdf.mjs";

export const SITE = "https://donjonprocrastination.com";

// --- Accès HTTP ----------------------------------------------------------

/**
 * Requête que le site refuse : une page déplacée, un PDF retiré. Elle sera
 * refusée autant à la cinquième tentative, et la reprendre ne ferait que
 * retarder l'erreur — qui dit, elle, ce qui ne va pas.
 */
class RefusedRequest extends Error {}

/**
 * Une ressource du site. Un échec isolé — le CDN répond ponctuellement en 5xx —
 * ne doit pas coûter tout l'import : la requête est reprise quelques fois avant
 * d'abandonner.
 */
async function fetchResource(url: string, attempt = 1): Promise<Response> {
  const MAX_ATTEMPTS = 5;

  try {
    const response = await fetch(url, { headers: { accept: "*/*" } });

    if (!response.ok) {
      const message = `HTTP ${response.status} sur ${url}`;
      throw response.status < 500 ? new RefusedRequest(message) : new Error(message);
    }

    return response;
  } catch (error) {
    if (error instanceof RefusedRequest || attempt >= MAX_ATTEMPTS) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    return fetchResource(url, attempt + 1);
  }
}

export async function fetchPage(url: string): Promise<string> {
  return (await fetchResource(url)).text();
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetchResource(url)).arrayBuffer());
}

/**
 * Adresse d'un PDF, où qu'elle se trouve dans la page — le paramètre de requête
 * compris, faute de quoi une adresse versionnée (`…/regles.pdf?v=3`) serait
 * demandée sans sa version.
 */
const PDF_LINK = /https?:\/\/[^"'\\\s]+\.pdf(?:\?[^"'\\\s]*)?/gi;

/**
 * Les PDF d'une page, dans leur ordre d'apparition.
 *
 * Ils ne se cherchent pas dans le document : les boutons de téléchargement du
 * site ne sont posés qu'à l'exécution du script de la page, et leur adresse ne
 * se lit donc, dans le HTML servi, que dans les données que le gabarit emporte
 * avec lui. Elles sont repêchées du texte de la page — un PDF est une adresse
 * trop reconnaissable pour valoir un moteur de rendu en dépendance.
 *
 * Le tri revient à l'appelant : chaque page sert aussi les conditions de vente
 * et les mentions légales, en pied.
 */
export function pdfLinks(html: string): string[] {
  return [...new Set([...html.matchAll(PDF_LINK)].map(([link]) => link))];
}

// --- Lecture d'un PDF ----------------------------------------------------

/** Un fragment de texte du PDF, avec la place qu'il occupe sur la page. */
export type Fragment = { str: string; x: number; y: number; width: number; height: number };

/** Les fragments posés sur une même ligne de base. */
export type Line = { y: number; height: number; fragments: Fragment[] };

export const squeeze = (value: string): string => value.replace(/\s+/g, " ").trim();

/**
 * Le texte d'un PDF, une liste de fragments par page, et la date de sa
 * fabrication.
 *
 * `pdfjs-dist` ne rend rien de plus : ni ligne, ni colonne, ni paragraphe. Tout
 * ce qui ressemble à une mise en page est reconstruit d'ici, à partir des
 * coordonnées.
 *
 * La date est celle que le producteur du fichier y inscrit. C'est tout ce que
 * l'éditeur dit de la publication d'un document — ses pages n'en portent
 * aucune —, et c'est assez juste pour dater ce qu'on en tire : le compendium
 * d'août 2026 la donne au jour près, et son nom de fichier
 * (`d-p-compendium07-08.pdf`) la confirme.
 */
export async function readPdf(pdf: Uint8Array): Promise<{ pages: Fragment[][]; createdAt?: Date }> {
  const document = await getDocument({ data: pdf, useSystemFonts: true }).promise;
  const pages: Fragment[][] = [];

  for (let index = 1; index <= document.numPages; index++) {
    const content = await (await document.getPage(index)).getTextContent();

    pages.push(
      content.items.flatMap((item): Fragment[] =>
        "str" in item && item.str.trim()
          ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height }]
          : []
      )
    );
  }

  const { info } = await document.getMetadata();
  const created = (info as { CreationDate?: string }).CreationDate;

  return { pages, createdAt: (created ? PDFDateString.toDateObject(created) : null) ?? undefined };
}

/**
 * Fragments d'une même ligne, recollés dans l'ordre de lecture.
 *
 * L'espace n'est pas ajouté entre deux fragments mais déduit de la place qui
 * les sépare : le PDF coupe un mot en deux fragments jointifs sur une ligature
 * (`fi` + `n de partie`), qu'un espace systématique écrirait « fi n de partie ».
 */
export function joinFragments(fragments: Fragment[]): string {
  let line = "";
  let end: number | undefined;

  for (const fragment of [...fragments].sort((a, b) => a.x - b.x)) {
    if (end !== undefined && fragment.x - end > 0.4) {
      line += " ";
    }
    line += fragment.str;
    end = Math.max(end ?? -Infinity, fragment.x + fragment.width);
  }

  return line;
}

/** Les fragments rangés par ligne de base, de haut en bas. */
export function linesOf(fragments: Fragment[]): Line[] {
  const lines: Line[] = [];

  for (const fragment of [...fragments].sort((a, b) => b.y - a.y)) {
    const line = lines.find((candidate) => Math.abs(candidate.y - fragment.y) < 1.5);

    if (line) {
      line.fragments.push(fragment);
      line.height = Math.max(line.height, fragment.height);
    } else {
      lines.push({ y: fragment.y, height: fragment.height, fragments: [fragment] });
    }
  }

  return lines;
}

/**
 * Les lignes réunies en blocs, un par cellule de tableau ou par paragraphe.
 *
 * Deux lignes d'un même bloc sont séparées d'un interligne — un cinquième de
 * plus que le corps du texte —, deux blocs d'un filet de tableau ou d'un saut
 * de paragraphe, qui laissent nettement plus de place. Le partage se fait donc
 * sur l'écart, rapporté à la taille du texte : rien ne dit qu'un bloc ait la
 * hauteur des autres — une cellule dont l'effet tient sur six lignes fait le
 * double —, et une hauteur moyenne verserait la moitié d'un bloc dans le
 * précédent.
 */
export function blocksOf(lines: Line[]): Line[][] {
  const blocks: Line[][] = [];

  for (const line of lines) {
    const previous = blocks.at(-1)?.at(-1);

    if (previous && previous.y - line.y <= 1.45 * Math.max(previous.height, line.height)) {
      blocks.at(-1)?.push(line);
    } else {
      blocks.push([line]);
    }
  }

  return blocks;
}

/** Le milieu d'un bloc, qui est aussi celui de la ligne du tableau qui le porte. */
export function blockCenter(block: Line[]): number {
  return (block[0].y + block[block.length - 1].y) / 2;
}

/** Le texte d'un bloc : ses lignes recollées en une seule. */
export function blockText(block: Line[]): string {
  return squeeze(block.map((line) => joinFragments(line.fragments)).join(" "));
}
