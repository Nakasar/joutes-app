/**
 * Import du catalogue de produits Star Wars: Shatterpoint.
 *
 * Le site communautaire shatterpoint-miniatures.eu publie en accès libre la
 * liste des extensions et leur contenu. Deux appels suffisent à reconstituer un
 * catalogue de produits complet :
 *
 *  - `GET /api/expansions` — les boîtes : code (`s`), nom (`n`), type (`t`) ;
 *  - `GET /api/expansions/SWP028` — le détail d'une boîte, dont `u`, la liste
 *    des unités qu'elle contient, chacune `[slug, nom, id]` ;
 *  - `GET /api/units` — les unités, dont `cn`, le **nombre de figurines** que
 *    l'unité représente. C'est lui qui donne la quantité d'une ligne de
 *    contenu : une unité de soutien vaut deux figurines dans la boîte.
 *
 * Les images ne sont pas dans l'API mais à un emplacement déductible du code de
 * l'extension et du slug de l'unité. Elles sont recopiées sur Vercel Blob :
 * `next.config.ts` n'autorise `next/image` qu'à charger depuis ce domaine, un
 * lien direct vers le site source ne s'afficherait pas.
 *
 * ## L'import est en anglais, volontairement
 *
 * L'API répond en français (`?lang=fr`), mais le catalogue déjà saisi à la main
 * est en anglais et ses identifiants dérivent des noms anglais
 * (`SWP-grand-admiral-thrawn`, `SWP-agent-kallus-inside-man`). Un import en
 * français créerait un second jeu de produits à côté du premier, au lieu de le
 * compléter — et le flux français laisse de toute façon la moitié des noms de
 * boîtes en anglais (« Not Accepting Surrenders », « Real Quiet Like »).
 *
 * `--lang fr` traduit les **noms affichés** si on le souhaite ; les identifiants,
 * eux, restent toujours dérivés de l'anglais. Ils sont figés après création (ils
 * sont référencés par les exemplaires en collection et par le contenu des autres
 * produits), ils ne peuvent pas dépendre de la langue d'un import.
 *
 * ## Identifiants
 *
 * | Produit | Identifiant | Exemple |
 * | --- | --- | --- |
 * | Boîte | le code de l'extension | `SWP028` |
 * | Figurine | `SWP-` + le nom anglais en minuscules | `SWP-grand-admiral-thrawn` |
 *
 * La gamme (`setCode`) vaut `SWP` pour tout le catalogue.
 *
 * ## Usage (depuis la racine du dépôt)
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/games/shatterpoint/import-products.ts [--dry-run] [--force] \
 *     [--lang fr] [--game shatterpoint] [--refresh-images]
 *
 * `--conditions=react-server` est nécessaire parce que `lib/mongodb` importe
 * `server-only`, et le hook résout l'alias `@/` de tsconfig.json hors bundler.
 *
 * - `--dry-run` : affiche le bilan sans rien écrire, ni en base ni sur le Blob ;
 * - `--force` : réécrit aussi les produits modifiés à la main depuis
 *   `/admin/products`, épargnés par défaut ;
 * - `--lang <code>` : langue des noms affichés, `en` par défaut ;
 * - `--game <slug>` : jeu à alimenter, `shatterpoint` par défaut ;
 * - `--refresh-images` : renvoie les images déjà présentes sur le Blob, au lieu
 *   de réutiliser celles qui y sont.
 *
 * Le script est **idempotent** : il n'écrit ni `attributes` ni les champs de
 * saisie manuelle, et une seconde exécution ne renvoie aucune image. Les
 * attributs saisis depuis l'administration (faction, points, mission…) lui
 * survivent donc.
 *
 * Les index doivent exister avant le premier import
 * (`npx tsx scripts/create-product-indexes.ts`), l'unicité de `{gameId, id}`
 * étant ce qui empêche l'import de créer des doublons.
 *
 * Variables d'environnement : `MONGODB_URI`, `BLOB_READ_WRITE_TOKEN`.
 */
import { normalizeContents } from "../../../lib/products/contents.ts";
import type { ProductKindKey } from "../../../lib/constants/product-kinds.ts";
import {
  CONCURRENCY,
  argValue,
  fetchJson,
  importProducts,
  mapWithConcurrency,
  resolveGameId,
  type ImportedProduct,
} from "../product-import.ts";

const API_BASE = "https://shatterpoint-miniatures.eu/api";
const IMAGE_BASE = "https://shatterpoint-miniatures.eu/images/shatterpoint";

/** Gamme unique du jeu : tout Shatterpoint sort sous la référence `SWP`. */
const SET_CODE = "SWP";

/** Préfixe des images recopiées sur le Blob, pour les retrouver et les lister. */
const BLOB_PREFIX = "products/shatterpoint";

/** Extension telle que la liste la renvoie. */
type ApiExpansion = {
  /** Code de l'extension, `SWP028`. */
  s: string;
  n: string;
  /** Type commercial : `Squad Pack`, `Terrain Pack`… */
  t: string;
};

/** Détail d'une extension : `u` liste ses unités, chacune `[slug, nom, id]`. */
type ApiExpansionDetail = ApiExpansion & { u?: [string, string, string][] };

type ApiUnit = {
  /** Slug de l'unité, `grandadmiralthrawn` — la clé de son image. */
  x: string;
  n: string;
  /** Nombre de figurines que l'unité représente : 2 pour une unité de soutien. */
  cn: number;
};

/**
 * Type commercial du site -> `kind` du catalogue.
 *
 * Le `kind` ne pilote aucun comportement : ce qui fait d'un produit un conteneur,
 * c'est son contenu (cf. `lib/constants/product-kinds.ts`). Il n'est ici qu'une
 * facette de filtre, et la table reprend les choix déjà faits à la main sur les
 * boîtes saisies avant cet import.
 */
const KIND_BY_EXPANSION_TYPE: Record<string, ProductKindKey> = {
  "Core Set": "starter",
  "Battle Set": "starter",
  "Squad Pack": "box",
  "Duel Pack": "box",
  "Unit Pack": "box",
  "Character Pack": "box",
  "Mission Pack": "other",
  "Terrain Pack": "accessory",
  "Dice Pack": "accessory",
  "Measuring Tools": "accessory",
};

/** Type inconnu : le produit entre quand même au catalogue, sous « Autre ». */
const FALLBACK_KIND: ProductKindKey = "other";

/**
 * Identifiant d'une figurine : `SWP-` et le nom anglais, accents retirés et
 * ponctuation réduite à des tirets — la forme qu'accepte `productIdSchema`.
 */
function unitId(englishName: string): string {
  const ascii = englishName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return `${SET_CODE}-${ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/**
 * Le site sert ses réponses depuis un CDN et les distingue par un paramètre
 * `version` que sa page pose à la compilation. L'horodatage de l'exécution joue
 * le même rôle : l'import lit toujours le catalogue à jour.
 */
function apiUrl(path: string, lang: string, version: number): string {
  return `${API_BASE}/${path}?lang=${lang}&version=${version}`;
}

/**
 * Le catalogue tel que le site le décrit : les figurines d'abord, les boîtes
 * ensuite, chacune renvoyant aux figurines par leur identifiant.
 */
async function buildCatalog(lang: string, version: number): Promise<{
  products: ImportedProduct[];
  unknownTypes: Map<string, string[]>;
}> {
  // L'anglais est lu dans tous les cas : les identifiants en dérivent, et la
  // table des `kind` est indexée sur les types anglais.
  const [englishUnits, englishExpansions] = await Promise.all([
    fetchJson<ApiUnit[]>(apiUrl("units", "en", version)),
    fetchJson<ApiExpansion[]>(apiUrl("expansions", "en", version)),
  ]);

  const [translatedUnits, translatedExpansions] = lang === "en"
    ? [englishUnits, englishExpansions]
    : await Promise.all([
        fetchJson<ApiUnit[]>(apiUrl("units", lang, version)),
        fetchJson<ApiExpansion[]>(apiUrl("expansions", lang, version)),
      ]);

  const displayUnitNames = new Map(translatedUnits.map((unit) => [unit.x, unit.n]));
  const displayExpansionNames = new Map(translatedExpansions.map((expansion) => [expansion.s, expansion.n]));

  const units = new Map(
    englishUnits.map((unit) => [
      unit.x,
      {
        id: unitId(unit.n),
        name: displayUnitNames.get(unit.x) ?? unit.n,
        // Une unité de soutien tient sur une carte mais compte deux figurines
        // dans la boîte ; c'est ce nombre-là qui fait la quantité du contenu.
        copies: Math.max(1, unit.cn),
      },
    ])
  );

  const unitProducts: ImportedProduct[] = [...units].map(([slug, unit]) => ({
    id: unit.id,
    name: unit.name,
    kind: "unit",
    setCode: SET_CODE,
    contents: [],
    sourceImage: `${IMAGE_BASE}/units/art/${slug}.webp`,
    imagePath: `${BLOB_PREFIX}/units/${slug}.webp`,
  }));

  // Le contenu n'est pas dans la liste des extensions : il faut le détail de
  // chacune.
  const details = await mapWithConcurrency(englishExpansions, CONCURRENCY, (expansion) =>
    fetchJson<ApiExpansionDetail>(apiUrl(`expansions/${expansion.s}`, "en", version))
  );

  const unknownTypes = new Map<string, string[]>();

  const boxProducts: ImportedProduct[] = details.map((detail) => {
    const kind = KIND_BY_EXPANSION_TYPE[detail.t];
    if (!kind) {
      unknownTypes.set(detail.t, [...(unknownTypes.get(detail.t) ?? []), detail.s]);
    }

    // Une unité absente de `/api/units` n'a ni identifiant ni quantité fiables :
    // la citer produirait une ligne de contenu pointant dans le vide.
    const contents = (detail.u ?? []).flatMap((entry) => {
      const unit = units.get(entry[0]);
      return unit ? [{ productId: unit.id, quantity: unit.copies }] : [];
    });

    return {
      id: detail.s,
      name: displayExpansionNames.get(detail.s) ?? detail.n,
      kind: kind ?? FALLBACK_KIND,
      setCode: SET_CODE,
      contents: normalizeContents(contents),
      sourceImage: `${IMAGE_BASE}/expansions/${detail.s}.webp`,
      imagePath: `${BLOB_PREFIX}/expansions/${detail.s}.webp`,
    };
  });

  const products = [...unitProducts, ...boxProducts];

  return { products, unknownTypes };
}

async function main() {
  const args = process.argv.slice(2);
  const slug = argValue(args, "--game") ?? "shatterpoint";
  const lang = argValue(args, "--lang") ?? "en";
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const refreshImages = args.includes("--refresh-images");

  const gameId = await resolveGameId(slug);
  console.info(`Jeu « ${slug} » (${gameId}).`);

  console.info("Lecture du catalogue de shatterpoint-miniatures.eu...");
  const { products, unknownTypes } = await buildCatalog(lang, Date.now());

  const boxes = products.filter((product) => product.contents.length > 0);
  const leaves = products.length - boxes.length;
  console.info(
    `${products.length} produits : ${boxes.length} avec un contenu, ${leaves} sans ` +
      `(figurines, terrains, accessoires).`
  );

  for (const [type, codes] of unknownTypes) {
    console.warn(
      `Type d'extension inconnu « ${type} » (${codes.join(", ")}) : importé en « ${FALLBACK_KIND} ». ` +
        `Ajoutez-le à KIND_BY_EXPANSION_TYPE.`
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
