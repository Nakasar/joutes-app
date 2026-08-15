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
 * Comme celui de Shatterpoint, l'import n'écrit ni `attributes` ni les champs de
 * saisie manuelle : il est rejouable sans rien détruire. Les index doivent
 * exister avant la première exécution
 * (`npx tsx scripts/create-product-indexes.ts`).
 *
 * Variables d'environnement : `MONGODB_URI`, `BLOB_READ_WRITE_TOKEN`.
 */
import type { ProductKindKey } from "../../../lib/constants/product-kinds.ts";
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

/** Tuiles Legion d'une page, avec un garde-fou si la trame du thème a changé. */
async function fetchLegionTiles(url: string, label: string): Promise<Tile[]> {
  const tiles = parseTiles(await fetchText(url)).filter((tile) => tile.classes.includes(LEGION_CLASS));

  // Sans ce contrôle, un thème remanié ferait un import parfaitement silencieux
  // de zéro produit, et le bilan final annoncerait « 0 créés » sans rien
  // laisser deviner de la cause.
  if (tiles.length === 0) {
    throw new Error(
      `Aucun produit Legion lu sur ${url} : la page a probablement changé de trame. ` +
        `Vérifiez le découpage de parseTiles.`
    );
  }

  console.info(`${label} : ${tiles.length} produits.`);

  return tiles;
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
async function buildCatalog(): Promise<{ products: ImportedProduct[]; untyped: string[] }> {
  const [gallery, assembly] = await Promise.all([
    fetchLegionTiles(GALLERY_URL, "Galerie"),
    fetchLegionTiles(ASSEMBLY_URL, "Notices de montage"),
  ]);

  const tiles = new Map<string, Tile>();
  for (const tile of [...assembly, ...gallery]) {
    tiles.set(tile.code, tile);
  }

  const untyped: string[] = [];

  const products = [...tiles.values()]
    .map((tile) => {
      const kind = kindOf(tile);
      if (!kind) {
        untyped.push(tile.code);
      }

      return {
        id: tile.code,
        name: tile.name,
        kind: kind ?? FALLBACK_KIND,
        setCode: setCodeOf(tile.code),
        // AMG ne publie le contenu d'aucune boîte Legion : tout est feuille.
        contents: [],
        sourceImage: tile.image,
        imagePath: `${BLOB_PREFIX}/${tile.code}.webp`,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return { products, untyped };
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
  const { products, untyped } = await buildCatalog();

  const bySetCode = new Map<string, number>();
  for (const product of products) {
    bySetCode.set(product.setCode, (bySetCode.get(product.setCode) ?? 0) + 1);
  }

  console.info(
    `${products.length} produits : ` +
      [...bySetCode].sort().map(([setCode, count]) => `${count} ${setCode}`).join(", ") + "."
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
