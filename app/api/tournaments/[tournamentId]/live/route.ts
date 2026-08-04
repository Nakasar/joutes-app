import { NextRequest, NextResponse } from "next/server";
import {
  getStandings,
  getTournamentById,
  listAnnouncements,
  listMatchesByRound,
  listPhases,
  listPlayers,
  listRounds,
  TournamentError,
} from "@/lib/db/tournaments";
import { resolveCurrentRound, resolveDisplayPhase } from "@/lib/tournaments/current-round";
import { tournamentErrorResponse } from "../../utils";

/**
 * État « live » d'un tournoi diffusé aux joueurs, à la page timer et à l'écran
 * de projection : annonces, minuteur et panneau demandé par l'organisateur,
 * avec l'horloge serveur (`serverNow`) pour synchroniser le décompte côté
 * client malgré un éventuel décalage d'horloge. Lecture publique.
 *
 * Le classement et la liste des tables ne sont assemblés que lorsque l'écran
 * les demande : ils coûtent plusieurs lectures, et cet endpoint est interrogé
 * toutes les quelques secondes par chaque téléphone de la salle.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
  try {
    const { tournamentId } = await params;
    const tournament = await getTournamentById(tournamentId);
    if (!tournament) {
      throw new TournamentError("not-found", "Tournoi non trouvé");
    }

    const display = tournament.liveDisplay ?? "timer";
    const needsRound = display === "matches" || display === "standings";

    // Les phases sont toujours lues : leur type décide de ce que la salle et
    // les téléphones affichent (minuteur, ou chronomètre en phase puzzle). Une
    // poignée de documents indexés, contre les lectures franchement coûteuses
    // — classement, tables — qui restent conditionnées au panneau demandé.
    const [announcements, phases, rounds] = await Promise.all([
      listAnnouncements(tournamentId),
      listPhases(tournamentId),
      needsRound ? listRounds(tournamentId) : Promise.resolve([]),
    ]);

    const activePhase = resolveDisplayPhase(phases, tournament.currentPhaseId);
    const currentRound = needsRound ? resolveCurrentRound(rounds, activePhase?.id) : null;

    let standings: unknown[] | null = null;
    let matches: unknown[] | null = null;

    if (display === "standings") {
      const rows = await getStandings(tournamentId, activePhase?.id);
      standings = rows.map((row, index) => ({
        rank: index + 1,
        name: row.discriminator ? `${row.displayName} #${row.discriminator}` : row.displayName,
        matchPoints: row.matchPoints,
        record: `${row.wins}-${row.losses}-${row.draws}`,
        dropped: row.playerStatus === "dropped",
        // Phases puzzle : c'est le temps qui fait le classement, il remplace
        // donc le bilan et les points sur l'écran de la salle.
        puzzleTimeSeconds: row.puzzleTimeSeconds ?? null,
      }));
    }

    if (display === "matches" && currentRound) {
      const [roundMatches, players] = await Promise.all([
        listMatchesByRound(tournamentId, currentRound.id),
        listPlayers(tournamentId),
      ]);
      const nameById = new Map(
        players.map((p) => [
          p.id,
          p.discriminator ? `${p.displayName} #${p.discriminator}` : p.displayName,
        ])
      );
      matches = roundMatches
        // Les tables se lisent dans l'ordre de la salle, pas dans l'ordre de
        // création : un match sans table (BYE) passe en fin de liste.
        .sort(
          (a, b) =>
            (a.tableNumber ?? Number.MAX_SAFE_INTEGER) - (b.tableNumber ?? Number.MAX_SAFE_INTEGER)
        )
        .map((match) => ({
          id: match.id,
          tableNumber: match.tableNumber ?? null,
          players: match.players.map((p) => nameById.get(p.playerId) ?? "?"),
          done: match.status === "completed",
        }));
    }

    return NextResponse.json({
      name: tournament.name,
      display,
      roundNumber: currentRound?.number ?? null,
      // Forme publique minimale : n'expose pas createdBy / tournamentId.
      announcements: announcements.map((a) => ({
        id: a.id,
        message: a.message,
        level: a.level,
        createdAt: a.createdAt,
      })),
      timer: tournament.timer ?? null,
      stopwatch: tournament.stopwatch ?? null,
      // Type de la phase en cours : l'écran de salle et le portail joueur s'en
      // servent pour montrer le chronomètre plutôt que le minuteur.
      phaseType: activePhase?.type ?? null,
      standings,
      matches,
      serverNow: new Date().toISOString(),
    });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
