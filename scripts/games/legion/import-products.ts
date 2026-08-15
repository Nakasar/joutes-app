/**
 * Import du catalogue de produits Star Wars: Legion.
 *
 * Atomic Mass Games n'expose pas d'API pour Legion — le `character` de son
 * WordPress ne publie ni la référence produit ni le contenu d'une boîte. Deux
 * pages rendues côté serveur les portent en revanche en entier, et une requête
 * chacune suffit :
 *
 *  - **la galerie** (`/legion-gallery/`) — les produits encore au catalogue :
 *    référence, nom, visuel, type commercial et factions ;
 *  - **les notices de montage** (`/assembly/`) — un bien plus large historique,
 *    l'ère FFG (`SWL…`) comprise, avec référence, nom et visuel.
 *
 * Leur réunion fait le catalogue : une centaine de références n'existent que
 * dans la seconde, une vingtaine (cartes, dés — rien à monter) que dans la
 * première.
 *
 * ## Il n'y a pas de figurines, et ce n'est pas un oubli
 *
 * Contrairement à Shatterpoint, dont le site communautaire publie l'unité par
 * unité le contenu de chaque boîte, AMG ne décrit nulle part ce qu'il y a dans
 * une boîte Legion sous une forme exploitable : la notice de montage est un PDF,
 * et la fiche produit une prose (« This expansion contains 7 miniatures ») que
 * 44 des 64 fiches portent — soit moins d'un tiers du catalogue, les 88 produits
 * qui n'ont plus de fiche du tout n'en ayant aucune.
 *
 * Tous les produits sont donc importés en **feuilles**, sans `contents`. Le jour
 * où une source décrira les unités, il suffira de leur ajouter un contenu : les
 * identifiants des boîtes, eux, ne bougeront pas.
 *
 * ## Identifiants et gamme
 *
 * L'identifiant est la **référence du produit** telle qu'AMG l'imprime :
 * `SWL01`, `SWQ53`, `SWK25`. La gamme (`setCode`) est son préfixe — la même
 * règle que le `SWP` de Shatterpoint, qui ici sépare utilement trois lignes :
 *
 * | Gamme | Ce qu'elle rassemble |
 * | --- | --- |
 * | `SWL` | l'ère Fantasy Flight Games |
 * | `SWQ` | l'ère Atomic Mass Games |
 * | `SWK` | les exclusivités et les sorties hobby |
 *
 * Elle a son utilité : plusieurs unités ont été rééditées sous une nouvelle
 * référence (« Range Troopers » est `SWL117` puis `SWQ89`), et ce sont bien deux
 * boîtes différentes.
 *
 * ## Usage (depuis la racine du dépôt)
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/games/legion/import-products.ts [--dry-run] [--force] \
 *     [--game legion] [--refresh-images]
 *
 * `--conditions=react-server` est nécessaire parce que `lib/mongodb` importe
 * `server-only`, et le hook résout l'alias `@/` de tsconfig.json hors bundler.
 *
 * - `--dry-run` : affiche le bilan sans rien écrire, ni en base ni sur le Blob ;
 * - `--force` : réécrit aussi les produits modifiés à la main depuis
 *   `/admin/products`, épargnés par défaut ;
 * - `--game <slug>` : jeu à alimenter, `legion` par défaut ;
 * - `--refresh-images` : renvoie les images déjà présentes sur le Blob.
 *
 * ## Éditions
 *
 * Legion en traverse deux, qui ne sont pas compatibles. L'import pose l'attribut
 * `edition` d'après le préfixe de la référence (`EDITION_BY_PREFIX`) — AMG n'en
 * dit rien, c'est une lecture des références et non une donnée de la source.
 * L'édition **en cours**, elle, se règle depuis `/admin/products` : c'est elle
 * que les catalogues montrent par défaut.
 *
 * ## Factions
 *
 * La galerie range chaque produit sous une ou plusieurs factions — c'est ce que
 * filtrent ses boutons —, et l'import les pose en attribut `faction`. Contrairement
 * à l'édition, ce n'en est pas une lecture : c'est la donnée d'AMG, reprise telle
 * qu'il l'écrit.
 *
 * **Les libellés sont lus sur la page, pas listés ici.** Les boutons de filtre
 * portent « Star Wars: Legion Rebel Alliance » en regard de la classe
 * `star-wars-legion-rebel-alliance` : la table se construit donc à chaque
 * exécution, et une faction ajoutée par AMG entre au catalogue sans qu'on
 * touche à ce fichier.
 *
 * **La valeur est toujours une liste**, même à une seule faction : un paquet de
 * cartes en couvre six, et une clé qui serait tantôt une chaîne tantôt un
 * tableau se filtrerait mal et se saisirait plus mal encore depuis
 * `/admin/products`.
 *
 * **Seule la galerie classe par faction.** Les produits qui n'y sont plus —
 * l'ère FFG pour l'essentiel, mais aussi des références AMG épuisées — n'en
 * portent donc aucune : 89 des 152 du catalogue au moment d'écrire ces lignes.
 * Le bilan de fin d'exécution les compte, pour qu'un filtre à demi peuplé ne
 * passe pas pour une anomalie, et une faction saisie à la main depuis
 * `/admin/products` survit aux imports suivants.
 *
 * L'import n'écrit que les attributs qu'il connaît, chacun sous sa propre clé :
 * ce qu'un administrateur a saisi à côté lui survit, et un produit retouché à la
 * main est épargné en entier. Les index doivent exister avant la première
 * exécution (`npx tsx scripts/create-product-indexes.ts`).
 *
 * Variables d'environnement : `MONGODB_URI`, `BLOB_READ_WRITE_TOKEN`.
 */
import type { ProductKindKey } from "../../../lib/constants/product-kinds.ts";
import { PRODUCT_EDITION_ATTRIBUTE } from "../../../lib/constants/product-editions.ts";
import {
  argValue,
  fetchText,
  importProducts,
  resolveGameId,
  type ImportedProduct,
} from "../product-import.ts";

const GALLERY_URL = "https://www.atomicmassgames.com/legion-gallery/";
const ASSEMBLY_URL = "https://www.atomicmassgames.com/assembly/";

/** Classe que le thème pose sur les produits Legion, les deux pages confondues. */
const LEGION_CLASS = "star-wars-legion";

/**
 * Clé de l'attribut qui porte les factions. Elle reste locale à cet import :
 * l'application ne la nomme nulle part — la colonne de filtres et la syntaxe de
 * recherche relèvent les attributs qu'un jeu porte, elles n'en connaissent
 * aucun d'avance.
 */
const FACTION_ATTRIBUTE = "faction";

/**
 * Préfixe des libellés de faction sur les boutons de filtre : « Star Wars:
 * Legion Rebel Alliance » désigne la faction « Rebel Alliance ». C'est la ligne
 * de jeu, répétée devant chaque faction parce que le même menu sert Shatterpoint
 * et Crisis Protocol.
 */
const FACTION_LABEL_PREFIX = /^Star Wars:\s*Legion\s+/i;

/** Préfixe des images recopiées sur le Blob, pour les retrouver et les lister. */
const BLOB_PREFIX = "products/legion";

/**
 * Type commercial de la galerie -> `kind` du catalogue.
 *
 * Le `kind` ne pilote aucun comportement : ce qui fait d'un produit un conteneur,
 * c'est son contenu (cf. `lib/constants/product-kinds.ts`). Il n'est qu'une
 * facette d'affichage et de filtre.
 */
const KIND_BY_PRODUCT_TYPE: Record<string, ProductKindKey> = {
  "unit-expansion": "box",
  "operative-expansion": "box",
  "commander-expansion": "box",
  "expansion-pack": "box",
  "squad-pack": "box",
  "battle-force": "bundle",
  "core-set": "starter",
  "starter-set": "starter",
  "army-starter": "starter",
  "card-pack": "accessory",
  "dice-pack": "accessory",
  "terrain-pack": "accessory",
  "tools-pack": "accessory",
};

/**
 * Les notices de montage ne portent aucun type : seul le nom le trahit.
 *
 * Le premier motif qui accroche l'emporte, et l'ordre n'est pas indifférent :
 * « Galactic Battlefields Starter Set Terrain Pack » est un décor vendu en
 * boîte, pas un coffret de démarrage — ce qu'il contient prime sur la façon
 * dont il est présenté.
 */
const KIND_BY_NAME: [RegExp, ProductKindKey][] = [
  [/\bterrain pack\b/i, "accessory"],
  [/\bcard pack\b/i, "accessory"],
  [/\bdice pack\b/i, "accessory"],
  [/\bmeasuring tools\b/i, "accessory"],
  [/\bcore set\b/i, "starter"],
  [/\bstarter (set|kit)\b/i, "starter"],
  [/\barmy box\b/i, "bundle"],
  [/\bbattle force\b/i, "bundle"],
];

/** Une boîte de figurines : ce qu'est l'immense majorité du catalogue. */
const FALLBACK_KIND: ProductKindKey = "box";

/**
 * Édition du jeu, déduite du préfixe de la référence.
 *
 * Legion a traversé deux éditions qui ne sont pas compatibles, et la coupure
 * suit celle des éditeurs : `SWL` est l'ère Fantasy Flight Games, `SWQ` celle
 * d'Atomic Mass Games, `SWK` les exclusivités et sorties hobby, toutes récentes.
 *
 * **Le site d'AMG ne dit rien des éditions** — ni sa galerie, ni ses notices, ni
 * sa taxonomie `era`, qui parle des époques de la fiction (Clone Wars, Age of
 * Rebellion) et non des versions du jeu. Ce tableau est donc une lecture des
 * références, pas une donnée reprise de la source : c'est ici qu'on la corrige,
 * et une correction faite depuis `/admin/products` survit aux imports suivants.
 */
const EDITION_BY_PREFIX: Record<string, string> = {
  SWL: "Première édition",
  SWQ: "Seconde édition",
  SWK: "Seconde édition",
};

/** Une tuile de produit, telle que les deux pages la rendent. */
type Tile = {
  /** Classes du bloc : ligne de jeu, factions, et type commercial en galerie. */
  classes: string[];
  /** Référence imprimée sur la boîte, `SWQ53`. */
  code: string;
  name: string;
  image: string;
};

/**
 * Entités HTML des noms de produits. WordPress y écrit `&#038;` là où le nom
 * porte une esperluette — « Rogues &#038; Rebels » —, et le nom d'un produit
 * finit tel quel sous les yeux d'un utilisateur.
 */
function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    }
    return named[body.toLowerCase()] ?? entity;
  });
}

/**
 * Les tuiles d'une page de listing.
 *
 * Les deux pages partagent la même trame — un bloc par produit, marqué `all mix`
 * puis ses classes de filtre, contenant un visuel et un titre préfixé de la
 * référence. Seule la largeur de colonne les distingue, et c'est justement ce
 * qu'on ne regarde pas : le découpage part de `all mix`, pas de `col-lg-3`.
 */
function parseTiles(html: string): Tile[] {
  const tiles: Tile[] = [];

  for (const chunk of html.split(/class="[^"]*\ball mix\s+/).slice(1)) {
    const classes = chunk.slice(0, chunk.indexOf('"')).replace(/,/g, " ").split(/\s+/).filter(Boolean);
    const image = /<img[^>]*\ssrc="([^"]+)"/.exec(chunk);
    const title = /<span\s+class="product-code"\s*>([^<]*)<\/span>([^<]*)/.exec(chunk);

    if (!image || !title) {
      continue;
    }

    const code = decodeEntities(title[1]).trim().toUpperCase();
    const name = decodeEntities(title[2]).trim();

    // Une tuile sans référence ni nom ne désigne aucun produit : elle ne peut
    // ni porter un identifiant figé, ni s'afficher.
    if (!code || !name) {
      continue;
    }

    tiles.push({ classes, code, name, image: image[1] });
  }

  return tiles;
}

/**
 * Les factions de la page, telles que ses boutons de filtre les nomment :
 * classe du thème -> libellé lisible.
 *
 * Lire le menu plutôt que d'inscrire six factions dans le code a une raison
 * simple : Legion en a gagné deux depuis sa sortie (Mandalorian, Shadow
 * Collective), et la prochaine doit entrer au catalogue sans qu'on touche à ce
 * fichier. Une page qui n'a pas de menu — les notices de montage — n'en rend
 * aucune, ce qui est exact : elle ne classe pas par faction.
 */
function parseFactionLabels(html: string): Map<string, string> {
  const labels = new Map<string, string>();

  for (const match of html.matchAll(
    /data-filter="\.?(star-wars-legion-[a-z0-9-]+)"[^>]*>([^<]+)</gi
  )) {
    const label = decodeEntities(match[2]).replace(FACTION_LABEL_PREFIX, "").trim();
    if (label) {
      labels.set(match[1].toLowerCase(), label);
    }
  }

  return labels;
}

/** Tuiles Legion d'une page, avec un garde-fou si la trame du thème a changé. */
async function fetchLegionPage(url: string, label: string): Promise<{ tiles: Tile[]; factions: Map<string, string> }> {
  const html = await fetchText(url);
  const tiles = parseTiles(html).filter((tile) => tile.classes.includes(LEGION_CLASS));

  // Sans ce contrôle, un thème remanié ferait un import parfaitement silencieux
  // de zéro produit, et le bilan final annoncerait « 0 créés » sans rien
  // laisser deviner de la cause.
  if (tiles.length === 0) {
    throw new Error(
      `Aucun produit Legion lu sur ${url} : la page a probablement changé de trame. ` +
        `Vérifiez le découpage de parseTiles.`
    );
  }

  const factions = parseFactionLabels(html);
  console.info(
    `${label} : ${tiles.length} produits` +
      (factions.size > 0 ? `, ${factions.size} factions au menu de filtrage` : "") +
      "."
  );

  return { tiles, factions };
}

/**
 * Les factions d'une tuile, dans l'ordre alphabétique — l'ordre des classes
 * n'en est pas un, et deux exécutions doivent écrire la même liste.
 */
function factionsOf(tile: Tile, labels: Map<string, string>): string[] {
  const found = tile.classes.flatMap((className) => {
    const label = labels.get(className.toLowerCase());
    return label ? [label] : [];
  });

  return [...new Set(found)].sort((a, b) => a.localeCompare(b));
}

/** `SWQ53` -> `SWQ`. La gamme, et rien d'autre : le numéro est retiré. */
function setCodeOf(code: string): string {
  return /^[A-Z]+/.exec(code)?.[0] ?? code;
}

/**
 * Le nom est consulté **avant** le type de la galerie, qui range presque tout
 * Legion sous « unit-expansion » : sans cela, le coffret de démarrage Rebelle
 * passerait pour une boîte d'unité comme une autre.
 */
function kindOf(tile: Tile): ProductKindKey | undefined {
  const byName = KIND_BY_NAME.find(([pattern]) => pattern.test(tile.name))?.[1];
  if (byName) {
    return byName;
  }

  for (const productType of tile.classes) {
    const kind = KIND_BY_PRODUCT_TYPE[productType];
    if (kind) {
      return kind;
    }
  }

  return undefined;
}

/**
 * Le catalogue : la galerie, complétée des notices de montage.
 *
 * La galerie l'emporte quand les deux décrivent le même produit — elle seule
 * porte le type commercial, et son visuel est celui de la fiche produit, là où
 * la notice montre parfois une variante de couverture.
 */
async function buildCatalog(): Promise<{
  products: ImportedProduct[];
  untyped: string[];
  /** Références dont le préfixe n'est rattaché à aucune édition. */
  undated: string[];
  /** Références qu'aucun menu ne range sous une faction — l'ère FFG, pour l'essentiel. */
  factionless: string[];
}> {
  const [gallery, assembly] = await Promise.all([
    fetchLegionPage(GALLERY_URL, "Galerie"),
    fetchLegionPage(ASSEMBLY_URL, "Notices de montage"),
  ]);

  const tiles = new Map<string, Tile>();
  for (const tile of [...assembly.tiles, ...gallery.tiles]) {
    tiles.set(tile.code, tile);
  }

  // Les deux menus réunis, pour ne pas dépendre de la page qui a fourni la
  // tuile retenue : seule la galerie classe par faction aujourd'hui, mais rien
  // n'oblige l'autre à ne jamais s'y mettre.
  const factionLabels = new Map([...assembly.factions, ...gallery.factions]);

  const untyped: string[] = [];
  const undated: string[] = [];
  const factionless: string[] = [];

  const products = [...tiles.values()]
    .map((tile) => {
      const kind = kindOf(tile);
      if (!kind) {
        untyped.push(tile.code);
      }

      const setCode = setCodeOf(tile.code);
      const edition = EDITION_BY_PREFIX[setCode];
      if (!edition) {
        undated.push(tile.code);
      }

      const factions = factionsOf(tile, factionLabels);
      if (factions.length === 0) {
        factionless.push(tile.code);
      }

      return {
        id: tile.code,
        name: tile.name,
        kind: kind ?? FALLBACK_KIND,
        setCode,
        // AMG ne publie le contenu d'aucune boîte Legion : tout est feuille.
        contents: [],
        // Un produit sans édition n'appartient à aucune, donc ne ressort
        // d'aucun filtre : mieux vaut ne rien écrire que d'inventer. Même règle
        // pour la faction : une liste vide serait une valeur, et peuplerait le
        // filtre d'une case « aucune ».
        ...(edition || factions.length > 0
          ? {
              attributes: {
                ...(edition ? { [PRODUCT_EDITION_ATTRIBUTE]: edition } : {}),
                ...(factions.length > 0 ? { [FACTION_ATTRIBUTE]: factions } : {}),
              },
            }
          : {}),
        sourceImage: tile.image,
        imagePath: `${BLOB_PREFIX}/${tile.code}.webp`,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return { products, untyped, undated, factionless };
}

async function main() {
  const args = process.argv.slice(2);
  const slug = argValue(args, "--game") ?? "legion";
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const refreshImages = args.includes("--refresh-images");

  const gameId = await resolveGameId(slug);
  console.info(`Jeu « ${slug} » (${gameId}).`);

  console.info("Lecture du catalogue d'atomicmassgames.com...");
  const { products, untyped, undated, factionless } = await buildCatalog();

  const bySetCode = new Map<string, number>();
  for (const product of products) {
    bySetCode.set(product.setCode, (bySetCode.get(product.setCode) ?? 0) + 1);
  }

  console.info(
    `${products.length} produits : ` +
      [...bySetCode].sort().map(([setCode, count]) => `${count} ${setCode}`).join(", ") + "."
  );

  const byEdition = new Map<string, number>();
  for (const product of products) {
    const edition = product.attributes?.[PRODUCT_EDITION_ATTRIBUTE];
    if (typeof edition === "string") {
      byEdition.set(edition, (byEdition.get(edition) ?? 0) + 1);
    }
  }

  console.info(
    `Éditions : ` +
      [...byEdition].sort().map(([edition, count]) => `${count} en « ${edition} »`).join(", ") +
      (undated.length > 0 ? `, ${undated.length} sans édition (${undated.slice(0, 5).join(", ")})` : "") +
      ". Réglez l'édition en cours depuis /admin/products."
  );

  const byFaction = new Map<string, number>();
  for (const product of products) {
    const factions = product.attributes?.[FACTION_ATTRIBUTE];
    for (const faction of Array.isArray(factions) ? factions : []) {
      byFaction.set(faction, (byFaction.get(faction) ?? 0) + 1);
    }
  }

  console.info(
    `Factions : ` +
      ([...byFaction].sort().map(([faction, count]) => `${count} ${faction}`).join(", ") || "aucune") +
      // Un produit peut en porter plusieurs : la somme des lignes ci-dessus
      // dépasse le nombre de produits, et ce n'est pas une erreur de compte.
      (factionless.length > 0
        ? `, ${factionless.length} sans faction (${factionless.slice(0, 5).join(", ")}) — les notices de montage ne classent pas par faction`
        : "") +
      "."
  );

  if (untyped.length > 0) {
    console.info(
      `${untyped.length} produits sans type reconnaissable, importés en « ${FALLBACK_KIND} » : ` +
        `${untyped.slice(0, 10).join(", ")}${untyped.length > 10 ? "…" : ""}.`
    );
  }

  await importProducts({ gameId, products, blobPrefix: BLOB_PREFIX, dryRun, force, refreshImages });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
