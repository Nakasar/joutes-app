import type { CreateIndexesOptions, Db, Document, IndexSpecification } from "mongodb";

/**
 * Un index tel que le déclare le registre (`lib/db/indexes/registry.ts`).
 *
 * `keys` est un objet **ordonné** : `{ lairId: 1, startDateTime: 1 }` n'est pas
 * `{ startDateTime: 1, lairId: 1 }`. L'ordre suit la règle Égalité → Tri →
 * Intervalle, et c'est lui qui décide si un index sert une requête.
 */
export type IndexDefinition = {
  collection: string;
  keys: Record<string, 1 | -1 | "2dsphere">;
  options?: Pick<
    CreateIndexesOptions,
    "unique" | "sparse" | "partialFilterExpression" | "expireAfterSeconds" | "name" | "collation"
  >;
  /** La requête que l'index sert — lu quand on se demande si on peut le supprimer. */
  why: string;
};

export type IndexOutcome =
  /** L'index n'existait pas : il a été créé (ou le serait, à blanc). */
  | { status: "created"; definition: IndexDefinition; name: string }
  /** Un index de mêmes clés et mêmes options existe déjà, quel que soit son nom. */
  | { status: "present"; definition: IndexDefinition; name: string }
  /**
   * Un index de mêmes clés existe avec d'autres options (unicité, filtre…).
   * On n'y touche pas : le remplacer demande de le supprimer, ce qui n'a rien
   * d'anodin sur une base en service. C'est à trancher à la main.
   */
  | { status: "conflict"; definition: IndexDefinition; name: string; existing: Document }
  /** MongoDB a refusé la création — typiquement des doublons sous un index unique. */
  | { status: "failed"; definition: IndexDefinition; error: string };

/** Les options qui changent ce que fait un index, et donc ce qu'on compare. */
const SEMANTIC_OPTIONS = ["unique", "sparse", "partialFilterExpression", "expireAfterSeconds", "collation"] as const;

/** Forme comparable d'une clé d'index : l'ordre des champs compte. */
export function keySignature(keys: Document): string {
  return JSON.stringify(Object.entries(keys));
}

/** Forme comparable d'une collation. */
function collationSignature(collation: Document | undefined): string | null {
  // MongoDB restitue une collation complétée de toutes ses valeurs par défaut
  // (`caseLevel`, `alternate`…) : seules la langue et la force distinguent
  // celles qu'on déclare.
  if (!collation) return null;
  return JSON.stringify({ locale: collation.locale, strength: collation.strength ?? 3 });
}

/** Les options sémantiques d'un index, normalisées pour la comparaison. */
function optionSignature(options: Document): string {
  return JSON.stringify(
    SEMANTIC_OPTIONS.map((option) => {
      const value = options[option];
      // `unique: false` et l'absence d'option disent la même chose.
      if (value === undefined || value === false) return null;
      if (option === "collation") return collationSignature(value);
      return value;
    })
  );
}

/** Index déjà posés sur une collection. Une collection absente n'en a aucun. */
async function existingIndexes(db: Db, collection: string): Promise<Document[]> {
  try {
    return await db.collection(collection).listIndexes().toArray();
  } catch (error) {
    // NamespaceNotFound : la collection n'existe pas encore.
    if ((error as { code?: number }).code === 26) return [];
    throw error;
  }
}

/**
 * Pose les index déclarés, sans jamais rien supprimer.
 *
 * Idempotent par construction : un index est reconnu à ses clés et à ses
 * options, pas à son nom. Cela compte, car une partie de ces index a déjà été
 * posée par les anciens scripts ou par la couche db, sous le nom par défaut de
 * MongoDB ; un `createIndex` nommé autrement serait refusé
 * (`IndexOptionsConflict`) au lieu d'être un non-événement.
 *
 * Un échec sur un index n'arrête pas les suivants : on veut, en une passe, la
 * liste complète de ce qui reste à régler.
 */
export async function ensureIndexes(
  db: Db,
  definitions: IndexDefinition[],
  { dryRun = false }: { dryRun?: boolean } = {}
): Promise<IndexOutcome[]> {
  const outcomes: IndexOutcome[] = [];
  const cache = new Map<string, Document[]>();

  for (const definition of definitions) {
    const { collection, keys, options = {} } = definition;

    let indexes = cache.get(collection);
    if (!indexes) {
      try {
        indexes = await existingIndexes(db, collection);
      } catch (error) {
        outcomes.push({ status: "failed", definition, error: errorMessage(error) });
        continue;
      }
      cache.set(collection, indexes);
    }

    // MongoDB accepte plusieurs index aux mêmes clés s'ils diffèrent par leur
    // collation : on cherche donc une correspondance exacte parmi **tous**
    // ceux qui ont ces clés, et un index de collation différente n'empêche
    // pas de créer le nôtre à côté.
    const sameKeys = indexes.filter((index) => keySignature(index.key) === keySignature(keys));
    const exact = sameKeys.find((index) => optionSignature(index) === optionSignature(options));
    if (exact) {
      outcomes.push({ status: "present", definition, name: exact.name });
      continue;
    }
    const clashing = sameKeys.find(
      (index) => collationSignature(index.collation) === collationSignature(options.collation)
    );
    if (clashing) {
      outcomes.push({ status: "conflict", definition, name: clashing.name, existing: clashing });
      continue;
    }

    if (dryRun) {
      outcomes.push({ status: "created", definition, name: options.name ?? defaultName(keys) });
      continue;
    }

    try {
      const name = await db.collection(collection).createIndex(keys as IndexSpecification, options);
      indexes.push({ key: keys, name, ...options });
      outcomes.push({ status: "created", definition, name });
    } catch (error) {
      outcomes.push({ status: "failed", definition, error: errorMessage(error) });
    }
  }

  return outcomes;
}

/**
 * Index présents en base mais absents du registre. Le script ne les supprime
 * pas — certains sont posés à l'exécution par la couche db, d'autres à la
 * main — il les signale pour qu'on décide.
 */
export async function undeclaredIndexes(
  db: Db,
  definitions: IndexDefinition[]
): Promise<{ collection: string; name: string; key: Document }[]> {
  const byCollection = new Map<string, Set<string>>();
  for (const { collection, keys } of definitions) {
    if (!byCollection.has(collection)) byCollection.set(collection, new Set());
    byCollection.get(collection)!.add(keySignature(keys));
  }

  const undeclared: { collection: string; name: string; key: Document }[] = [];
  for (const [collection, declared] of byCollection) {
    for (const index of await existingIndexes(db, collection)) {
      if (index.name === "_id_" || declared.has(keySignature(index.key))) continue;
      undeclared.push({ collection, name: index.name, key: index.key });
    }
  }
  return undeclared;
}

/** Le nom que MongoDB donne à un index qu'on ne nomme pas. */
export function defaultName(keys: Document): string {
  return Object.entries(keys)
    .map(([field, direction]) => `${field}_${direction}`)
    .join("_");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
