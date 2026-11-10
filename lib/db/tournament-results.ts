import { ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import type { JoutesResultDraft } from "@/lib/tournaments/results";
import type { TournamentResult } from "@/lib/types/TournamentResult";

/**
 * Les résultats de tournoi des joueurs (`lib/types/TournamentResult.ts`).
 * Les règles sont dans `lib/tournaments/results.ts` ; ce module ne fait
 * qu'écrire et lire. Sans import de Next : le script de rattrapage
 * (`npm run results:backfill`) passe par lui.
 *
 * Index : `lib/db/indexes/users.ts`, section groupes de jeu.
 */
export const TOURNAMENT_RESULTS_COLLECTION = "tournamentResults";

type ResultDoc = TournamentResult & { _id?: ObjectId };

const results = () => db.collection<ResultDoc>(TOURNAMENT_RESULTS_COLLECTION);

function toResult(doc: ResultDoc): TournamentResult {
  const { _id, ...result } = doc;
  void _id;

  return { ...result, domains: result.domains ?? [] };
}

/**
 * Écrit les résultats d'un tournoi Joutes. Réécrire est sans risque : le
 * classement et le bilan sont remplacés, le deck lié et la visibilité choisis
 * par le joueur sont gardés. Un joueur qui n'est plus classé perd son résultat.
 */
export async function upsertJoutesResults(sourceRef: string, drafts: JoutesResultDraft[]): Promise<number> {
  const now = new Date().toISOString();

  for (const draft of drafts) {
    const { domains, ...fields } = draft;
    const unset = (["topCut", "record", "place", "gameId"] as const).filter((key) => fields[key] === undefined);
    await results().updateOne(
      { userId: draft.userId, sourceRef },
      {
        $set: { ...fields, updatedAt: now },
        $setOnInsert: { id: new ObjectId().toString(), domains, visibility: "public", createdAt: now },
        ...(unset.length > 0 ? { $unset: Object.fromEntries(unset.map((key) => [key, ""])) } : {}),
      },
      { upsert: true },
    );
  }

  const removed = await results().deleteMany({
    tournamentRef: sourceRef,
    source: "joutes",
    userId: { $nin: drafts.map((draft) => draft.userId) },
  });

  return drafts.length + removed.deletedCount;
}

/**
 * Le tournoi Joutes supprimé ou rouvert : les résultats qu'il a écrits
 * disparaissent jusqu'à sa clôture. Ceux qu'un joueur a déclarés restent.
 */
export async function deleteJoutesResults(tournamentRef: string): Promise<number> {
  const removed = await results().deleteMany({ tournamentRef, source: "joutes" });
  return removed.deletedCount;
}

/** Un id à poser d'avance : un résultat déclaré le reprend dans sa `sourceRef`. */
export function newTournamentResultId(): string {
  return new ObjectId().toString();
}

export async function insertTournamentResult(
  input: Omit<TournamentResult, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<TournamentResult> {
  const now = new Date().toISOString();
  const result: TournamentResult = { ...input, id: input.id ?? newTournamentResultId(), createdAt: now, updatedAt: now };
  await results().insertOne({ ...result });

  return result;
}

/** Une inscription du locator déjà reconnue par un autre compte : l'index unique refuse la seconde. */
export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

export async function getTournamentResult(id: string): Promise<TournamentResult | null> {
  const doc = await results().findOne({ id });
  return doc ? toResult(doc) : null;
}

export async function updateTournamentResult(
  id: string,
  set: Partial<Omit<TournamentResult, "id" | "userId" | "source" | "sourceRef" | "createdAt">>,
  unset: (keyof TournamentResult)[] = [],
): Promise<boolean> {
  const result = await results().updateOne(
    { id },
    {
      $set: { ...set, updatedAt: new Date().toISOString() },
      ...(unset.length > 0 ? { $unset: Object.fromEntries(unset.map((key) => [key, ""])) } : {}),
    },
  );

  return result.matchedCount === 1;
}

export async function deleteTournamentResult(id: string): Promise<boolean> {
  const result = await results().deleteOne({ id });
  return result.deletedCount === 1;
}

/** Les résultats de plusieurs joueurs, du plus récent au plus ancien : la timeline d'un groupe. */
export async function listResultsForUsers(userIds: string[], limit = 3000): Promise<TournamentResult[]> {
  if (userIds.length === 0) return [];
  const docs = await results().find({ userId: { $in: userIds } }).sort({ date: -1 }).limit(limit).toArray();

  return docs.map(toResult);
}

/** Les résultats qui pointent un deck : l'encart de sa fiche, la carte de la bibliothèque. */
export async function listResultsForDecks(deckIds: string[]): Promise<TournamentResult[]> {
  if (deckIds.length === 0) return [];
  const docs = await results().find({ deckId: { $in: deckIds } }).sort({ date: -1 }).limit(500).toArray();

  return docs.map(toResult);
}

/** Le résultat d'un joueur à un tournoi donné, quelle qu'en soit la source : pas deux fois le même tournoi. */
export async function findUserResultForTournament(userId: string, tournamentRef: string): Promise<TournamentResult | null> {
  const doc = await results().findOne({ userId, tournamentRef });
  return doc ? toResult(doc) : null;
}

/** Les inscriptions du locator déjà reconnues, parmi celles demandées. */
export async function listClaimedSourceRefs(sourceRefs: string[]): Promise<Map<string, string>> {
  if (sourceRefs.length === 0) return new Map();
  const docs = await results()
    .find({ source: "locator", sourceRef: { $in: sourceRefs } }, { projection: { sourceRef: 1, userId: 1 } })
    .toArray();

  return new Map(docs.map((doc) => [doc.sourceRef, doc.userId]));
}

/** Le deck supprimé ne pointe plus nulle part : ses résultats gardent la légende. */
export async function unlinkDeckFromResults(deckId: string): Promise<void> {
  await results().updateMany({ deckId }, { $unset: { deckId: "", deckVersion: "" } });
}
