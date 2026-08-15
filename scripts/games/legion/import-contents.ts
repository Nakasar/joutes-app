/**
 * Contenu des boîtes Star Wars: Legion — les figurines qu'elles renferment.
 *
 * L'import du catalogue (`import-products.ts`) écrit 152 **feuilles** : des
 * boîtes sans contenu, faute d'une source qui dise ce qu'il y a dedans. Ce
 * script comble ce manque, avec ce qui existe et en disant ce qui manque.
 *
 * ## Deux sources, et ce que chacune donne
 *
 * | Source | Ce qu'elle publie | Portée mesurée |
 * | --- | --- | --- |
 * | La fiche produit d'AMG (« WHAT'S INCLUDED ») | un **nombre** de figurines, jamais lesquelles | 25 des 64 produits encore au catalogue |
 * | Le wiki Fandom (`Included Components / Miniatures`) | une **liste** quantifiée (« 7 Rebel Trooper miniatures ») | 75 pages, l'ère FFG surtout |
 *
 * Aucune ne suffit : AMG est l'éditeur mais ne détaille rien, le wiki détaille
 * mais ne couvre pas les sorties récentes et n'imprime aucune référence produit.
 * Leur réunion couvre un peu plus d'un tiers du catalogue — et c'est justement
 * pourquoi le bilan compte ce qu'il n'a pas su faire.
 *
 * ## Qui l'emporte, et pourquoi
 *
 * L'éditeur a raison sur les nombres, le wiki sur les noms :
 *
 *  1. **liste et compte s'accordent** → la liste du wiki, telle quelle ;
 *  2. **une seule sorte de figurine, mais un compte différent** → la liste est
 *     recalée sur le compte d'AMG. C'est le cas des rééditions : le wiki décrit
 *     la boîte FFG de 7 Rebel Troopers, AMG en met 11 dans la sienne ;
 *  3. **plusieurs sortes et un compte différent** → on ne sait pas répartir
 *     l'écart, donc une figurine générique en `n` exemplaires, et le désaccord
 *     est signalé ;
 *  4. **compte seul** → une figurine générique, nommée d'après la boîte ;
 *  5. **liste seule** → la liste, aucun compte ne venant la contredire.
 *
 * ## Une feuille par boîte, jamais partagée
 *
 * « Range Troopers » existe en `SWL117` et en `SWQ89` : deux sculpts, deux
 * comptes, deux éditions. Une figurine partagée ferait dépendre la complétion
 * d'une édition des boîtes de l'autre, et le jour où l'une est corrigée l'autre
 * changerait sans qu'on l'ait demandé. Chaque figurine est donc propre à sa
 * boîte, et son identifiant en dérive : `SWQ15-rebel-trooper`.
 *
 * Elle hérite de l'édition et des factions de sa boîte — ce sont les siennes —
 * et n'a pas d'image : celle de la boîte montrerait la boîte.
 *
 * ## Ce que le script ne fait pas
 *
 * Il ne devine pas. Une boîte qu'aucune source ne décrit reste une feuille, et
 * le bilan la nomme : c'est à `/admin/products` de trancher, et une saisie
 * manuelle survit aux exécutions suivantes (`manuallyEditedAt`, comme partout).
 *
 * Le wiki est une source **communautaire**, sous licence CC BY-SA : ce qu'il
 * fournit est une proposition à relire, d'où le `--dry-run` qui montre boîte par
 * boîte ce qui serait écrit et d'où ça vient.
 *
 * ## Usage (depuis la racine du dépôt)
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/games/legion/import-contents.ts [--dry-run] [--force] [--game legion]
 *
 * - `--dry-run` : affiche le tableau des décisions sans rien écrire ;
 * - `--force` : traite aussi les boîtes retouchées à la main, épargnées par défaut ;
 * - `--game <slug>` : jeu à alimenter, `legion` par défaut.
 *
 * Variable d'environnement : `MONGODB_URI`.
 */
import db from "../../../lib/mongodb.ts";
import { MAX_PRODUCT_CONTENTS } from "../../../lib/schemas/product.schema.ts";
import type { ProductContent } from "../../../lib/types/product.ts";
import type { ProductKindKey } from "../../../lib/constants/product-kinds.ts";
import { argValue, fetchText, resolveGameId, CONCURRENCY } from "../product-import.ts";

const GALLERY_URL = "https://www.atomicmassgames.com/legion-gallery/";
const WIKI_API = "https://starwarslegion.fandom.com/api.php";

/** Catégories du wiki qui rassemblent les boîtes. */
const WIKI_CATEGORIES = ["Expansion Packs", "Core Set"];

/** Les types de produits qui contiennent des figurines. Un dé n'en contient pas. */
const KINDS_WITH_MINIS: ProductKindKey[] = ["box", "starter", "bundle"];

/** Titre de la source d'une ligne de contenu, pour le bilan. */
type Origin = "wiki" | "wiki+amg" | "amg";

type Mini = { name: string; quantity: number };

type Resolution = {
  code: string;
  boxName: string;
  minis: Mini[];
  origin: Origin;
  /** Désaccord entre la liste du wiki et le compte d'AMG, à signaler. */
  conflict?: string;
};

// --- Lecture d'AMG -----------------------------------------------------------

/** Les fiches produit de la galerie, par référence. */
function parseGalleryLinks(html: string): Map<string, string> {
  const links = new Map<string, string>();

  for (const chunk of html.split(/class="[^"]*\ball mix\s+/).slice(1)) {
    const code = /<span\s+class="product-code"\s*>([^<]*)</.exec(chunk);
    const href = /href="(https:\/\/www\.atomicmassgames\.com\/character\/[^"]+)"/.exec(chunk);
    if (code && href) {
      links.set(code[1].trim().toUpperCase(), href[1]);
    }
  }

  return links;
}

/**
 * Le nombre de figurines annoncé par une fiche produit.
 *
 * AMG écrit « 11 Miniatures, 11 Bases, 1 Unit Card » sous un intertitre
 * « WHAT'S INCLUDED ». Seule la première ligne nous intéresse : les socles
 * suivent les figurines, et les cartes ne se collectionnent pas ici.
 */
function parseMiniatureCount(html: string): number | undefined {
  const text = html.replace(/<[^>]+>/g, "\n").replace(/&#8217;|&#039;/g, "'");
  const section = /WHAT'?S\s+INCLUDED([\s\S]{0,600})/i.exec(text);
  if (!section) {
    return undefined;
  }

  const count = /(\d+)\s*Miniature/i.exec(section[1]);
  return count ? Number(count[1]) : undefined;
}

/** Les comptes d'AMG, une requête par fiche, six à la fois. */
async function fetchAmgCounts(): Promise<Map<string, number>> {
  const links = parseGalleryLinks(await fetchText(GALLERY_URL));
  const entries = [...links.entries()];
  const counts = new Map<string, number>();

  for (let start = 0; start < entries.length; start += CONCURRENCY) {
    await Promise.all(
      entries.slice(start, start + CONCURRENCY).map(async ([code, url]) => {
        try {
          const count = parseMiniatureCount(await fetchText(url));
          if (count !== undefined && count > 0) {
            counts.set(code, count);
          }
        } catch {
          // Une fiche illisible n'arrête pas l'import : elle prive seulement sa
          // boîte d'un compte, ce que le bilan dira.
        }
      })
    );
  }

  console.info(`AMG : ${counts.size} fiches sur ${entries.length} annoncent un nombre de figurines.`);
  return counts;
}

// --- Lecture du wiki ---------------------------------------------------------

async function wikiApi<T>(params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ ...params, format: "json" });
  return JSON.parse(await fetchText(`${WIKI_API}?${query}`)) as T;
}

/** Les titres des pages de boîtes, catégorie par catégorie. */
async function fetchWikiTitles(): Promise<string[]> {
  const titles = new Set<string>();

  for (const category of WIKI_CATEGORIES) {
    const data = await wikiApi<{ query: { categorymembers: { title: string }[] } }>({
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmlimit: "500",
    });

    for (const member of data.query.categorymembers) {
      titles.add(member.title);
    }
  }

  return [...titles];
}

const MINIS_SECTION = /===\s*Miniatures?\s*===([\s\S]*?)(?=\n\s*===|\n\s*==[^=]|$)/i;
/**
 * Les puces de premier niveau : les sous-puces détaillent des options de grappe.
 *
 * La négation est en **anticipation** et ne consomme donc rien : `*4 clone
 * trooper minis` s'écrit sans espace après la puce, et un `[^*]` emporterait le
 * chiffre avec lui — la ligne perdrait sa quantité et serait rejetée.
 */
const TOP_LEVEL_BULLET = /^\*(?!\*)\s*(.+?)\s*$/gm;
/** « 7 Rebel Trooper miniatures » -> 7 et « Rebel Trooper ». */
const QUANTIFIED_LINE = /^(\d+)\s+(.*?)\s*(?:miniatures?|minis?)?\s*(?:\(.*\))?$/i;

/** Un titre de page, une liste de figurines quantifiées. */
function parseMiniatures(wikitext: string): Mini[] {
  const section = MINIS_SECTION.exec(wikitext);
  if (!section) {
    return [];
  }

  const minis: Mini[] = [];
  for (const [, raw] of section[1].matchAll(TOP_LEVEL_BULLET)) {
    const line = raw
      .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
      .replace(/'{2,}|<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const parsed = QUANTIFIED_LINE.exec(line);
    // Une ligne sans quantité décrit une option de grappe — « multiple helmet
    // options », « options for weapons, TBD » — et non une figurine de plus.
    if (parsed && parsed[2]) {
      // Le wiki écrit « 4 clone trooper miniatures » aussi bien que « 7 Rebel
      // Trooper miniatures » : la casse de la première lettre est rétablie, le
      // nom finissant sur une tuile de catalogue.
      const name = parsed[2].trim();
      minis.push({ quantity: Number(parsed[1]), name: name.charAt(0).toUpperCase() + name.slice(1) });
    }
  }

  return minis;
}

/** Les listes de figurines du wiki, par titre de page. */
async function fetchWikiMinis(): Promise<Map<string, Mini[]>> {
  const titles = await fetchWikiTitles();
  const pages = new Map<string, Mini[]>();

  for (let start = 0; start < titles.length; start += 40) {
    const data = await wikiApi<{
      query: { pages: Record<string, { title: string; revisions?: { slots: { main: { "*": string } } }[] }> };
    }>({
      action: "query",
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      titles: titles.slice(start, start + 40).join("|"),
    });

    for (const page of Object.values(data.query.pages)) {
      const wikitext = page.revisions?.[0]?.slots.main["*"];
      const minis = wikitext ? parseMiniatures(wikitext) : [];
      if (minis.length > 0) {
        pages.set(page.title, minis);
      }
    }
  }

  console.info(`Wiki : ${pages.size} pages sur ${titles.length} listent des figurines.`);
  return pages;
}

// --- Rapprochement des deux catalogues ---------------------------------------

/**
 * Le nom réduit à ce qui identifie le produit.
 *
 * AMG nomme ses boîtes « Rebel Troopers » quand le wiki les intitule « Rebel
 * Troopers Unit Expansion » : la mention commerciale tombe des deux côtés. Un
 * « The » de tête tombe aussi — le wiki écrit « The Bad Batch » là où la boîte
 * dit « Bad Batch ».
 */
function matchKey(name: string): string {
  let key = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the\s+/, "");

  const suffix =
    /\s*(unit|upgrade|commander|operative|personnel|squadron|squad|terrain|dice|card|paint|battle force)?\s*(expansion|pack|set)$/;
  let previous = "";
  while (previous !== key) {
    previous = key;
    key = key.replace(suffix, "").trim();
  }

  return key;
}

/**
 * La page du wiki qui décrit une boîte, s'il y en a une seule qui convienne.
 *
 * Plusieurs pages partagent parfois la même clé — une unité a sa boîte et son
 * « Upgrade Expansion ». AMG ne vend aucune boîte d'améliorations sous ce nom :
 * l'« Unit Expansion » l'emporte, et à défaut on ne choisit pas.
 */
function findWikiPage(name: string, index: Map<string, string[]>): string | undefined {
  const candidates = index.get(matchKey(name)) ?? [];
  if (candidates.length <= 1) {
    return candidates[0];
  }

  const unit = candidates.filter((title) => /unit expansion$/i.test(title));
  return unit.length === 1 ? unit[0] : undefined;
}

/**
 * Ce qu'il faut écrire dans une boîte, des deux sources et de leur désaccord.
 * `undefined` quand aucune ne la décrit : elle reste alors une feuille.
 */
function resolveContents(
  box: { id: string; name: string },
  wikiMinis: Mini[] | undefined,
  amgCount: number | undefined
): Resolution | undefined {
  const generic = (quantity: number): Mini[] => [{ name: `${box.name} (miniature)`, quantity }];
  const total = wikiMinis?.reduce((sum, mini) => sum + mini.quantity, 0);

  if (wikiMinis && amgCount !== undefined && total !== amgCount) {
    // Une seule sorte de figurine : l'écart se répartit sans ambiguïté.
    if (wikiMinis.length === 1) {
      return {
        code: box.id,
        boxName: box.name,
        minis: [{ name: wikiMinis[0].name, quantity: amgCount }],
        origin: "wiki+amg",
        conflict: `le wiki en compte ${total}, AMG ${amgCount}`,
      };
    }

    return {
      code: box.id,
      boxName: box.name,
      minis: generic(amgCount),
      origin: "amg",
      conflict: `le wiki détaille ${wikiMinis.length} sortes pour ${total} figurines, AMG en annonce ${amgCount}`,
    };
  }

  if (wikiMinis) {
    return { code: box.id, boxName: box.name, minis: wikiMinis, origin: amgCount === undefined ? "wiki" : "wiki+amg" };
  }

  if (amgCount !== undefined) {
    return { code: box.id, boxName: box.name, minis: generic(amgCount), origin: "amg" };
  }

  return undefined;
}

/** `Rebel Trooper` -> `rebel-trooper`, borné à ce qu'accepte `productIdSchema`. */
function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Longueur maximale d'un identifiant de produit, celle de `productIdSchema`. */
const MAX_PRODUCT_ID = 64;

/** Identifiants des figurines d'une boîte, uniques au sein de celle-ci. */
function miniIds(box: string, minis: Mini[]): string[] {
  const used = new Set<string>();

  return minis.map((mini) => {
    const base = `${box}-${slug(mini.name) || "miniature"}`;
    let id = base.slice(0, MAX_PRODUCT_ID);

    // Deux lignes qui se réduisent au même identifiant — des variantes que le
    // slug ne distingue plus — se départagent par leur rang. C'est **le début**
    // qui est rogné pour faire de la place au rang, et non la fin : tronquer
    // après coup rendrait `…-2` et `…-3` identiques dès que la base touche la
    // limite, et la boucle ne trouverait plus jamais d'identifiant libre.
    for (let rank = 2; used.has(id); rank += 1) {
      const suffix = `-${rank}`;
      id = `${base.slice(0, MAX_PRODUCT_ID - suffix.length)}${suffix}`;
    }

    used.add(id);
    return id;
  });
}

// --- Écriture ----------------------------------------------------------------

type BoxDoc = {
  id: string;
  name: string;
  kind: ProductKindKey;
  setCode?: string;
  attributes?: Record<string, unknown>;
  contents?: ProductContent[];
  manuallyEditedAt?: Date;
};

async function main() {
  const args = process.argv.slice(2);
  const slugArg = argValue(args, "--game") ?? "legion";
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");

  const gameId = await resolveGameId(slugArg);
  console.info(`Jeu « ${slugArg} » (${gameId}).`);

  const boxes = (await db
    .collection("products")
    .find(
      { gameId, kind: { $in: KINDS_WITH_MINIS } },
      { projection: { _id: 0, id: 1, name: 1, kind: 1, setCode: 1, attributes: 1, contents: 1, manuallyEditedAt: 1 } }
    )
    .sort({ id: 1 })
    .toArray()) as unknown as BoxDoc[];

  console.info(`${boxes.length} boîtes au catalogue (${KINDS_WITH_MINIS.join(", ")}).`);

  const [amgCounts, wikiPages] = await Promise.all([fetchAmgCounts(), fetchWikiMinis()]);

  const wikiIndex = new Map<string, string[]>();
  for (const title of wikiPages.keys()) {
    const key = matchKey(title);
    wikiIndex.set(key, [...(wikiIndex.get(key) ?? []), title]);
  }

  const protectedBoxes: string[] = [];
  const resolutions: Resolution[] = [];
  const undescribed: string[] = [];

  for (const box of boxes) {
    if (box.manuallyEditedAt && !force) {
      protectedBoxes.push(box.id);
      continue;
    }

    const page = findWikiPage(box.name, wikiIndex);
    const resolution = resolveContents(box, page ? wikiPages.get(page) : undefined, amgCounts.get(box.id));

    if (!resolution) {
      undescribed.push(box.id);
      continue;
    }

    // Le plafond de lignes est celui du formulaire : au-delà, le contenu ne
    // serait plus modifiable depuis l'administration.
    if (resolution.minis.length > MAX_PRODUCT_CONTENTS) {
      resolution.minis = resolution.minis.slice(0, MAX_PRODUCT_CONTENTS);
      resolution.conflict = `${resolution.conflict ? `${resolution.conflict} ; ` : ""}liste tronquée à ${MAX_PRODUCT_CONTENTS} lignes`;
    }

    resolutions.push(resolution);
  }

  const byOrigin = new Map<Origin, number>();
  for (const resolution of resolutions) {
    byOrigin.set(resolution.origin, (byOrigin.get(resolution.origin) ?? 0) + 1);
  }

  console.info(
    `\n${resolutions.length} boîtes décrites : ` +
      [...byOrigin].map(([origin, count]) => `${count} par ${origin}`).join(", ") +
      `. ${undescribed.length} qu'aucune source ne décrit, laissées en feuilles.`
  );

  if (protectedBoxes.length > 0) {
    console.info(
      `${protectedBoxes.length} boîtes modifiées à la main sont épargnées ` +
        `(${protectedBoxes.slice(0, 10).join(", ")}${protectedBoxes.length > 10 ? "…" : ""}). ` +
        `Ajoutez --force pour les réécrire.`
    );
  }

  const conflicts = resolutions.filter((resolution) => resolution.conflict);
  if (conflicts.length > 0) {
    console.info(`\n${conflicts.length} désaccords entre les sources :`);
    for (const resolution of conflicts) {
      console.info(`  ${resolution.code} ${resolution.boxName} — ${resolution.conflict}`);
    }
  }

  if (undescribed.length > 0) {
    console.info(
      `\nSans contenu : ${undescribed.slice(0, 20).join(", ")}${undescribed.length > 20 ? "…" : ""}. ` +
        `À saisir depuis /admin/products, où la saisie survivra aux exécutions suivantes.`
    );
  }

  const boxById = new Map(boxes.map((box) => [box.id, box]));
  const leaves: BoxDoc[] = [];
  const contentsByBox = new Map<string, ProductContent[]>();

  for (const resolution of resolutions) {
    const box = boxById.get(resolution.code);
    if (!box) continue;

    const ids = miniIds(resolution.code, resolution.minis);
    contentsByBox.set(
      resolution.code,
      resolution.minis.map((mini, index) => ({
        productId: ids[index],
        quantity: Math.min(99, Math.max(1, mini.quantity)),
      }))
    );

    resolution.minis.forEach((mini, index) => {
      leaves.push({
        id: ids[index],
        name: mini.name,
        kind: "unit",
        setCode: box.setCode,
        // L'édition et les factions sont celles de la boîte : une figurine ne
        // change ni de camp ni de version du jeu en sortant de son carton.
        attributes: box.attributes,
      });
    });
  }

  console.info(`\n${leaves.length} figurines pour ${contentsByBox.size} boîtes.`);

  if (dryRun) {
    console.info("\n--dry-run : rien n'a été écrit. Détail des dix premières boîtes :");
    for (const resolution of resolutions.slice(0, 10)) {
      const lines = resolution.minis.map((mini) => `${mini.quantity}× ${mini.name}`).join(", ");
      console.info(`  ${resolution.code} ${resolution.boxName} [${resolution.origin}] : ${lines}`);
    }
    return;
  }

  const operations = [
    ...leaves.map((leaf) => ({
      updateOne: {
        filter: { gameId, id: leaf.id },
        update: {
          $set: {
            name: leaf.name,
            kind: leaf.kind,
            ...(leaf.setCode ? { setCode: leaf.setCode } : {}),
            // Écrits par chemin, comme partout : un attribut saisi à la main
            // sur une figurine déjà créée n'est pas effacé par une seconde
            // exécution.
            ...Object.fromEntries(
              Object.entries(leaf.attributes ?? {}).map(([key, value]) => [`attributes.${key}`, value])
            ),
          },
          $setOnInsert: { gameId, id: leaf.id, source: "import", createdAt: new Date() },
        },
        upsert: true,
      },
    })),
    ...[...contentsByBox].map(([id, contents]) => ({
      updateOne: {
        filter: { gameId, id },
        update: { $set: { contents } },
      },
    })),
  ];

  // Les figurines sont écrites avant les contenus qui les citent : l'inverse
  // laisserait, le temps d'un incident, des boîtes pointant vers des références
  // absentes du catalogue — ce que l'écran de contenu affiche en trou.
  const result = await db.collection("products").bulkWrite(operations, { ordered: true });

  console.info(
    `\n${result.upsertedCount} figurines créées, ${result.modifiedCount} documents mis à jour.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
