import { getTranslations } from "next-intl/server";
import { MonitorPlay, Settings, Trophy, Users } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  canManageTournament,
  listPhases,
  listPlayers,
  planEventPlayersImport,
} from "@/lib/db/tournaments.ts";
import { listEventImportCandidates } from "@/lib/events/tournament-transfer.ts";
import { pendingTransferCount } from "@/lib/events/tournament-link.ts";
import type { Event } from "@/lib/types/Event.ts";
import type { Tournament, TournamentStatus } from "@/lib/types/Tournament.ts";
import { TournamentLinkControls } from "./TournamentLinkControls.tsx";

const STATUS_VARIANT: Record<TournamentStatus, "outline" | "default" | "secondary"> = {
  draft: "outline",
  "in-progress": "default",
  completed: "secondary",
};

/**
 * Section « Tournoi » de la page d'un événement, visible de tous.
 *
 * L'événement est le rendez-vous, le tournoi le déroulé de la session : la
 * section dit si un tournoi est associé, où il en est, et mène chacun à sa
 * place (espace joueur, pilotage, écran de salle). L'organisation de
 * l'événement y crée ou lie le tournoi, et y transfère les inscrits.
 */
export async function EventTournamentSection({
  event,
  tournament,
  viewerId,
  canManage,
}: {
  event: Event;
  tournament: Tournament | null;
  viewerId: string | null;
  canManage: boolean;
}) {
  const t = await getTranslations("Tournaments");
  const tEvent = await getTranslations("EventDetail.tournament");

  if (!tournament) {
    return (
      <section className="space-y-3">
        <SectionTitle title={t("eventLink.title")} />
        {canManage ? (
          <div className="space-y-3 rounded-lg border border-dashed p-4">
            <p className="text-sm">
              <span className="font-medium">{tEvent("noneTitle")}</span>{" "}
              <span className="text-muted-foreground">{tEvent("noneOrganizerHint")}</span>
            </p>
            <TournamentLinkControls eventId={event.id} tournament={null} pendingTransfer={null} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{tEvent("noneVisitor")}</p>
        )}
      </section>
    );
  }

  const [phases, players] = await Promise.all([
    listPhases(tournament.id),
    listPlayers(tournament.id),
  ]);
  const activePlayers = players.filter((player) => player.status !== "dropped").length;
  const isTournamentStaff = Boolean(viewerId && canManageTournament(tournament, viewerId));
  const isPlayer = Boolean(viewerId && players.some((player) => player.userId === viewerId));
  const showLive = tournament.status === "in-progress" && Boolean(tournament.liveCode);

  // Ce qu'un transfert ajouterait ou changerait, pour l'organisation seule :
  // le calcul lit les comptes de tous les inscrits.
  let pendingTransfer: number | null = null;
  if (canManage && isTournamentStaff) {
    try {
      const candidates = await listEventImportCandidates(event);
      pendingTransfer = pendingTransferCount(await planEventPlayersImport(tournament.id, candidates));
    } catch {
      pendingTransfer = null;
    }
  }

  return (
    <section className="space-y-3">
      <SectionTitle title={t("eventLink.title")} />
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Trophy className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{tournament.name}</h3>
              <Badge variant={STATUS_VARIANT[tournament.status]}>
                {t(`common.tournamentStatus.${tournament.status}`)}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {phases.map((phase) => (
                <span
                  key={phase.id}
                  className={
                    phase.id === tournament.currentPhaseId
                      ? "rounded-md bg-primary px-2 py-0.5 text-primary-foreground"
                      : "rounded-md bg-muted px-2 py-0.5 text-muted-foreground"
                  }
                >
                  {phase.name}
                </span>
              ))}
              <span className="flex items-center gap-1 text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {tEvent("playersCount", { count: activePlayers })}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {isPlayer && (
                <Button asChild size="sm">
                  <Link href={`/tournaments/${tournament.id}/player`}>
                    <Users className="mr-2 h-4 w-4" />
                    {tEvent("playerSpace")}
                  </Link>
                </Button>
              )}
              {isTournamentStaff && (
                <Button asChild size="sm" variant={isPlayer ? "outline" : "default"}>
                  <Link href={`/tournaments/${tournament.id}/organizer`}>
                    <Settings className="mr-2 h-4 w-4" />
                    {tEvent("organizerSpace")}
                  </Link>
                </Button>
              )}
              {showLive && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/t/${tournament.liveCode}`}>
                    <MonitorPlay className="mr-2 h-4 w-4" />
                    {tEvent("live")}
                  </Link>
                </Button>
              )}
            </div>
            {!isPlayer && !isTournamentStaff && viewerId && event.participants?.includes(viewerId) && (
              <p className="text-xs text-muted-foreground">{tEvent("notTransferredYet")}</p>
            )}
          </div>
        </div>
        {canManage && isTournamentStaff && (
          <TournamentLinkControls
            eventId={event.id}
            tournament={{ id: tournament.id, name: tournament.name }}
            pendingTransfer={pendingTransfer}
          />
        )}
      </div>
    </section>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      <Trophy className="h-5 w-5" />
      {title}
    </h2>
  );
}
