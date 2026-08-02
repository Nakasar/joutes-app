import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { normalizePrintCode, printCodeSplits, type CardListEntry } from "@/lib/cubes/card-list";

/** Carte du jeu telle qu'une entrée de paquet la stocke. */
export type ResolvedCard = {
  cardId: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  image: string;
};

export type CardListResolution = {
  resolved: { entry: CardListEntry; card: ResolvedCard }[];
  /** Entrées sans correspondance dans la base du jeu, listées à l'utilisateur. */
  unresolved: CardListEntry[];
};

type CardDoc = {
  id?: string;
  name?: string;
  setCode?: string;
  collectorNumber?: string;
  image?: string;
  lang?: string;
};

const CARD_PROJECTION = { _id: 0, id: 1, name: 1, setCode: 1, collectorNumber: 1, image: 1, lang: 1 } as const;

/**
 * Écritures sous lesquelles une carte peut être désignée dans une liste : son
 * impression (extension + numéro) et son identifiant, qui n'en est parfois
 * qu'une variante ponctuée (`SOR-001`).
 */
function codesOf(doc: CardDoc): string[] {
  return [
    doc.setCode || doc.collectorNumber ? normalizePrintCode(`${doc.setCode ?? ""}${doc.collectorNumber ?? ""}`) : "",
    doc.id ? normalizePrintCode(doc.id) : "",
  ].filter(Boolean);
}

function toResolved(doc: CardDoc): ResolvedCard | null {
  if (!doc.id || !doc.name) {
    return null;
  }

  return {
    cardId: doc.id,
    name: doc.name,
    setCode: doc.setCode ?? "",
    collectorNumber: doc.collectorNumber ?? "",
    image: doc.image ?? "",
  };
}

/**
 * Départage plusieurs impressions d'un même nom : l'orthographe exacte prime
 * (une liste écrite en français doit garder ses cartes françaises), puis
 * l'anglais comme version de référence, puis la présence d'une illustration.
 * À égalité, l'impression la plus ancienne l'emporte, pour que deux imports de
 * la même liste donnent le même paquet.
 */
function pickBest(docs: CardDoc[], name: string): CardDoc | undefined {
  const score = (doc: CardDoc) =>
    (doc.name === name ? 4 : 0) + (doc.lang === "en" ? 2 : 0) + (doc.image ? 1 : 0);

  return [...docs].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) {
      return diff;
    }
    return `${a.setCode ?? ""}${a.collectorNumber ?? ""}`.localeCompare(`${b.setCode ?? ""}${b.collectorNumber ?? ""}`);
  })[0];
}

/**
 * Retrouve dans la base du jeu les cartes d'une liste collée. Le nom mène la
 * recherche : c'est la seule information toujours présente. Le code
 * d'impression, facultatif, sert à choisir parmi les rééditions d'un même nom,
 * et sert de repêchage pour les lignes dont le nom n'a rien donné (nom traduit,
 * faute de frappe) — il désigne alors une carte à lui seul.
 */
export async function resolveCardListEntries(
  gameId: ObjectId,
  entries: CardListEntry[],
): Promise<CardListResolution> {
  if (entries.length === 0) {
    return { resolved: [], unresolved: [] };
  }

  const names = [...new Set(entries.map((entry) => entry.name))];
  const docs = await db
    .collection<CardDoc & { gameId: ObjectId }>("cards")
    .find({ gameId, name: { $in: names } }, { projection: CARD_PROJECTION })
    // Même collation que les autres recherches par nom : la casse ne doit pas
    // faire échouer une liste recopiée à la main.
    .collation({ locale: "en", strength: 2 })
    .toArray();

  const byName = new Map<string, CardDoc[]>();
  for (const doc of docs) {
    const key = (doc.name ?? "").toLowerCase();
    const bucket = byName.get(key);
    if (bucket) {
      bucket.push(doc);
    } else {
      byName.set(key, [doc]);
    }
  }

  const resolved: CardListResolution["resolved"] = [];
  const pending: CardListEntry[] = [];

  for (const entry of entries) {
    const candidates = byName.get(entry.name.toLowerCase()) ?? [];
    const code = entry.printCode ? normalizePrintCode(entry.printCode) : undefined;
    // Un code qui ne désigne aucune impression connue de ce nom n'écarte pas la
    // carte : le nom suffit, une autre impression fera l'affaire.
    const matched = code ? candidates.find((doc) => codesOf(doc).includes(code)) : undefined;
    const card = toResolved(matched ?? pickBest(candidates, entry.name) ?? {});

    if (card) {
      resolved.push({ entry, card });
    } else {
      pending.push(entry);
    }
  }

  // Repêchage : une ligne dont le nom est resté sans réponse peut encore être
  // identifiée par son seul code d'impression.
  const byCode = new Map<string, CardListEntry[]>();
  // Codes tels qu'ils ont été saisis : la normalisation retire la ponctuation,
  // or un identifiant de carte peut la porter (`SOR-001`). Interroger `id` avec
  // le seul code normalisé passerait à côté.
  const writtenCodes = new Set<string>();
  for (const entry of pending) {
    if (!entry.printCode) {
      continue;
    }
    const code = normalizePrintCode(entry.printCode);
    writtenCodes.add(entry.printCode);
    const bucket = byCode.get(code);
    if (bucket) {
      bucket.push(entry);
    } else {
      byCode.set(code, [entry]);
    }
  }

  const fallbackByCode = new Map<string, CardDoc>();
  if (byCode.size > 0) {
    const codes = [...byCode.keys()];
    const or: Record<string, unknown>[] = [{ id: { $in: [...new Set([...codes, ...writtenCodes])] } }];
    for (const code of codes) {
      or.push(...printCodeSplits(code));
    }

    const fallbackDocs = await db
      .collection<CardDoc & { gameId: ObjectId }>("cards")
      .find({ gameId, $or: or }, { projection: CARD_PROJECTION })
      .collation({ locale: "en", strength: 2 })
      .toArray();

    for (const code of codes) {
      const matches = fallbackDocs.filter((doc) => codesOf(doc).includes(code));
      const best = pickBest(matches, byCode.get(code)?.[0]?.name ?? "");
      if (best) {
        fallbackByCode.set(code, best);
      }
    }
  }

  const unresolved: CardListEntry[] = [];
  for (const entry of pending) {
    const fallback = entry.printCode ? fallbackByCode.get(normalizePrintCode(entry.printCode)) : undefined;
    const card = fallback ? toResolved(fallback) : null;
    if (card) {
      resolved.push({ entry, card });
    } else {
      unresolved.push(entry);
    }
  }

  // Les entrées repêchées sont replacées dans l'ordre de la liste collée : le
  // paquet importé garde l'ordre du texte, pas celui de la résolution.
  const order = new Map(entries.map((entry, index) => [entry, index]));
  resolved.sort((a, b) => (order.get(a.entry) ?? 0) - (order.get(b.entry) ?? 0));

  return { resolved, unresolved };
}
