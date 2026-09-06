/**
 * Import du catalogue Donjon & Procrastination depuis donjonprocrastination.com
 * (https://donjonprocrastination.com/les-cartes).
 *
 * Usage (depuis la racine du dépôt) :
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/games/dnp/import-cards.ts [--fetch-only|--from-file]
 *
 * `--conditions=react-server` est nécessaire parce que `lib/mongodb` importe
 * `server-only`, et le hook résout l'alias `@/` de tsconfig.json hors bundler.
 *
 * - sans option : télécharge le catalogue, l'écrit dans `cards.json`, puis le
 *   pousse en base et dans l'index de recherche ;
 * - `--fetch-only` : télécharge seulement (utile pour relire le résultat avant
 *   d'écrire quoi que ce soit) ;
 * - `--from-file` : réécrit en base depuis `cards.json`, sans retélécharger.
 *
 * Variables d'environnement : `MONGODB_URI`, `MEILISEARCH_ENDPOINT`,
 * `MEILISEARCH_API_KEY`, et `DNP_GAME_SLUG` si le jeu n'a pas le slug `dnp`.
 *
 * Après le premier import, les filtres de la galerie demandent que l'index
 * déclare les attributs du jeu : c'est le bouton « Mettre à jour l'index » de
 * l'administration des cartes, cf. docs/CARD_EXPLORER_FILTERS.md. Le script les
 * pose déjà lui-même, un premier import laisse donc une galerie utilisable.
 *
 * ## Deux sources, parce que l'éditeur n'en publie pas une seule
 *
 * L'éditeur ne sert aucune API : « Les cartes » liste les séries, et la page
 * d'une série affiche les illustrations — sans un mot du nom, de la classe, de
 * la valeur ni de l'effet, qui ne sont lisibles que sur l'image. Ces mêmes
 * pages proposent en revanche l'inventaire de la série **en PDF**, tableau
 * complet des cartes qu'un joueur imprime pour suivre sa collection : c'est là
 * qu'est le texte, et c'est donc de là que vient tout ce que le script écrit,
 * l'illustration mise à part.
 *
 * Les séries ne sont pas énumérées dans le script : il suit les liens de la
 * page « Les cartes » (`/liste-…`), de sorte qu'une série publiée après coup
 * s'importe sans qu'on y touche.
 *
 * ## Un PDF n'est pas un tableau
 *
 * `pdfjs-dist` (en dépendance de développement, le script étant le seul à en
 * avoir besoin) rend le texte d'une page comme une liste de fragments posés à
 * des coordonnées : rien n'y dit ce qui est une ligne ni ce qui est une
 * colonne. Le tableau est donc reconstruit :
 *
 * - **les colonnes** sont bornées par les en-têtes eux-mêmes (`N°`, `Nom`,
 *   `Classe`, `Valeur`, `Type`, `Archétype`, `Rareté`, `Effet`), la limite
 *   entre deux colonnes tombant à mi-chemin de leurs deux en-têtes. Les
 *   déduire des en-têtes plutôt que de les figer laisse le script survivre à
 *   une colonne déplacée, et il en apparaît : la `Type` n'existe qu'à partir
 *   de la série 3 ;
 * - **les lignes** sont ancrées sur la colonne `N°`, un numéro par carte, et
 *   chaque cellule rejoint la ligne dont l'ancre est la plus proche de son
 *   milieu. Une cellule, et non une ligne de texte : le pas du tableau n'est
 *   pas constant — l'effet du Deck merveilleux tient sur six lignes, celui de
 *   ses voisines sur une —, et une ligne de texte prise isolément irait
 *   grossir la carte du dessus. Les lignes de texte sont donc d'abord réunies
 *   en cellules, sur l'écart qui les sépare : un interligne à l'intérieur d'une
 *   cellule, un filet de tableau entre deux ;
 * - une carte **sans numéro** (l'Esbroufe du Starter Pack) n'aurait aucun
 *   ancrage : les noms qui ne tombent dans aucune ligne en ouvrent une.
 *
 * Restent deux pièges dans le texte lui-même. Les mots sont recollés d'après
 * l'espace qui les sépare et non d'après les fragments : une ligature coupe
 * `fin` en deux fragments jointifs (`fi` + `n`) que séparer donnerait « fi n
 * de partie ». Et l'effet d'une carte cite parfois une classe dans une pastille
 * — un fragment posé au milieu de la phrase, à recoller à sa place et non à la
 * fin : « +1 pour chaque carte **Force** dans la zone de score ».
 *
 * ## Un PDF, plusieurs extensions
 *
 * L'inventaire d'une série tient sur autant de pages qu'elle a d'extensions :
 * le deck préconstruit d'abord (`DS3`), la série de boosters ensuite (`S3`).
 * Le code d'extension est le libellé en haut à droite de chaque page, et c'est
 * lui qui distingue les deux : leur titre, lui, est le même — le deck fait
 * partie de la série et en porte le nom, que le script recopie tel quel dans
 * `setName` plutôt que d'inventer une distinction que l'éditeur ne fait pas.
 *
 * ## Ce que le numéro de collection porte en plus
 *
 * - `01-A` : la version promo d'une carte, imprimée avec une autre
 *   illustration. C'est une carte à part entière ici — son propre numéro, sa
 *   propre rareté (`Promo`) —, et la mention « - Alternative promo » que le
 *   PDF ajoute sous le nom est retirée : la rareté la dit déjà ;
 * - `00 (x2)` : le nombre d'exemplaires de la carte dans le deck préconstruit.
 *   C'est une règle de contenu du produit, pas une propriété de la carte, et
 *   elle n'est pas reprise.
 *
 * ## Les illustrations sont sur le site, pas dans le PDF
 *
 * Le PDF n'a aucune image. Celles de la page de la série sont donc rapprochées
 * des cartes de trois façons, dans cet ordre :
 *
 * 1. par le **numéro dans le nom du fichier** (`s3-14-r_nenu-gardien-de-phare`
 *    est la carte 14 de `S3`). C'est le cas général, et le seul qui soit sûr ;
 * 2. par le **nom de la carte dans le texte alternatif** de l'image, pour les
 *    pages dont les fichiers sont nommés par un UUID (la série 4) ;
 * 3. par une **comparaison approchée** du même texte alternatif, qui rattrape
 *    les coquilles de rédaction (« Poissonnet coûteux » pour « Poissonnet
 *    goûteux »). Le seuil est haut et le nom doit faire six caractères : une
 *    illustration attribuée à la mauvaise carte serait pire que pas
 *    d'illustration du tout.
 *
 * Une carte sans illustration est signalée en fin d'import plutôt qu'écartée :
 * le deck de la série 4 n'a aucune image publiée, et quelques cartes des
 * boosters non plus. Elles restent collectionnables, et l'illustration peut
 * être ajoutée à la main depuis l'administration.
 *
 * ## Ce qui n'est pas importé
 *
 * - **les cartes promos** (`/les-cartes-promos`) : la page les illustre et les
 *   raconte, mais aucun inventaire PDF ne les décrit — ni classe, ni valeur, ni
 *   numéro. Il n'y a rien à en importer d'autre que des noms ;
 * - **les versions gold** : toutes les cartes des séries de boosters en ont
 *   une, l'inventaire la compte (« Cartes gold 0/42 ») mais ne publie rien
 *   d'elle, pas même une illustration. Elle relève de la variante d'impression
 *   (cf. docs/CARD_PRINTINGS.md), que l'import ne touche jamais : celles
 *   saisies depuis l'administration survivent à ses passages ;
 * - **le thème, la mécanique et la date de création** d'une série : ils sont
 *   dans l'inventaire, mais ils décrivent l'extension et non la carte. Portés
 *   par chaque carte, ils garniraient la barre latérale de la galerie de
 *   facettes qui ne trient rien — elles sont déduites des attributs des cartes.
 *
 * ## Les propriétés du jeu portent les clés communes
 *
 * `type` pour la classe (Force, Agilité, Magie, Soutien, Épique), `power` pour
 * la valeur, `types` pour le type (Végétale, Pirate), `tags` pour l'archétype
 * (Chien, Kabuto, Boxeur…) et `rarity` pour la rareté : ce sont les clés de
 * `CARD_ATTRIBUTE_KEYS`, les seules que l'application sache nommer dans la
 * langue du lecteur. `N/A` et `Aucun` — la façon dont l'inventaire écrit
 * l'absence — ne sont pas écrits, pas plus que la valeur de la carte dont
 * l'inventaire dit qu'elle se calcule (`?`) : un attribut absent ne remonte
 * dans aucun filtre, quand un `N/A` en ferait une valeur à cocher.
 */
import { readFile, writeFile } from "node:fs/promises";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";
import { parse as parseHtml } from "node-html-parser";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { EnqueuedTaskPromise } from "meilisearch";
import db from "../../../lib/mongodb.ts";
import meilisearch, { cardIndexSettings, ensureCardIndex, indexes } from "../../../lib/meilisearch.ts";
import { getGameCardFilterFacets } from "../../../lib/db/cards.ts";
import { importedCardSearchDocument } from "../../../lib/cards/import-search.ts";
import { buildCardId, slugSegment } from "../../../lib/constants/card-ids.ts";
import type { CardPrinting } from "../../../lib/types/card.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SITE = "https://donjonprocrastination.com";
const CARDS_PAGE = `${SITE}/les-cartes`;

/** Convention d'identifiant du jeu, indépendante du slug qu'il porte en base. */
const GAME = "dnp";

/** Slug du jeu en base. Surchargeable si le jeu a été créé sous un autre slug. */
const GAME_SLUG = process.env.DNP_GAME_SLUG ?? GAME;

/** Le jeu n'est publié qu'en français. */
const LANGUAGE = "fr";

const CARDS_FILE = path.join(__dirname, "cards.json");

// --- Carte telle qu'on la stocke ----------------------------------------

export type DnpCard = {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  lang: string;
  image?: string;
  text?: string;
  // Attributs de jeu, écrits à la racine du document comme pour les autres jeux.
  setName?: string;
  type?: string;
  power?: number;
  types?: string[];
  tags?: string[];
  rarity?: string;
};

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

async function fetchPage(url: string): Promise<string> {
  return (await fetchResource(url)).text();
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetchResource(url)).arrayBuffer());
}

// --- Lecture du site -----------------------------------------------------

/** Une image de carte publiée sur la page d'une série. */
type SetImage = { url: string; file: string; alt: string };

/** Une page de série : son inventaire PDF et ses illustrations. */
type SetPage = { url: string; pdf: string; images: SetImage[] };

const text = (value: string | null | undefined): string | undefined => value?.trim() || undefined;

/**
 * Pages d'inventaire liées depuis « Les cartes ». Le chemin les désigne
 * (`/liste-des-cartes-s1-…`, `/liste-starter-pack-…`) ; la page des promos, qui
 * ne publie aucun inventaire, ne porte pas ce préfixe et n'est donc pas suivie.
 */
function setPageUrls(html: string): string[] {
  const links = parseHtml(html)
    .querySelectorAll("a[href]")
    .map((anchor) => anchor.getAttribute("href") ?? "")
    .filter((href) => /^(?:\/|https:\/\/donjonprocrastination\.com\/)liste-/.test(href))
    .map((href) => new URL(href, SITE).toString());

  return [...new Set(links)];
}

/** Adresse d'un PDF, où qu'elle se trouve dans la page. */
const PDF_LINK = /https?:\/\/[^"'\\\s]+\.pdf/gi;

/**
 * L'inventaire d'une série et ses illustrations.
 *
 * Le PDF ne se cherche pas dans le document : le bouton « Télécharger la liste
 * d'effets en PDF » n'est posé qu'à l'exécution du script de la page, et son
 * adresse ne se lit donc, dans le HTML servi, que dans les données que le
 * gabarit emporte avec lui. Elle est repêchée du texte de la page — un PDF est
 * une adresse trop reconnaissable pour valoir un moteur de rendu en dépendance.
 *
 * Le CDN sert aussi les conditions de vente et les mentions légales, présentes
 * en pied de chaque page : seul le PDF dont le nom annonce une liste est
 * retenu, faute de quoi une page sans inventaire s'importerait comme une série
 * vide — ou pire, comme les conditions de vente.
 *
 * Les illustrations, elles, sont bien dans le document : elles sont lues dans
 * la balise `source` de chaque `picture`, qui porte le WebP d'origine là où le
 * `img` qu'elle enveloppe porte un rendu JPEG. Les paramètres de
 * redimensionnement sont retirés : sans eux, l'URL rend l'image entière.
 */
function readSetPage(url: string, html: string): SetPage | undefined {
  const document = parseHtml(html);

  const pdf = [...html.matchAll(PDF_LINK)]
    .map(([link]) => link)
    .find((link) => /liste/i.test(link.split("/").pop() ?? ""));

  if (!pdf) {
    console.warn(`${url} : aucun inventaire PDF, la page est ignorée.`);
    return undefined;
  }

  const images = document.querySelectorAll("picture").flatMap((picture): SetImage[] => {
    const source = picture.querySelector("source")?.getAttribute("srcset")?.split(" ")[0];

    if (!source) {
      return [];
    }

    const image = source.split("?")[0];
    return [{ url: image, file: image.split("/").pop() ?? "", alt: picture.querySelector("img")?.getAttribute("alt") ?? "" }];
  });

  return { url, pdf, images };
}

// --- Lecture de l'inventaire PDF ----------------------------------------

/** Un fragment de texte du PDF, avec la place qu'il occupe sur la page. */
type Fragment = { str: string; x: number; y: number; width: number; height: number };

/** Les fragments posés sur une même ligne de base. */
type Line = { y: number; height: number; fragments: Fragment[] };

/** Les colonnes de l'inventaire, dans l'ordre où elles peuvent apparaître. */
const COLUMNS = ["N°", "Nom", "Classe", "Valeur", "Type", "Archétype", "Rareté", "Effet"] as const;

type Column = (typeof COLUMNS)[number];

/**
 * Une extension : une page de l'inventaire, les lignes de son tableau, et le
 * nombre de cartes que la page annonce d'elle-même — le seul contrôle possible
 * sur une lecture qui, elle, ne s'appuie que sur des coordonnées.
 */
type SetTable = { code: string; title: string; announced?: number; rows: Map<Column, string>[] };

const squeeze = (value: string): string => value.replace(/\s+/g, " ").trim();

/**
 * Fragments d'une même ligne, recollés dans l'ordre de lecture.
 *
 * L'espace n'est pas ajouté entre deux fragments mais déduit de la place qui
 * les sépare : le PDF coupe un mot en deux fragments jointifs sur une ligature
 * (`fi` + `n de partie`), qu'un espace systématique écrirait « fi n de partie ».
 */
function joinFragments(fragments: Fragment[]): string {
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
function linesOf(fragments: Fragment[]): Line[] {
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
 * Les lignes d'une colonne réunies en blocs, un par cellule.
 *
 * Deux lignes d'une même cellule sont séparées d'un interligne — un cinquième
 * de plus que le corps du texte —, deux cellules d'un filet du tableau, qui
 * laisse nettement plus de place. Le partage se fait donc sur l'écart, rapporté
 * à la taille du texte : rien ne dit qu'une ligne du tableau ait la hauteur des
 * autres — celle d'une carte dont l'effet tient sur six lignes fait le double —,
 * et une hauteur de ligne moyenne verserait la moitié d'un effet dans la carte
 * du dessus.
 */
function blocksOf(lines: Line[]): Line[][] {
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
function blockCenter(block: Line[]): number {
  return (block[0].y + block[block.length - 1].y) / 2;
}

/** Le contenu d'une cellule : ses lignes de haut en bas, recollées. */
function cellText(fragments: Fragment[]): string {
  return squeeze(linesOf(fragments).map((line) => joinFragments(line.fragments)).join(" "));
}

/**
 * Le tableau d'une page de l'inventaire, reconstruit de ses coordonnées.
 *
 * Rend `undefined` sur une page sans en-tête `N°` : la première page d'un
 * inventaire est parfois une couverture, et il n'y a alors pas de tableau à
 * lire.
 */
function readTable(fragments: Fragment[]): SetTable | undefined {
  const headers = fragments.filter((fragment) => (COLUMNS as readonly string[]).includes(squeeze(fragment.str)));
  const first = headers.find((fragment) => squeeze(fragment.str) === "N°");

  if (!first) {
    return undefined;
  }

  // Les en-têtes sont sur une même ligne ; ceux d'une autre page reliée au même
  // document, ou un mot du corps qui porterait le nom d'une colonne, ne sont
  // pas des colonnes.
  const columns = headers
    .filter((fragment) => Math.abs(fragment.y - first.y) < 3)
    .map((fragment) => ({ name: squeeze(fragment.str) as Column, x: fragment.x }))
    .sort((a, b) => a.x - b.x);

  // La limite entre deux colonnes tombe à mi-chemin de leurs en-têtes ; à
  // gauche de la première commencent les cases à cocher de la collection, qui
  // ne sont pas du tableau.
  const starts = columns.map((column, index) => (index === 0 ? column.x - 8 : (columns[index - 1].x + column.x) / 2));
  const columnAt = (x: number): number => (x < starts[0] ? -1 : starts.findLastIndex((start) => x >= start));

  // Le corps du tableau, rangé par colonne : le reste de la page — les cases à
  // cocher de la collection, le thème de la série — est à gauche de la
  // première, et n'appartient à aucune ligne.
  const byColumn = columns.map((): Fragment[] => []);

  for (const fragment of fragments.filter((fragment) => fragment.y < first.y - 3)) {
    const column = columnAt(fragment.x);
    if (column >= 0) {
      byColumn[column].push(fragment);
    }
  }

  const numberColumn = columns.findIndex((column) => column.name === "N°");
  const nameColumn = columns.findIndex((column) => column.name === "Nom");

  // Une ligne du tableau est ancrée sur son numéro de carte, qui en occupe le
  // milieu.
  const anchors = byColumn[numberColumn]
    .filter((fragment) => /^\d/.test(fragment.str.trim()))
    .map((fragment) => fragment.y)
    .sort((a, b) => b - a);

  // La plus courte distance entre deux numéros est la hauteur d'une ligne
  // ordinaire, celle dont l'effet tient sur une seule ligne de texte.
  const pitch = Math.min(...anchors.slice(1).map((y, index) => anchors[index] - y));

  // Une carte sans numéro — l'Esbroufe du Starter Pack — n'a pas d'ancre : son
  // nom en ouvre une, sans quoi sa ligne serait versée dans celle du dessous.
  for (const block of blocksOf(linesOf(byColumn[nameColumn]))) {
    const center = blockCenter(block);

    if (anchors.every((anchor) => Math.abs(anchor - center) > pitch / 2)) {
      anchors.push(center);
    }
  }

  anchors.sort((a, b) => b - a);

  const cells = anchors.map(() => columns.map((): Fragment[] => []));

  byColumn.forEach((fragments, column) => {
    for (const block of blocksOf(linesOf(fragments))) {
      const center = blockCenter(block);
      let row = 0;

      for (let index = 1; index < anchors.length; index++) {
        if (Math.abs(anchors[index] - center) < Math.abs(anchors[row] - center)) {
          row = index;
        }
      }

      cells[row][column].push(...block.flatMap((line) => line.fragments));
    }
  });

  const top = Math.max(...fragments.map((fragment) => fragment.y));

  // Le compte que la page affiche à côté de ses cases à cocher, à gauche du
  // tableau : « Nb de cartes dans la série : 42 ».
  const aside = cellText(fragments.filter((fragment) => fragment.x < starts[0]));
  const announced = /Nb de cartes dans (?:la série|le deck)\s*:?\s*(\d+)/i.exec(aside)?.[1];

  return {
    // Le code d'extension est le libellé le plus à droite de la première ligne
    // de la page, en regard du titre du document.
    code: squeeze(fragments.filter((f) => f.y > top - 2).sort((a, b) => b.x - a.x)[0]?.str ?? ""),
    // Le titre de la série tient entre ce bandeau et les en-têtes du tableau,
    // dans la moitié gauche de la page — la droite porte la mention de
    // copyright.
    title: cellText(fragments.filter((f) => f.y > first.y + 5 && f.y < top - 5 && f.x < 300)),
    announced: announced ? Number(announced) : undefined,
    rows: cells.map((row) => new Map(columns.map((column, index) => [column.name, cellText(row[index])]))),
  };
}

/** Les extensions d'un inventaire : une par page qui porte un tableau. */
async function readInventory(pdf: Uint8Array): Promise<SetTable[]> {
  const document = await getDocument({ data: pdf, useSystemFonts: true }).promise;
  const tables: SetTable[] = [];

  for (let index = 1; index <= document.numPages; index++) {
    const content = await (await document.getPage(index)).getTextContent();
    const fragments = content.items.flatMap((item): Fragment[] =>
      "str" in item && item.str.trim()
        ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height }]
        : []
    );

    const table = readTable(fragments);
    if (table) {
      tables.push(table);
    }
  }

  return tables;
}

// --- Rapprochement des illustrations ------------------------------------

/** Nom de fichier `s3-14-r_nenu-gardien-de-phare.webp` : extension et numéro. */
const IMAGE_FILE = /^([a-z]{1,3}\d{1,2})-(\d{1,3})(?=[-_.])/;

/** Une image nommée par un UUID ne dit rien de la carte qu'elle montre. */
const UUID_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./;

/**
 * Texte réduit à ce qu'une comparaison peut tenir pour identique : accents
 * retirés, minuscules, ponctuation devenue tiret. La longueur d'origine sert de
 * limite parce que `slugSegment` tronque à soixante caractères par défaut, ce
 * qui couperait un texte alternatif au milieu d'une phrase.
 */
const normalized = (value: string): string => slugSegment(value, value.length);

/** Distance d'édition, pour rattraper une coquille dans un texte alternatif. */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const previous = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = previous;
    }
  }

  return row[b.length];
}

/**
 * Le nom se retrouve-t-il, à une coquille près, dans ce texte alternatif ?
 *
 * La comparaison se fait sur des fenêtres de la longueur du nom, à un mot près
 * — « P'tit Cap'taine » est écrit « P'tit Capitaine » —, et le seuil est assez
 * haut pour qu'aucun autre nom de la série ne passe : une illustration
 * attribuée à la mauvaise carte serait pire que pas d'illustration.
 */
function looksLike(name: string, alt: string): boolean {
  if (name.length < 6) {
    return false;
  }

  const words = alt.split("-");
  const size = name.split("-").length;

  for (const length of [size - 1, size, size + 1]) {
    for (let start = 0; length >= 1 && start + length <= words.length; start++) {
      const window = words.slice(start, start + length).join("-");
      if (1 - editDistance(name, window) / Math.max(name.length, window.length) >= 0.87) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Illustrations de la page, rangées par numéro de carte et par extension.
 *
 * Le nom de fichier ne porte pas toujours le code d'extension de l'inventaire —
 * le Starter Pack est `STR` dans le PDF et `ds1-…` sur le site : une extension
 * qui ne retrouve pas ses images sous son propre code prend le lot inutilisé le
 * plus fourni, à condition qu'il couvre la moitié de ses cartes. Le lot d'une
 * image isolée — le bandeau de pied de page, qui est une carte d'une autre
 * série — ne passe donc jamais pour l'extension d'une page.
 */
function numberedImages(images: SetImage[]): Map<string, Map<string, SetImage>> {
  const groups = new Map<string, Map<string, SetImage>>();

  for (const image of images) {
    const match = UUID_FILE.test(image.file) ? null : IMAGE_FILE.exec(image.file);

    if (!match) {
      continue;
    }

    const group = groups.get(match[1]) ?? new Map<string, SetImage>();
    group.set(String(Number(match[2])), image);
    groups.set(match[1], group);
  }

  return groups;
}

// --- Transformation ------------------------------------------------------

/** L'inventaire écrit ainsi l'absence de valeur : elle ne vaut pas d'être écrite. */
const ABSENT = new Set(["", "n/a", "na", "aucun", "aucune", "-", "?"]);

const attribute = (value: string | undefined): string | undefined =>
  value && !ABSENT.has(value.toLowerCase()) ? value : undefined;

/**
 * L'inventaire ne donne jamais qu'un type et qu'un archétype par carte ; les
 * clés de l'application, elles, en attendent une liste — c'est ce que portent
 * les autres jeux, et un filtre s'y fait de la même façon quel qu'en soit le
 * nombre.
 */
function attributeList(value: string | undefined): string[] | undefined {
  const kept = attribute(value);
  return kept ? [kept] : undefined;
}

/** La valeur d'une carte, quand l'inventaire la chiffre. */
function valueOf(raw: string | undefined, name: string): number | undefined {
  const value = attribute(raw);

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value.replace(",", "."));

  if (!Number.isFinite(parsed)) {
    // La valeur d'une carte se calcule parfois en jeu : l'inventaire l'écrit
    // alors « ? », que `ABSENT` retient déjà. Tout autre texte est une surprise.
    console.warn(`« ${name} » : la valeur « ${value} » n'est pas un nombre, elle est écartée.`);
    return undefined;
  }

  return parsed;
}

/**
 * Le titre de la série tel que l'écrit le site : « Série 1 - L'Aventure ».
 * L'inventaire, lui, pose le numéro et le thème côte à côte sans les lier.
 */
function setNameOf(title: string): string | undefined {
  return text(title.replace(/^(Série\s+\d+)\s+(?=\S)/i, "$1 - "));
}

/**
 * Une carte de l'inventaire. Rend `undefined` sur une ligne sans nom ou sans
 * numéro : les deux font son identité, et une carte sans identifiant n'est pas
 * collectionnable.
 */
function toCard(row: Map<Column, string>, table: SetTable, setCode: string): DnpCard | undefined {
  // Le numéro porte parfois le nombre d'exemplaires du deck (« 00 (x2) »), et
  // le suffixe d'une version promo (« 01-A ») qui, lui, fait partie du numéro.
  const collectorNumber = text(/^\d+(?:-[A-Za-z])?/.exec(row.get("N°") ?? "")?.[0]);
  // Le PDF annonce la version promo sous le nom de la carte ; sa rareté le dit
  // déjà, et la mention n'est pas un nom.
  const name = text((row.get("Nom") ?? "").replace(/\s*-\s*Alternative promo\s*$/i, ""));

  if (!name || !collectorNumber) {
    const shown = squeeze(`${row.get("N°") ?? ""} ${row.get("Nom") ?? ""}`);
    console.warn(`${setCode} : ligne sans nom ou sans numéro${shown ? ` (« ${shown} »)` : ""}, elle est écartée.`);
    return undefined;
  }

  return {
    id: buildCardId(GAME, setCode, collectorNumber),
    name,
    setCode,
    collectorNumber,
    lang: LANGUAGE,
    text: attribute(row.get("Effet")),
    setName: setNameOf(table.title),
    type: attribute(row.get("Classe")),
    power: valueOf(row.get("Valeur"), name),
    types: attributeList(row.get("Type")),
    tags: attributeList(row.get("Archétype")),
    rarity: attribute(row.get("Rareté")),
  };
}

/**
 * Les cartes d'une page de série, illustrations comprises.
 *
 * Les trois rapprochements se font dans l'ordre — numéro, puis nom exact, puis
 * nom approché — et sur toutes les cartes avant de passer au suivant : une
 * correspondance sûre doit prendre son image avant qu'une approximation ne la
 * lui vole.
 */
function toCards(
  table: SetTable,
  page: SetPage,
  groups: Map<string, Map<string, SetImage>>,
  claimed: Set<string>,
  used: Set<string>
): DnpCard[] {
  const setCode = table.code.toUpperCase();
  const cards = table.rows.flatMap((row) => toCard(row, table, setCode) ?? []);

  let numbered = groups.get(setCode.toLowerCase());

  if (!numbered) {
    const [prefix, images] = [...groups]
      .filter(([candidate]) => !claimed.has(candidate))
      .sort((a, b) => b[1].size - a[1].size)[0] ?? [];

    if (prefix && images && images.size >= cards.length / 2) {
      numbered = images;
      claimed.add(prefix);
    }
  } else {
    claimed.add(setCode.toLowerCase());
  }

  for (const card of cards) {
    // Une version promo porte le numéro de la carte qu'elle décline : le nom de
    // fichier, lui, ne connaît que la carte de base — la lui donner mettrait
    // l'illustration ordinaire sur la promo.
    const image = card.collectorNumber.includes("-")
      ? undefined
      : numbered?.get(String(Number(card.collectorNumber)));

    if (image && !used.has(image.url)) {
      card.image = image.url;
      used.add(image.url);
    }
  }

  for (const exact of [true, false]) {
    for (const card of cards.filter((card) => !card.image)) {
      const name = normalized(card.name);
      const image = page.images.find(
        (candidate) =>
          !used.has(candidate.url) &&
          (exact
            ? normalized(candidate.alt).includes(name) || normalized(candidate.file).includes(name)
            : looksLike(name, normalized(candidate.alt)))
      );

      if (image) {
        card.image = image.url;
        used.add(image.url);
      }
    }
  }

  // Le compte annoncé est celui des exemplaires du produit, pas celui des
  // cartes : le Starter Pack contient deux Esbroufe, et une version promo
  // n'entre pas dans le compte de la série qu'elle décline. Un écart après ce
  // décompte-là veut dire qu'une ligne du tableau a été perdue — c'est tout ce
  // qui peut arriver à une lecture qui ne s'appuie que sur des coordonnées.
  const counted = table.rows.reduce((total, row) => {
    const number = row.get("N°") ?? "";
    return /^\d+\s*(?:\(x\d+\))?$/.test(number.trim())
      ? total + Number(/\(x(\d+)\)/.exec(number)?.[1] ?? 1)
      : total;
  }, 0);

  if (table.announced !== undefined && table.announced !== counted) {
    console.warn(`${setCode} : ${counted} cartes lues pour ${table.announced} annoncées par l'inventaire.`);
  }

  const missing = cards.filter((card) => !card.image);

  console.info(
    `${setCode} (${setNameOf(table.title) ?? "sans titre"}) : ${cards.length} cartes, ` +
      `${cards.length - missing.length} illustrations.`
  );

  if (missing.length > 0) {
    console.warn(`${setCode} : sans illustration — ${missing.map((card) => `${card.collectorNumber} ${card.name}`).join(", ")}`);
  }

  return cards;
}

// --- Téléchargement complet ---------------------------------------------

async function fetchCatalog(): Promise<DnpCard[]> {
  const urls = setPageUrls(await fetchPage(CARDS_PAGE));

  if (urls.length === 0) {
    throw new Error(`Aucune série listée sur ${CARDS_PAGE} : la page a changé de forme.`);
  }

  console.info(`${urls.length} séries listées sur ${CARDS_PAGE}.`);

  const byId = new Map<string, DnpCard>();

  for (const url of urls) {
    const page = readSetPage(url, await fetchPage(url));

    if (!page) {
      continue;
    }

    const tables = await readInventory(await fetchBytes(page.pdf));

    if (tables.length === 0) {
      console.warn(`${page.pdf} : aucun tableau de cartes, l'inventaire est ignoré.`);
      continue;
    }

    const groups = numberedImages(page.images);
    // Les illustrations déjà attribuées, d'une extension à l'autre : la page
    // d'une série porte les images du deck préconstruit et celles des boosters,
    // et une carte du deck n'a pas à prendre l'illustration d'une carte de la
    // série au nom voisin.
    const used = new Set<string>();
    // Une extension qui a ses propres images les garde : elles sont réservées
    // avant que celle qui n'en trouve pas ne se rabatte sur le lot le plus
    // fourni, sans quoi le deck préconstruit prendrait celles de la série.
    const claimed = new Set(
      tables.map((table) => table.code.toLowerCase()).filter((code) => groups.has(code))
    );

    for (const table of tables) {
      for (const card of toCards(table, page, groups, claimed, used)) {
        const taken = byId.get(card.id);

        // Deux cartes qui rendraient le même identifiant s'écraseraient l'une
        // l'autre — et la seconde effacerait la première en base.
        if (taken) {
          console.warn(`${card.id} : « ${card.name} » et « ${taken.name} » portent le même identifiant.`);
        }

        byId.set(card.id, card);
      }
    }
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// --- Écriture ------------------------------------------------------------

/** Le jeu doit exister en base : le script ne crée pas de jeu. */
async function resolveGameId(): Promise<ObjectId> {
  const game = await db.collection("games").findOne({ slug: GAME_SLUG }, { projection: { _id: 1 } });

  if (!game) {
    throw new Error(
      `Aucun jeu avec le slug « ${GAME_SLUG} » : créez-le depuis l'administration, ou passez DNP_GAME_SLUG.`
    );
  }

  return game._id;
}

/**
 * Variantes d'impression déjà enregistrées, par identifiant de carte.
 *
 * La source ne publie qu'un tirage par carte : l'import n'écrit donc jamais de
 * variante, et celles saisies depuis l'administration — les versions gold, que
 * l'inventaire compte sans les décrire — survivent en base, où il n'écrit que
 * les champs qu'il connaît. Le document de recherche, lui, est réécrit en
 * entier : sans ce rappel, les variantes disparaîtraient de la galerie, des
 * boosters et des listes de souhaits, qui les lisent dans l'index.
 */
async function readStoredPrintings(ids: string[], gameId: ObjectId): Promise<Map<string, CardPrinting[]>> {
  const docs = await db
    .collection("cards")
    .find({ gameId, id: { $in: ids } }, { projection: { _id: 0, id: 1, printings: 1 } })
    .toArray();

  return new Map(
    docs.flatMap((doc) =>
      typeof doc.id === "string" && Array.isArray(doc.printings) && doc.printings.length > 0
        ? [[doc.id, doc.printings as CardPrinting[]] as const]
        : []
    )
  );
}

async function writeCards(cards: DnpCard[]): Promise<void> {
  const gameId = await resolveGameId();

  console.info(`Écriture de ${cards.length} cartes pour le jeu « ${GAME_SLUG} » (${gameId})...`);

  const BATCH = 500;
  for (let index = 0; index < cards.length; index += BATCH) {
    const batch = cards.slice(index, index + BATCH);

    await db.collection("cards").bulkWrite(
      batch.map((card) => {
        // Une propriété absente de la source (une carte sans archétype, sans
        // valeur…) ne doit pas être écrite en `null` sur le document existant.
        const fields = Object.fromEntries(Object.entries(card).filter(([, value]) => value !== undefined));

        return {
          updateOne: {
            filter: { id: card.id, gameId },
            update: {
              $set: { ...fields, gameId },
              // Distingue les cartes importées de celles ajoutées à la main
              // depuis l'administration (`source: 'manual'`).
              $setOnInsert: { source: "import" },
            },
            upsert: true,
          },
        };
      })
    );

    console.info(`Base : ${Math.min(index + BATCH, cards.length)}/${cards.length}`);
  }

  await writeSearchIndex(cards, gameId);
}

/**
 * Délai laissé à une tâche Meilisearch. Le client attend cinq secondes par
 * défaut : une tranche de mille documents met plus longtemps que ça à
 * s'indexer sur un serveur chargé, et l'import échouerait alors qu'il n'a rien
 * de cassé.
 */
const TASK_TIMEOUT_MS = 120_000;

/**
 * Attend la fin d'une tâche Meilisearch, et fait de son échec une erreur.
 *
 * Régler l'index et y envoyer des documents sont des tâches asynchrones : la
 * requête rend la main dès qu'elles sont mises en file. Sans attente, le script
 * annoncerait un import terminé alors que rien n'est encore indexé, et un refus
 * — un document rejeté, une clé primaire qui ne correspond pas — ne se lirait
 * nulle part : `waitTask` rend la tâche échouée, il ne lève pas.
 */
async function runTask(enqueued: EnqueuedTaskPromise, what: string): Promise<void> {
  const task = await enqueued.waitTask({ timeout: TASK_TIMEOUT_MS });

  if (task.status !== "succeeded") {
    throw new Error(`${what} : tâche Meilisearch ${task.status} — ${task.error?.message ?? "sans motif"}.`);
  }
}

/**
 * Pousse les cartes dans l'index de recherche, en le créant au besoin.
 *
 * L'index n'est **pas** vidé : il porte aussi les cartes ajoutées à la main
 * depuis l'administration — les promos, que le site raconte sans les décrire —,
 * que la source ne publiera jamais.
 *
 * Ses réglages sont posés au passage, d'après les attributs que portent
 * réellement les cartes du jeu — c'est ce que fait « Mettre à jour l'index » de
 * l'administration, et sans quoi Meilisearch refuse les filtres et les tris de
 * la galerie (cf. docs/CARD_EXPLORER_FILTERS.md). Ils sont relus de la base,
 * qui vient d'être écrite : un premier import laisse donc un index utilisable
 * sans autre geste.
 */
async function writeSearchIndex(cards: DnpCard[], gameId: ObjectId): Promise<void> {
  const indexConfig = indexes[GAME];

  await ensureCardIndex(indexConfig.name);

  const facets = await getGameCardFilterFacets(gameId);
  await runTask(
    meilisearch.index(indexConfig.name).updateSettings(
      cardIndexSettings(indexConfig, {
        facetKeys: facets.map((facet) => facet.key),
        numericKeys: facets.flatMap((facet) => (facet.type === "number" ? [facet.key] : [])),
      })
    ),
    `Réglage de l'index « ${indexConfig.name} »`
  );
  console.info(`Index « ${indexConfig.name} » réglé sur ${facets.length} attributs.`);

  const storedPrintings = await readStoredPrintings(
    cards.map((card) => card.id),
    gameId
  );

  if (storedPrintings.size > 0) {
    console.info(`${storedPrintings.size} cartes portent des variantes saisies à la main, elles sont conservées.`);
  }

  const index = meilisearch.index(indexConfig.name);
  for (let offset = 0; offset < cards.length; offset += 1000) {
    const last = Math.min(offset + 1000, cards.length);

    await runTask(
      index.addDocuments(
        cards.slice(offset, offset + 1000).map((card) => importedCardSearchDocument(card, storedPrintings.get(card.id)))
      ),
      `Envoi des cartes ${offset + 1} à ${last}`
    );
    console.info(`Index : ${last}/${cards.length}`);
  }
}

// --- Entrée --------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const fromFile = args.includes("--from-file");
  const fetchOnly = args.includes("--fetch-only");

  // Les deux options s'excluent : l'une télécharge sans écrire, l'autre écrit
  // sans télécharger. Ensemble, elles ne feraient rien du tout, en ayant l'air
  // d'avoir travaillé.
  if (fromFile && fetchOnly) {
    throw new Error("--fetch-only télécharge sans rien écrire, --from-file écrit sans télécharger : choisissez.");
  }

  const cards: DnpCard[] = fromFile ? JSON.parse(await readFile(CARDS_FILE, "utf-8")) : await fetchCatalog();

  // Avant d'écrire quoi que ce soit, fichier compris : une page dont la forme a
  // changé rend des inventaires vides sans lever d'erreur, et le cache serait
  // alors écrasé par un catalogue vide.
  if (cards.length === 0) {
    throw new Error(`Aucune carte lue sur ${SITE} : rien n'est écrit.`);
  }

  if (!fromFile) {
    await writeFile(CARDS_FILE, JSON.stringify(cards, null, 2));
    console.info(`${cards.length} cartes écrites dans ${CARDS_FILE}.`);
  }

  if (fetchOnly) {
    return;
  }

  await writeCards(cards);
  console.info("Import terminé.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
