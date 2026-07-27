"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { cn } from "@/lib/utils";
import { formatDuration, timerIsPaused, timerRemainingSeconds } from "@/lib/tournament-timer";
import { useTournamentLive } from "../../tournaments/[tournamentId]/useTournamentLive";

/**
 * Écran de la salle, ouvert sur /t/:code et piloté à distance : l'organisateur
 * choisit le panneau depuis son portail, l'écran suit au prochain sondage sans
 * que personne n'aille toucher la machine du vidéoprojecteur.
 *
 * Tout est dimensionné en unités de viewport : le même écran sert un
 * vidéoprojecteur de salle et un téléviseur posé sur une table.
 */
export function ProjectionScreen({ tournamentId }: { tournamentId: string }) {
  const t = useTranslations("Tournaments");
  const { state, serverOffsetMs } = useTournamentLive(tournamentId, 5000);

  // Décompte fluide : le sondage rafraîchit les données, ce tick rafraîchit
  // l'affichage entre deux sondages.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  const timer = state?.timer ?? null;
  const remaining = timerRemainingSeconds(timer, serverOffsetMs);
  const expired = remaining !== null && remaining < 0;
  const paused = timerIsPaused(timer);
  const display = state?.display ?? "timer";

  return (
    <div
      className={cn(
        // Surcouche plein écran : recouvre l'en-tête du site pour ne laisser
        // que le contenu projeté.
        "fixed inset-0 z-[100] flex flex-col transition-colors",
        expired && display === "timer" ? "bg-red-600 text-white" : "bg-neutral-950 text-white"
      )}
    >
      <header className="flex shrink-0 items-baseline justify-between gap-4 px-[3vw] pt-[2.5vh]">
        <p className="truncate text-[2.2vh] font-semibold tracking-tight">{state?.name ?? ""}</p>
        <p className="shrink-0 text-[2.2vh] text-white/60">
          {state?.roundNumber ? t("common.roundN", { number: state.roundNumber }) : ""}
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col justify-center px-[3vw] py-[2vh]">
        {display === "timer" && (
          <TimerPanel remaining={remaining} paused={paused} expired={expired} />
        )}
        {display === "announcements" && (
          <AnnouncementsPanel announcements={state?.announcements ?? []} />
        )}
        {display === "standings" && <StandingsPanel standings={state?.standings ?? null} />}
        {display === "matches" && <MatchesPanel matches={state?.matches ?? null} />}
      </div>
    </div>
  );
}

function TimerPanel({
  remaining,
  paused,
  expired,
}: {
  remaining: number | null;
  paused: boolean;
  expired: boolean;
}) {
  const t = useTranslations("Tournaments");
  if (remaining === null) {
    return <p className="text-center text-[4vh] text-white/60">{t("timerPage.noTimer")}</p>;
  }
  return (
    <div className="flex flex-col items-center justify-center gap-[2vh]">
      <p
        className={cn(
          "font-mono text-[26vh] font-bold leading-none tabular-nums",
          !expired && remaining < 300 && "text-amber-300"
        )}
      >
        {formatDuration(remaining)}
      </p>
      {paused && (
        <p className="text-[3vh] uppercase tracking-[0.2em] text-white/70">{t("timerPage.paused")}</p>
      )}
    </div>
  );
}

function AnnouncementsPanel({
  announcements,
}: {
  announcements: { id: string; message: string; level: "info" | "urgent"; createdAt: string }[];
}) {
  const t = useTranslations("Tournaments");
  if (announcements.length === 0) {
    return <p className="text-center text-[4vh] text-white/50">{t("announcements.empty")}</p>;
  }
  // La dernière annonce prend toute la place : c'est celle que la salle doit
  // lire depuis le fond. Les précédentes restent en rappel, plus petites.
  const [latest, ...previous] = announcements;
  return (
    <div className="flex min-h-0 flex-col gap-[3vh]">
      <div
        className={cn(
          "rounded-[1.5vh] border-[0.3vh] p-[3vh]",
          latest.level === "urgent" ? "border-red-500 bg-red-500/15" : "border-white/15 bg-white/5"
        )}
      >
        <p
          className={cn(
            "whitespace-pre-wrap text-[6vh] font-bold leading-tight",
            latest.level === "urgent" && "text-red-300"
          )}
        >
          {latest.message}
        </p>
        <p className="mt-[1.5vh] font-mono text-[2.2vh] text-white/50">
          {DateTime.fromISO(latest.createdAt).toFormat("HH:mm")}
        </p>
      </div>
      {previous.length > 0 && (
        <ul className="flex min-h-0 flex-col gap-[1.2vh] overflow-hidden">
          {previous.slice(0, 4).map((a) => (
            <li key={a.id} className="flex items-baseline gap-[1.5vw] text-[2.6vh] text-white/60">
              <span className="shrink-0 font-mono text-[2.2vh] text-white/40">
                {DateTime.fromISO(a.createdAt).toFormat("HH:mm")}
              </span>
              <span className="truncate">{a.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StandingsPanel({
  standings,
}: {
  standings:
    | { rank: number; name: string; matchPoints: number; record: string; dropped: boolean }[]
    | null;
}) {
  const t = useTranslations("Tournaments");
  if (!standings || standings.length === 0) {
    return <p className="text-center text-[4vh] text-white/50">{t("projection.noStandings")}</p>;
  }

  // Deux colonnes dès que la liste dépasse ce que l'écran tient en hauteur :
  // 20 lignes par colonne restent lisibles depuis le fond de la salle.
  const perColumn = 20;
  const columns =
    standings.length > perColumn
      ? [standings.slice(0, perColumn), standings.slice(perColumn, perColumn * 2)]
      : [standings];

  return (
    <div className="flex min-h-0 gap-[3vw]">
      {columns.map((column, index) => (
        <table key={index} className="min-w-0 flex-1 border-collapse">
          <tbody>
            {column.map((row) => (
              <tr key={row.rank} className={cn("border-b border-white/10", row.dropped && "opacity-40")}>
                <td className="w-[4vw] py-[0.6vh] font-mono text-[2.6vh] text-white/50">{row.rank}</td>
                <td className="truncate py-[0.6vh] text-[2.8vh] font-medium">{row.name}</td>
                <td className="w-[7vw] py-[0.6vh] text-right font-mono text-[2.6vh] text-white/60">
                  {row.record}
                </td>
                <td className="w-[5vw] py-[0.6vh] text-right font-mono text-[2.8vh] font-bold tabular-nums">
                  {row.matchPoints}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

function MatchesPanel({
  matches,
}: {
  matches: { id: string; tableNumber: number | null; players: string[]; done: boolean }[] | null;
}) {
  const t = useTranslations("Tournaments");
  if (!matches || matches.length === 0) {
    return <p className="text-center text-[4vh] text-white/50">{t("projection.noMatches")}</p>;
  }
  return (
    <div className="grid min-h-0 grid-cols-2 gap-[1.2vh] xl:grid-cols-3">
      {matches.map((match) => (
        <div
          key={match.id}
          className={cn(
            "flex items-center gap-[1.2vw] rounded-[1vh] border border-white/15 bg-white/5 px-[1.2vw] py-[1.2vh]",
            // Une table rendue s'efface : ce qui reste à l'écran est ce qui
            // reste à jouer.
            match.done && "opacity-35"
          )}
        >
          <span className="w-[4vw] shrink-0 font-mono text-[4vh] font-bold tabular-nums">
            {match.tableNumber ?? "—"}
          </span>
          <span className="min-w-0 flex-1 truncate text-[2.4vh]">
            {match.players.join(" · ") || t("common.bye")}
          </span>
        </div>
      ))}
    </div>
  );
}
