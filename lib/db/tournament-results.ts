import { ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import type { JoutesResultDraft, ResultSummary } from "@/lib/tournaments/results";
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
 * par le joueur sont gardés, même après une réouverture (voir
 * `hideJoutesResults`). Un joueur qui n'est plus classé perd son résultat.
 *
 * Un joueur qui avait déclaré ce tournoi à la main (la synchro avait échoué)
 * n'y figure pas deux fois : sa déclaration est remplacée, son deck et sa
 * visibilité passent au résultat Joutes.
 */
export async function upsertJoutesResults(sourceRef: string, drafts: JoutesResultDraft[]): Promise<number> {
  const now = new Date().toISOString();
  const userIds = drafts.map((draft) => draft.userId);

  const declared = await results()
    .find({ tournamentRef: sourceRef, source: "declared", userId: { $in: userIds } })
    .toArray();
  const carried = new Map(declared.map((doc) => [doc.userId, doc]));
  // Avant l'écriture : l'index unique { tournamentRef, userId } refuserait le résultat Joutes.
  if (declared.length > 0) await results().deleteMany({ _id: { $in: declared.map((doc) => doc._id!) } });

  for (const draft of drafts) {
    const { domains, ...fields } = draft;
    const previous = carried.get(draft.userId);
    const unset = (["topCut", "record", "place", "gameId"] as const).filter((key) => fields[key] === undefined);
    await results().updateOne(
      { userId: draft.userId, sourceRef },
      {
        $set: { ...fields, updatedAt: now },
        $setOnInsert: {
          id: new ObjectId().toString(),
          domains,
          visibility: previous?.visibility ?? "public",
          ...(previous?.deckId ? { deckId: previous.deckId, deckVersion: previous.deckVersion ?? 1 } : {}),
          createdAt: now,
        },
        $unset: { provisional: "", ...Object.fromEntries(unset.map((key) => [key, ""])) },
      },
      { upsert: true },
    );
  }

  const removed = await results().deleteMany({
    tournamentRef: sourceRef,
    source: "joutes",
    userId: { $nin: userIds },
  });

  return drafts.length + declared.length + removed.deletedCount;
}

/**
 * Le tournoi Joutes rouvert : ses résultats se cachent jusqu'à la clôture,
 * sans perdre le deck lié ni la visibilité choisis par les joueurs.
 */
export async function hideJoutesResults(tournamentRef: string): Promise<number> {
  const hidden = await results().updateMany({ tournamentRef, source: "joutes" }, { $set: { provisional: true } });
  return hidden.modifiedCount;
}

/**
 * Le tournoi Joutes supprimé : les résultats qu'il a écrits disparaissent.
 * Ceux qu'un joueur a déclarés restent.
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
  const docs = await results()
    .find({ userId: { $in: userIds }, provisional: { $ne: true } })
    .sort({ date: -1 })
    .limit(limit)
    .toArray();

  return docs.map(toResult);
}

/**
 * Tous les résultats de plusieurs joueurs, réduits à ce que la timeline d'un
 * groupe et ses totaux lisent : pas de plafond, le palmarès et « depuis »
 * portent sur tout l'historique.
 */
export async function listResultSummariesForUsers(userIds: string[]): Promise<ResultSummary[]> {
  if (userIds.length === 0) return [];
  const docs = await results()
    .find(
      { userId: { $in: userIds }, provisional: { $ne: true } },
      {
        projection: {
          _id: 0,
          id: 1,
          userId: 1,
          gameId: 1,
          source: 1,
          tournamentRef: 1,
          name: 1,
          date: 1,
          place: 1,
          playerCount: 1,
          placement: 1,
          legendName: 1,
        },
      },
    )
    .sort({ date: -1 })
    .toArray();

  return docs as ResultSummary[];
}

/** Des résultats complets par id : la page affichée de la timeline. */
export async function listResultsByIds(ids: string[]): Promise<TournamentResult[]> {
  if (ids.length === 0) return [];
  const docs = await results().find({ id: { $in: ids } }).toArray();

  return docs.map(toResult);
}

/** Les résultats qui pointent un deck : l'encart de sa fiche, la carte de la bibliothèque. */
export async function listResultsForDecks(deckIds: string[]): Promise<TournamentResult[]> {
  if (deckIds.length === 0) return [];
  const docs = await results()
    .find({ deckId: { $in: deckIds }, provisional: { $ne: true } })
    .sort({ date: -1 })
    .limit(500)
    .toArray();

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
