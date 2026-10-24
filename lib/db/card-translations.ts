import 'server-only';

import db from "@/lib/mongodb";
import type { Document, Filter, ObjectId } from "mongodb";
import { isCardLanguage } from "@/lib/constants/card-languages";
import { RESERVED_CARD_KEYS } from "@/lib/constants/cards";
import type { CardOrientation } from "@/lib/types/card";
import {
  bracketedKeywords,
  cardTranslationState,
  KEYWORD_GLOSSARY_FIELD,
  readCardTranslations,
  sharesTranslationWith,
  type CardGlossaryEntry,
  type CardTranslation,
  type CardTranslations,
  type CardTranslationState,
  type CardTranslationStatus,
} from "@/lib/cards/translations";

/**
 * Lectures et écritures de l'écran de traduction des cartes
 * (`/admin/translations`) et du glossaire des jeux. La forme des données et ce
 * qu'elles veulent dire sont décrits dans `lib/cards/translations.ts`.
 */

const GLOSSARY_COLLECTION = "card-glossaries";

export type TranslationQueueFilter = CardTranslationState | "all";

export type TranslationQueueItem = {
  id: string;
  name: string;
  setCode?: string;
  collectorNumber?: string;
  state: CardTranslationState;
  translatedName?: string;
};

export type TranslationCounts = Record<TranslationQueueFilter, number>;

/**
 * Le chemin `translations.<lang>` n'est construit qu'à partir d'une langue
 * connue : c'est elle qui empêche d'écrire n'importe où dans le document.
 */
function translationPath(lang: string): string {
  if (!isCardLanguage(lang)) {
    throw new Error(`Langue de traduction inconnue : ${lang}`);
  }
  return `translations.${lang}`;
}

/**
 * Les cartes qui se traduisent : la ligne anglaise de chaque carte (ou celle
 * qui ne dit pas sa langue, comme les plus anciens imports).
 *
 * `cards.id` n'est pas unique : un jeu importé en plusieurs langues porte une
 * ligne par langue sous le même identifiant. Ne viser que la ligne source
 * évite de lister deux fois une carte, et de ranger une traduction sur une
 * ligne que la file ne relit pas. Un jeu importé dans une autre langue que
 * l'anglais n'a donc rien à traduire ici.
 */
function baseFilter(gameId: ObjectId, lang: string): Filter<Document> {
  translationPath(lang);
  return { gameId, id: { $type: "string" }, lang: { $in: ["en", null] } };
}

/** La traduction a-t-elle été faite sur le nom et le texte anglais actuels ? */
function sourceIsCurrent(path: string): Document {
  return {
    $and: [
      { $eq: [`$${path}.source.name`, "$name"] },
      { $eq: [{ $ifNull: [`$${path}.source.text`, ""] }, { $ifNull: ["$text", ""] }] },
    ],
  };
}

function stateFilter(lang: string, state: TranslationQueueFilter): Filter<Document> {
  const path = translationPath(lang);
  switch (state) {
    case "all":
      return {};
    case "todo":
      return { [path]: { $exists: false } };
    case "draft":
      return { [`${path}.status`]: "draft" };
    case "done":
      return { [`${path}.status`]: "done", $expr: sourceIsCurrent(path) };
    case "stale":
      return { [`${path}.status`]: "done", $expr: { $not: [sourceIsCurrent(path)] } };
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchFilter(lang: string, search: string | undefined): Filter<Document> {
  const trimmed = search?.trim();
  if (!trimmed) return {};
  const regex = { $regex: escapeRegExp(trimmed), $options: "i" };
  return { $or: [{ name: regex }, { id: regex }, { [`${translationPath(lang)}.name`]: regex }] };
}

/**
 * Les effectifs de chaque file, en une seule passe sur les cartes du jeu : les
 * états « traduite » et « à revoir » comparent deux champs du document, ce
 * qu'aucun index ne sert, et cinq décomptes séparés relisaient le catalogue
 * cinq fois.
 */
export async function countTranslationStates(gameId: ObjectId, lang: string): Promise<TranslationCounts> {
  const path = translationPath(lang);
  const rows = await db
    .collection("cards")
    .aggregate<{ _id: CardTranslationState; count: number }>([
      { $match: baseFilter(gameId, lang) },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $eq: [{ $type: `$${path}` }, "missing"] }, then: "todo" },
                { case: { $eq: [`$${path}.status`, "draft"] }, then: "draft" },
                { case: sourceIsCurrent(path), then: "done" },
              ],
              default: "stale",
            },
          },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const counts: TranslationCounts = { todo: 0, stale: 0, draft: 0, done: 0, all: 0 };
  for (const row of rows) {
    counts[row._id] = row.count;
    counts.all += row.count;
  }
  return counts;
}

/** Extensions du jeu, pour traduire une extension d'un bout à l'autre. */
export async function getTranslationSets(gameId: ObjectId): Promise<string[]> {
  const sets = await db.collection("cards").distinct("setCode", { gameId });
  return sets.filter((set): set is string => typeof set === "string" && set.length > 0).sort();
}

/**
 * Une page de la file, dans l'ordre de collection : on traduit une extension
 * carte après carte, comme on la tient en main.
 */
export async function listTranslationQueue(
  gameId: ObjectId,
  lang: string,
  { state, search, setCode, limit = 60 }: { state: TranslationQueueFilter; search?: string; setCode?: string; limit?: number }
): Promise<TranslationQueueItem[]> {
  const path = translationPath(lang);
  const docs = await db
    .collection("cards")
    .find(
      {
        ...baseFilter(gameId, lang),
        ...stateFilter(lang, state),
        ...searchFilter(lang, search),
        ...(setCode ? { setCode } : {}),
      },
      { projection: { _id: 0, id: 1, name: 1, text: 1, setCode: 1, collectorNumber: 1, [path]: 1 } }
    )
    .sort({ setCode: 1, collectorNumber: 1, id: 1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => {
    const translation = readCardTranslations(doc.translations)?.[lang];
    return {
      id: doc.id as string,
      name: doc.name as string,
      setCode: doc.setCode as string | undefined,
      collectorNumber: doc.collectorNumber as string | undefined,
      state: cardTranslationState({ name: doc.name as string, text: doc.text as string | undefined }, translation),
      translatedName: translation?.name,
    };
  });
}

export type CardToTranslate = {
  id: string;
  name: string;
  text?: string;
  image?: string;
  orientation?: CardOrientation;
  setCode?: string;
  collectorNumber?: string;
  attributes: { key: string; value: string | string[] }[];
  translation?: CardTranslation;
  state: CardTranslationState;
  /** Les autres cartes du même nom, et si elles recevront la traduction. */
  twins: { id: string; code: string; sameText: boolean; shared: boolean }[];
};

/** Les attributs qui se traduisent par le glossaire : du texte, pas des nombres. */
function textAttributes(doc: Document): { key: string; value: string | string[] }[] {
  return Object.entries(doc).flatMap(([key, value]): { key: string; value: string | string[] }[] => {
    if (RESERVED_CARD_KEYS.includes(key) || key === "orientation") return [];
    if (typeof value === "string" && value) return [{ key, value }];
    if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string")) {
      return [{ key, value: value as string[] }];
    }
    return [];
  });
}

export async function getCardToTranslate(gameId: ObjectId, cardId: string, lang: string): Promise<CardToTranslate | null> {
  const doc = await db.collection("cards").findOne({ ...baseFilter(gameId, lang), id: cardId });
  if (!doc) return null;

  const translation = readCardTranslations(doc.translations)?.[lang];
  const text = typeof doc.text === "string" ? doc.text : undefined;
  const twinDocs = await db
    .collection("cards")
    .find(
      { ...baseFilter(gameId, lang), name: doc.name, _id: { $ne: doc._id } },
      { projection: { id: 1, text: 1, setCode: 1, collectorNumber: 1, translations: 1 } }
    )
    .sort({ setCode: 1, collectorNumber: 1 })
    .toArray();
  const twins = twinDocs.map((twin) => {
    const twinText = typeof twin.text === "string" ? twin.text : undefined;
    return {
      id: twin.id as string,
      code: [twin.setCode, twin.collectorNumber].filter(Boolean).join("-") || (twin.id as string),
      sameText: (twinText ?? "") === (text ?? ""),
      shared: sharesTranslationWith({ text }, { text: twinText, translation: readCardTranslations(twin.translations)?.[lang] }),
    };
  });

  return {
    id: doc.id as string,
    name: doc.name as string,
    text: typeof doc.text === "string" ? doc.text : undefined,
    image: typeof doc.image === "string" ? doc.image : undefined,
    orientation: doc.orientation as CardOrientation | undefined,
    setCode: doc.setCode as string | undefined,
    collectorNumber: doc.collectorNumber as string | undefined,
    attributes: textAttributes(doc),
    translation,
    state: cardTranslationState({ name: doc.name as string, text: doc.text as string | undefined }, translation),
    twins,
  };
}

/**
 * Enregistre la traduction d'une carte. Le nom et le texte anglais du moment
 * sont gardés avec : c'est ce qui permet de voir, après un import, quelles
 * traductions sont à revoir. Une traduction sans nom ni texte est retirée.
 *
 * Rend `false` si la carte n'existe pas.
 */
/**
 * Enregistre la traduction d'une carte et la reporte sur les cartes du même
 * nom (cf. `sharesTranslationWith`). Renvoie les identifiants des cartes
 * modifiées, la carte traduite en tête, ou `null` si elle n'existe pas.
 */
export async function saveCardTranslation(
  gameId: ObjectId,
  cardId: string,
  lang: string,
  input: { name?: string; text?: string; status: CardTranslationStatus },
  userId: string
): Promise<string[] | null> {
  const path = translationPath(lang);
  const cards = db.collection("cards");
  const card = await cards.findOne({ ...baseFilter(gameId, lang), id: cardId }, { projection: { _id: 1, name: 1, text: 1 } });
  if (!card) return null;

  const cardText = typeof card.text === "string" ? card.text : undefined;
  const twins = await cards
    .find(
      { ...baseFilter(gameId, lang), name: card.name, _id: { $ne: card._id } },
      { projection: { _id: 1, id: 1, text: 1, [path]: 1 } }
    )
    .toArray();
  const targets = [
    card,
    ...twins.filter((twin) =>
      sharesTranslationWith(
        { text: cardText },
        {
          text: typeof twin.text === "string" ? twin.text : undefined,
          translation: readCardTranslations(twin.translations)?.[lang],
        }
      )
    ),
  ];
  const filter = { _id: { $in: targets.map((target) => target._id) } };
  const ids = targets.map((target) => (target === card ? cardId : (target.id as string)));

  const name = input.name?.trim() || undefined;
  const text = input.text?.replace(/\r\n/g, "\n").trim() || undefined;

  if (!name && !text) {
    // Une carte du même nom traduite pour elle-même garde sa traduction.
    await cards.updateMany(filter, { $unset: { [path]: "" } });
    return ids;
  }

  await cards.updateMany(filter, {
    $set: {
      [path]: {
        ...(name ? { name } : {}),
        ...(text ? { text } : {}),
        status: input.status,
        // La source est celle de la carte traduite : une carte au texte
        // différent se voit ainsi « à revoir ».
        source: { name: card.name, ...(cardText ? { text: cardText } : {}) },
        updatedAt: new Date(),
        updatedBy: userId,
      },
    },
  });
  return ids;
}

// --- Glossaire ---------------------------------------------------------------

type GlossaryDocument = {
  gameId: ObjectId;
  lang: string;
  entries: CardGlossaryEntry[];
  updatedAt?: Date;
  updatedBy?: string;
};

export async function getCardGlossary(gameId: ObjectId, lang: string): Promise<CardGlossaryEntry[]> {
  if (!isCardLanguage(lang)) return [];
  const doc = await db.collection<GlossaryDocument>(GLOSSARY_COLLECTION).findOne({ gameId, lang });
  return (doc?.entries ?? []).filter(
    (entry) => typeof entry?.field === "string" && typeof entry.en === "string" && typeof entry.value === "string"
  );
}

/**
 * Remplace les termes d'une catégorie du glossaire. Un terme sans traduction
 * ni rappel n'est pas gardé : il reste tel quel sur les cartes, ce qui est
 * déjà le comportement d'un terme absent.
 */
export async function saveCardGlossaryField(
  gameId: ObjectId,
  lang: string,
  field: string,
  entries: { en: string; value: string; reminder?: string }[],
  userId: string
): Promise<void> {
  if (!isCardLanguage(lang)) {
    throw new Error(`Langue de traduction inconnue : ${lang}`);
  }

  const kept: CardGlossaryEntry[] = entries.flatMap((entry) => {
    const value = entry.value.trim();
    const reminder = field === KEYWORD_GLOSSARY_FIELD ? entry.reminder?.trim() : undefined;
    return value || reminder ? [{ field, en: entry.en, value, ...(reminder ? { reminder } : {}) }] : [];
  });

  // Une seule écriture, qui retire la catégorie et remet ses termes : deux
  // catégories enregistrées en même temps ne s'écrasent pas l'une l'autre.
  await db.collection<GlossaryDocument>(GLOSSARY_COLLECTION).updateOne(
    { gameId, lang },
    [
      {
        $set: {
          entries: {
            $concatArrays: [
              {
                $filter: {
                  input: { $ifNull: ["$entries", []] },
                  cond: { $ne: ["$$this.field", field] },
                },
              },
              { $literal: kept },
            ],
          },
          updatedAt: "$$NOW",
          updatedBy: { $literal: userId },
        },
      },
    ],
    { upsert: true }
  );
}

export type GlossaryTerm = { en: string; count: number };

/**
 * Les valeurs d'un attribut sur les cartes du jeu, de la plus fréquente à la
 * plus rare. `field` doit venir de `getGameCardAttributeFields` : il désigne
 * un champ du document.
 */
export async function getAttributeGlossaryTerms(gameId: ObjectId, field: string): Promise<GlossaryTerm[]> {
  if (RESERVED_CARD_KEYS.includes(field) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) {
    return [];
  }

  const rows = await db
    .collection("cards")
    .aggregate<{ _id: unknown; count: number }>([
      { $match: { gameId, [field]: { $exists: true } } },
      { $project: { value: `$${field}` } },
      { $unwind: "$value" },
      { $match: { value: { $type: "string", $ne: "" } } },
      { $group: { _id: "$value", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 500 },
    ])
    .toArray();

  return rows.flatMap((row) => (typeof row._id === "string" ? [{ en: row._id, count: row.count }] : []));
}

/** Les mots-clés écrits entre crochets dans les textes du jeu, comptés par carte. */
export async function getKeywordGlossaryTerms(gameId: ObjectId): Promise<GlossaryTerm[]> {
  const counts = new Map<string, number>();
  const cursor = db.collection("cards").find({ gameId, text: { $type: "string" } }, { projection: { _id: 0, text: 1 } });
  for await (const doc of cursor) {
    for (const keyword of bracketedKeywords(doc.text as string)) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([en, count]) => ({ en, count }))
    .sort((a, b) => b.count - a.count || a.en.localeCompare(b.en));
}

/**
 * Les traductions déjà saisies pour les cartes d'un jeu, par identifiant.
 *
 * Pour les scripts d'import : ils réécrivent les documents de recherche en
 * entier, et doivent y remettre les noms traduits, que la source ignore (cf.
 * `importedCardSearchDocument`). Seules les cartes traduites sont lues.
 */
export async function getStoredCardTranslations(gameId: ObjectId): Promise<Map<string, CardTranslations>> {
  const docs = await db
    .collection("cards")
    .find({ gameId, translations: { $exists: true } }, { projection: { _id: 0, id: 1, translations: 1 } })
    .toArray();

  return new Map(
    docs.flatMap((doc) => {
      const translations = readCardTranslations(doc.translations);
      return typeof doc.id === "string" && translations ? [[doc.id, translations] as const] : [];
    })
  );
}
