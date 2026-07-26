import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export type CardNameMatch = {
  id: string;
  name: string;
  image: string;
  setCode: string;
  collectorNumber: string;
  type?: string;
  text?: string;
};

/** Champs portés par toutes les cartes, saisis à part des attributs de jeu. */
const CORE_CARD_KEYS = new Set([
  "_id",
  "gameId",
  "id",
  "cardId",
  "name",
  "setCode",
  "collectorNumber",
  "lang",
  "image",
  "text",
]);

export type CardAttributeFieldType = "string" | "number" | "boolean" | "list";

export type CardAttributeField = {
  key: string;
  type: CardAttributeFieldType;
  /** Valeurs déjà utilisées, proposées en autocomplétion quand elles sont peu nombreuses. */
  suggestions?: string[];
};

/** `$type` Mongo -> type de champ du formulaire, le plus permissif l'emportant. */
function attributeFieldType(mongoTypes: string[]): CardAttributeFieldType | null {
  const types = mongoTypes.filter((type) => type !== "null" && type !== "missing");
  if (types.length === 0 || types.every((type) => type === "object")) {
    return null;
  }
  if (types.includes("array")) return "list";
  if (types.every((type) => type === "bool")) return "boolean";
  if (types.every((type) => ["int", "long", "double", "decimal"].includes(type))) return "number";
  return "string";
}

/**
 * Attributs réellement portés par les cartes d'un jeu : chaque jeu a les siens
 * (domaine et énergie sur Riftbound, arènes et coût sur Star Wars Unlimited…)
 * et rien ne les décrit en base, on les déduit donc d'un échantillon de cartes
 * plutôt que de figer une liste par jeu dans le code. Les champs communs
 * (nom, image, texte…) sont exclus : ils ont leur propre saisie.
 */
export async function getGameCardAttributeFields(gameId: ObjectId, sampleSize = 500): Promise<CardAttributeField[]> {
  const rows = await db
    .collection("cards")
    .aggregate<{ _id: string; types: string[]; count: number; values: unknown[] }>([
      { $match: { gameId } },
      { $limit: sampleSize },
      { $project: { fields: { $objectToArray: "$$ROOT" } } },
      { $unwind: "$fields" },
      { $match: { "fields.k": { $nin: [...CORE_CARD_KEYS] } } },
      {
        $group: {
          _id: "$fields.k",
          types: { $addToSet: { $type: "$fields.v" } },
          count: { $sum: 1 },
          values: { $addToSet: "$fields.v" },
        },
      },
      { $sort: { count: -1, _id: 1 } },
    ])
    .toArray();

  return rows.flatMap((row) => {
    const type = attributeFieldType(row.types);
    if (!type) {
      return [];
    }

    const suggestions = [
      ...new Set(
        row.values
          .flatMap((value) => (Array.isArray(value) ? value : [value]))
          .filter((value): value is string => typeof value === "string" && value.length > 0 && value.length <= 40)
      ),
    ].sort();

    return [{
      key: row._id,
      type,
      // Au-delà, il ne s'agit plus d'une liste de valeurs possibles (illustrateurs,
      // textes courts…) et l'autocomplétion n'aiderait pas.
      suggestions: suggestions.length > 0 && suggestions.length <= 40 ? suggestions : undefined,
    }];
  });
}

export type CardAttributeValue = string | number | boolean | string[];

export type NewCard = {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  lang: string;
  image?: string;
  text?: string;
  attributes?: Record<string, CardAttributeValue>;
};

/** Une carte est identifiée par son `id` au sein d'un jeu (`SFD125`, `SOR-001`…). */
export async function cardIdExists(gameId: ObjectId, id: string): Promise<boolean> {
  const card = await db.collection("cards").findOne({ gameId, id }, { projection: { _id: 1 } });
  return card !== null;
}

export async function createCard(gameId: ObjectId, card: NewCard): Promise<void> {
  const { attributes, ...core } = card;
  // Les champs communs priment : un attribut ne peut pas redéfinir l'identité de la carte.
  await db.collection("cards").insertOne({ ...attributes, ...core, gameId });
}

export type GameCardSummary = {
  id: string;
  name: string;
  setCode?: string;
  collectorNumber?: string;
  lang?: string;
  image?: string;
};

/** Dernières cartes ajoutées à un jeu (ordre d'insertion), pour l'écran d'administration. */
export async function getRecentGameCards(gameId: ObjectId, limit = 10): Promise<GameCardSummary[]> {
  return db
    .collection<GameCardSummary & { gameId: ObjectId }>("cards")
    .find({ gameId }, { projection: { _id: 0, id: 1, name: 1, setCode: 1, collectorNumber: 1, lang: 1, image: 1 } })
    .sort({ _id: -1 })
    .limit(limit)
    .toArray();
}

export async function getCardsByNames(gameId: ObjectId, names: string[]): Promise<CardNameMatch[]> {
  if (names.length === 0) return [];

  return db
    .collection<CardNameMatch & { gameId: ObjectId }>("cards")
    .find(
      { gameId, name: { $in: names } },
      { projection: { _id: 0, id: 1, name: 1, image: 1, setCode: 1, collectorNumber: 1, type: 1, text: 1 } }
    )
    .collation({ locale: "en", strength: 2 })
    .toArray();
}

export async function getCardsByIds(gameId: ObjectId, ids: string[]): Promise<CardNameMatch[]> {
  if (ids.length === 0) return [];

  return db
    .collection<CardNameMatch & { gameId: ObjectId }>("cards")
    .find(
      { gameId, id: { $in: ids } },
      { projection: { _id: 0, id: 1, name: 1, image: 1, setCode: 1, collectorNumber: 1, type: 1, text: 1 } }
    )
    .toArray();
}

/**
 * One representative {id, name} per distinct card name for a game (reprints
 * collapse to a single arbitrary printing) — used by the Loupe feature to
 * build a single regex matching every known card name against free text.
 */
export async function getAllCardNamesById(gameId: ObjectId): Promise<{ id: string; name: string }[]> {
  return db
    .collection("cards")
    .aggregate<{ id: string; name: string }>([
      { $match: { gameId } },
      { $group: { _id: { $toLower: "$name" }, id: { $first: "$id" }, name: { $first: "$name" } } },
      { $project: { _id: 0, id: 1, name: 1 } },
    ])
    .toArray();
}

/**
 * One representative {id, name} per distinct card name within a single set
 * (optionally narrowed to one language) — small enough to ship to the client
 * for an in-memory fuzzy index, unlike the full game card list.
 */
export async function getCardNamesBySet(
  gameId: ObjectId,
  setCode: string,
  lang?: string
): Promise<{ id: string; name: string }[]> {
  const match: { gameId: ObjectId; setCode: string; lang?: string } = { gameId, setCode };
  if (lang) {
    match.lang = lang;
  }

  return db
    .collection("cards")
    .aggregate<{ id: string; name: string }>([
      { $match: match },
      { $group: { _id: { $toLower: "$name" }, id: { $first: "$id" }, name: { $first: "$name" } } },
      { $project: { _id: 0, id: 1, name: 1 } },
    ])
    .toArray();
}

/**
 * Looks up a card from an AI vision identification, most precise tier
 * first: a set + collector number alone pins down a single printing
 * regardless of how well the name itself was read, so it's tried before
 * falling back to an exact (case-insensitive) name match. The set code and
 * collector number are the fields the model gets wrong most often, so each
 * tier that used them is followed by a retry without them rather than
 * giving up outright.
 */
export async function findCardByAiIdentification(
  gameId: ObjectId,
  identification: {
    name?: string | null;
    setCode?: string | null;
    collectorNumber?: string | null;
    lang?: string | null;
  }
): Promise<{ id: string; name: string } | null> {
  const { name, setCode, collectorNumber, lang } = identification;

  const baseFilter: Record<string, unknown> = { gameId };
  if (lang) {
    baseFilter.lang = lang;
  }

  const collection = db.collection<{ id: string; name: string }>("cards");
  const findOptions = { projection: { _id: 0, id: 1, name: 1 }, collation: { locale: "en", strength: 2 } };

  if (setCode && collectorNumber) {
    const card = await collection.findOne({ ...baseFilter, setCode, collectorNumber }, findOptions);
    if (card) return card;
  }

  if (name && setCode) {
    const card = await collection.findOne({ ...baseFilter, name, setCode }, findOptions);
    if (card) return card;
  }

  if (name) {
    const card = await collection.findOne({ ...baseFilter, name }, findOptions);
    if (card) return card;
  }

  return null;
}
