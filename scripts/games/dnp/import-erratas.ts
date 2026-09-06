/**
 * Import des clarifications de Donjon & Procrastination, depuis le compendium
 * que l'éditeur publie sur https://donjonprocrastination.com/contenu-telechargeable
 * sous le nom « Explications de cas particuliers ».
 *
 * Usage (depuis la racine du dépôt) :
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/games/dnp/import-erratas.ts [--dry-run]
 *
 * `--conditions=react-server` est nécessaire parce que `lib/mongodb` importe
 * `server-only`, et le hook résout l'alias `@/` de tsconfig.json hors bundler.
 *
 * - sans option : lit le compendium et écrit les clarifications manquantes ;
 * - `--dry-run` : dit ce qu'il écrirait, sans rien écrire.
 *
 * Variables d'environnement : `MONGODB_URI`, `DNP_ERRATA_AUTHOR` (voir plus
 * bas), et `DNP_GAME_SLUG` si le jeu n'a pas le slug `dnp`.
 *
 * Les cartes doivent avoir été importées d'abord (`import-cards.ts`) : une
 * clarification ne s'attache qu'à des cartes existantes.
 *
 * ## Une entrée du compendium, une clarification
 *
 * Le compendium consacre une page à chaque carte qui en demande une : son
 * effet, puis ce que l'éditeur en précise, en un ou plusieurs paragraphes. Une
 * page devient donc **une** clarification portant tous ses paragraphes, et non
 * une par paragraphe : ils se lisent ensemble, et les découper les ferait voter
 * séparément.
 *
 * ## Retrouver la carte, que le compendium ne nomme qu'à moitié
 *
 * Il donne le nom de la carte, jamais son extension ni son numéro. Le
 * rapprochement se fait donc sur le nom, et vise **toutes** les cartes qui le
 * portent — c'est ce que permet `cardIds` : la version promo d'une carte de la
 * série 4 en partage le nom et l'effet, donc la clarification.
 *
 * L'entrée « Esbroufe » est le cas limite : aucune carte ne s'appelle
 * exactement ainsi, chaque extension nommant la sienne (« Esbroufe - Bûche »,
 * « Esbroufe - Gloup gloup »…). À défaut de nom exact, les cartes dont le nom
 * commence par celui de l'entrée sont donc retenues — les huit Esbroufe du jeu
 * ici —, et le repli est annoncé dans le journal : c'est le seul rapprochement
 * que le compendium ne dicte pas mot pour mot.
 *
 * ## Écrire deux fois la même chose n'ajoute rien
 *
 * Le script est fait pour tourner à chaque publication d'un compendium, et une
 * clarification déjà écrite ne doit pas l'être une seconde fois. Les
 * clarifications déjà issues du compendium se reconnaissent à leur source, et
 * la carte — ou l'ensemble de cartes — qu'elles visent les identifie :
 *
 * - même ensemble de cartes, même texte : rien à faire ;
 * - même ensemble de cartes, texte différent : l'éditeur a récrit son
 *   explication, la clarification est mise à jour (et `contentUpdatedAt` avec,
 *   ce qui signale ses traductions comme dépassées) ;
 * - ensemble de cartes inconnu : la clarification est créée.
 *
 * Rien n'est jamais supprimé : une entrée retirée du compendium laisse sa
 * clarification en place, seulement signalée en fin d'import. Elle reste vraie
 * de la carte, et sa suppression est une décision d'humain — d'autant qu'elle
 * emporterait les votes et les traductions qu'elle a reçus.
 *
 * Seules les clarifications dont la source est exactement celle du compendium
 * sont relues et modifiées : celles qu'un joueur a écrites ne sont jamais
 * touchées, quand bien même elles viseraient la même carte.
 *
 * ## L'auteur est un compte, pas le script
 *
 * Un errata appartient à qui le propose — la fiche de carte affiche son auteur,
 * et les votes s'y rapportent. Le script n'invente donc pas d'auteur : il exige
 * `DNP_ERRATA_AUTHOR`, l'identifiant ou l'adresse électronique du compte au nom
 * duquel les clarifications sont écrites, et refuse de travailler sans.
 */
import { ObjectId } from "mongodb";
import db from "../../../lib/mongodb.ts";
import { MAX_ERRATA_CARDS } from "../../../lib/constants/errata.ts";
import { slugSegment } from "../../../lib/constants/card-ids.ts";
import type { ErrataDb } from "../../../lib/types/errata.ts";
import { clarificationDetails, readCompendium, type CompendiumEntry } from "./compendium.ts";
import { fetchBytes, fetchPage, pdfLinks, SITE } from "./source.ts";

const DOWNLOADS_PAGE = `${SITE}/contenu-telechargeable`;

/**
 * La source inscrite sur chaque clarification : la page qui publie le
 * compendium, et non le PDF lui-même — son adresse change à chaque édition,
 * quand la page, elle, sert toujours la dernière.
 */
const SOURCE = DOWNLOADS_PAGE;

/** Convention d'identifiant du jeu, indépendante du slug qu'il porte en base. */
const GAME = "dnp";

/** Slug du jeu en base. Surchargeable si le jeu a été créé sous un autre slug. */
const GAME_SLUG = process.env.DNP_GAME_SLUG ?? GAME;

/** Le compendium n'est publié qu'en français. */
const LANGUAGE = "fr";

/** Le compendium se reconnaît à son nom de fichier parmi les PDF de la page. */
const COMPENDIUM_FILE = /compendium/i;

// --- Ce que la base sait déjà -------------------------------------------

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
 * Le compte au nom duquel les clarifications sont écrites, désigné par son
 * identifiant ou son adresse électronique.
 */
async function resolveAuthorId(): Promise<string> {
  const author = process.env.DNP_ERRATA_AUTHOR?.trim();

  if (!author) {
    throw new Error(
      "DNP_ERRATA_AUTHOR manque : donnez l'identifiant ou l'adresse électronique du compte qui propose ces clarifications."
    );
  }

  const filter = ObjectId.isValid(author) ? { _id: new ObjectId(author) } : { email: author };
  const user = await db.collection("user").findOne(filter, { projection: { _id: 1 } });

  if (!user) {
    throw new Error(`Aucun compte ne correspond à DNP_ERRATA_AUTHOR (« ${author} »).`);
  }

  return user._id.toString();
}

/** Les cartes du jeu, par nom réduit à sa forme comparable. */
async function readCardsByName(gameId: ObjectId): Promise<Map<string, string[]>> {
  const cards = await db
    .collection<{ id: string; name: string }>("cards")
    .find({ gameId }, { projection: { _id: 0, id: 1, name: 1 } })
    .toArray();

  const byName = new Map<string, string[]>();

  for (const card of cards) {
    if (typeof card.id !== "string" || typeof card.name !== "string") {
      continue;
    }
    const key = nameKey(card.name);
    byName.set(key, [...(byName.get(key) ?? []), card.id]);
  }

  return byName;
}

/**
 * Nom réduit à ce qu'une comparaison peut tenir pour identique : le compendium
 * écrit « Roi-Tatouille » là où la carte porte « Roi-Tatouille », mais aussi
 * « MultiCrabe » pour « MultiCrabe » et « Glyphe Antique » pour « Glyphe
 * Antique » — la casse, les accents et la ponctuation ne départagent rien.
 */
function nameKey(name: string): string {
  return slugSegment(name, name.length);
}

/** Les clarifications déjà tirées du compendium, par ensemble de cartes visé. */
async function readImportedClarifications(): Promise<Map<string, { id: ObjectId; details: string }>> {
  const erratas = await db
    .collection<ErrataDb>("erratas")
    .find({ type: "clarification", source: SOURCE }, { projection: { cardIds: 1, details: 1 } })
    .toArray();

  return new Map(
    erratas.map((errata) => [cardsKey(errata.cardIds ?? []), { id: errata._id, details: errata.details }])
  );
}

/** Un ensemble de cartes, sous une forme qui ne dépend pas de leur ordre. */
function cardsKey(cardIds: string[]): string {
  return [...cardIds].sort().join("|");
}

// --- Rapprochement -------------------------------------------------------

/**
 * Les cartes que vise une entrée : celles qui portent exactement ce nom, ou à
 * défaut celles dont le nom commence par lui (« Esbroufe »).
 */
function cardsOf(entry: CompendiumEntry, byName: Map<string, string[]>): string[] {
  const key = nameKey(entry.name);
  const exact = byName.get(key);

  if (exact) {
    return exact;
  }

  const prefixed = [...byName]
    .filter(([candidate]) => candidate.startsWith(`${key}-`))
    .flatMap(([, ids]) => ids);

  if (prefixed.length > 0) {
    console.info(
      `« ${entry.name} » (page ${entry.page}) : aucune carte ne porte ce nom exactement, les ${prefixed.length} qui le commencent sont retenues.`
    );
  }

  return prefixed;
}

// --- Écriture ------------------------------------------------------------

type Outcome = "créée" | "mise à jour" | "inchangée" | "sans carte" | "trop de cartes";

async function importEntry(
  entry: CompendiumEntry,
  {
    byName,
    existing,
    createdBy,
    errataDate,
    dryRun,
  }: {
    byName: Map<string, string[]>;
    existing: Map<string, { id: ObjectId; details: string }>;
    createdBy: string;
    errataDate: Date;
    dryRun: boolean;
  }
): Promise<{ outcome: Outcome; cardIds: string[] }> {
  const cardIds = cardsOf(entry, byName);

  if (cardIds.length === 0) {
    console.warn(`« ${entry.name} » (page ${entry.page}) : aucune carte de ce nom, l'entrée est écartée.`);
    return { outcome: "sans carte", cardIds };
  }

  // La limite est celle de l'application : au-delà, la clarification serait
  // refusée à la première modification depuis l'administration.
  if (cardIds.length > MAX_ERRATA_CARDS) {
    console.warn(
      `« ${entry.name} » (page ${entry.page}) : ${cardIds.length} cartes de ce nom, plus que les ${MAX_ERRATA_CARDS} autorisées.`
    );
    return { outcome: "trop de cartes", cardIds: [] };
  }

  const details = clarificationDetails(entry);
  const known = existing.get(cardsKey(cardIds));

  if (known?.details === details) {
    return { outcome: "inchangée", cardIds };
  }

  if (known) {
    if (!dryRun) {
      await db.collection<ErrataDb>("erratas").updateOne(
        { _id: known.id },
        // `contentUpdatedAt` avec le texte : c'est lui qui signale aux
        // traductions qu'elles ne disent plus ce que dit l'original.
        { $set: { details, contentUpdatedAt: new Date(), errataDate } }
      );
    }
    console.info(`« ${entry.name} » : clarification mise à jour (${cardIds.join(", ")}).`);
    return { outcome: "mise à jour", cardIds };
  }

  if (!dryRun) {
    const now = new Date();
    const errata: ErrataDb = {
      cardIds,
      type: "clarification",
      details,
      originalLang: LANGUAGE,
      contentUpdatedAt: now,
      source: SOURCE,
      errataDate,
      createdBy: new ObjectId(createdBy),
      createdAt: now,
    };

    await db.collection<ErrataDb>("erratas").insertOne(errata);
  }
  console.info(`« ${entry.name} » : clarification créée (${cardIds.join(", ")}).`);
  return { outcome: "créée", cardIds };
}

// --- Entrée --------------------------------------------------------------

async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");

  const pdf = pdfLinks(await fetchPage(DOWNLOADS_PAGE)).find((link) =>
    COMPENDIUM_FILE.test(link.split("/").pop() ?? "")
  );

  if (!pdf) {
    throw new Error(`Aucun compendium sur ${DOWNLOADS_PAGE} : la page a changé de forme.`);
  }

  const { entries, publishedAt } = await readCompendium(await fetchBytes(pdf));

  // Avant d'écrire quoi que ce soit : un document dont la mise en page aurait
  // changé se lirait sans erreur et ne rendrait rien.
  if (entries.length === 0) {
    throw new Error(`Aucune entrée lue dans ${pdf} : rien n'est écrit.`);
  }

  if (!publishedAt) {
    console.warn(`${pdf} ne porte pas de date de publication : la date du jour est retenue.`);
  }

  console.info(
    `${entries.length} entrées lues dans ${pdf.split("/").pop()}` +
      `${publishedAt ? ` (publié le ${publishedAt.toISOString().slice(0, 10)})` : ""}.`
  );

  const gameId = await resolveGameId();
  const [createdBy, byName, existing] = await Promise.all([
    resolveAuthorId(),
    readCardsByName(gameId),
    readImportedClarifications(),
  ]);

  if (byName.size === 0) {
    throw new Error(`Aucune carte pour le jeu « ${GAME_SLUG} » : importez le catalogue avant les clarifications.`);
  }

  const context = { byName, existing, createdBy, errataDate: publishedAt ?? new Date(), dryRun };
  const tally = new Map<Outcome, number>();
  const seen = new Set<string>();

  for (const entry of entries) {
    const { outcome, cardIds } = await importEntry(entry, context);
    tally.set(outcome, (tally.get(outcome) ?? 0) + 1);

    if (cardIds.length > 0) {
      seen.add(cardsKey(cardIds));
    }
  }

  console.info(
    `${dryRun ? "À écrire" : "Écrit"} : ` +
      [...tally].map(([outcome, count]) => `${count} ${outcome}${count > 1 ? "s" : ""}`).join(", ")
  );

  // Une clarification que le compendium ne porte plus : elle reste en base, et
  // c'est à un humain de décider si elle a fait son temps.
  const dropped = [...existing.keys()].filter((key) => !seen.has(key));

  if (dropped.length > 0) {
    console.warn(
      `${dropped.length} clarification(s) du compendium ne correspondent plus à aucune entrée, laissées en place : ` +
        dropped.map((key) => key.replaceAll("|", "+")).join(", ")
    );
  }

  if (dryRun) {
    console.info("--dry-run : rien n'a été écrit.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
