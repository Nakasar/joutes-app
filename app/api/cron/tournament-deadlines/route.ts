import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import {
  getTournamentById,
  listPlayers,
  listRoundsNeedingDeadlineNotice,
  markRoundReminded,
} from "@/lib/db/tournaments";
import {
  REMINDER_LEAD_HOURS,
  notifyOrganizersDeadlineReached,
  notifyRoundDeadlineSoon,
} from "@/lib/tournaments/interval-notifications";

/**
 * Relance des intervalles de ligue.
 *
 * Passe toutes les heures sur les rondes asynchrones encore ouvertes dont
 * l'échéance tombe dans les prochaines 24 h (ou est déjà passée) et qui
 * comptent encore des matchs sans résultat : les joueurs concernés sont
 * relancés, et l'organisation prévenue quand l'échéance est franchie.
 *
 * Volontairement sans clôture automatique : le document de ligue laisse à
 * l'organisateur le soin de décider entre double défaite, forfait et délai
 * supplémentaire. Le cron informe, il n'arbitre pas.
 */
export async function GET(req: Request) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = DateTime.now();
  const horizon = now.plus({ hours: REMINDER_LEAD_HOURS }).toJSDate();

  let reminded = 0;
  let failed = 0;

  try {
    const entries = await listRoundsNeedingDeadlineNotice(horizon);

    for (const { round, pendingMatches } of entries) {
      try {
        const tournament = await getTournamentById(round.tournamentId);
        // Tournoi supprimé entre-temps : la ronde est marquée pour ne pas être
        // reprise à chaque passage.
        if (!tournament || tournament.status === "completed") {
          await markRoundReminded(round.id);
          continue;
        }

        const players = await listPlayers(round.tournamentId);
        await notifyRoundDeadlineSoon(tournament, round, pendingMatches, players);

        const overdue = round.deadlineAt !== undefined && round.deadlineAt <= now.toJSDate();
        if (overdue) {
          await notifyOrganizersDeadlineReached(tournament, round, pendingMatches.length);
        }

        await markRoundReminded(round.id);
        reminded++;
      } catch (error) {
        // Une ronde en échec ne doit pas empêcher les autres d'être relancées.
        console.error(`Relance de l'intervalle ${round.id} échouée`, error);
        failed++;
      }
    }

    return NextResponse.json({ reminded, failed });
  } catch (error) {
    console.error("Cron des échéances de tournoi en échec", error);
    return NextResponse.json({ error: "Erreur lors du traitement des échéances" }, { status: 500 });
  }
}
