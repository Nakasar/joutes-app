"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { ClipboardList, ListChecks, Megaphone, Target, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReportButton from "@/components/ReportButton";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  stopwatchElapsedSeconds,
  timerRemainingSeconds,
} from "@/lib/tournament-timer";
import type { ApiTournament } from "./usePlayerTournament";
import { useTournamentLive } from "../useTournamentLive";

export type PlayerSection = "match" | "standings" | "players" | "form";

const SECTIONS: { key: PlayerSection; path: string; labelKey: string; Icon: typeof Target }[] = [
  { key: "match", path: "", labelKey: "playerShell.navMatch", Icon: Target },
  { key: "standings", path: "standings", labelKey: "playerShell.navStandings", Icon: Trophy },
  { key: "players", path: "players", labelKey: "playerShell.navPlayers", Icon: ClipboardList },
  { key: "form", path: "form", labelKey: "playerShell.navForm", Icon: ListChecks },
];

/**
 * Cadre du portail joueur, pensé pour un téléphone tenu en salle : un en-tête
 * sombre qui ne bouge pas (tournoi, ronde, minuteur, dernière annonce), le
 * contenu de la section, et une barre d'onglets au pouce. L'annonce vit dans
 * l'en-tête parce que c'est la seule information qu'un joueur ne doit jamais
 * rater, quelle que soit la page ouverte.
 */
export function PlayerShell({
  tournamentId,
  active,
  tournament,
  syncKey,
  myPlayerId,
  loading,
  error,
  roundLabel,
  deadlineAt,
  children,
}: {
  tournamentId: string;
  active: PlayerSection;
  tournament: ApiTournament | null;
  syncKey: string | null | undefined;
  myPlayerId?: string | null;
  loading: boolean;
  error: string | null;
  roundLabel?: string;
  // Échéance de l'intervalle en cours (ronde asynchrone). Prend la place du
  // minuteur, qui n'a pas de sens quand la partie se joue sur plusieurs jours.
  deadlineAt?: string;
  children: ReactNode;
}) {
  const t = useTranslations("Tournaments");
  // Luxon suit la locale du runtime par défaut : sans elle, l'échéance
  // s'afficherait dans une autre langue que le reste du portail.
  const locale = useLocale();
  const pathname = usePathname();
  const { state, serverOffsetMs } = useTournamentLive(tournamentId);

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  // Ce navigateur n'est pas synchronisé et l'utilisateur n'est pas identifié.
  if (syncKey === null && !loading && !tournament) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-8 text-center">
        <h1 className="text-2xl font-bold">{t("playerShell.notSyncedTitle")}</h1>
        <p className="text-muted-foreground">{t("playerShell.notSyncedDescription")}</p>
        <Button asChild variant="outline">
          <Link href="/tournaments">{t("playerShell.myTournaments")}</Link>
        </Button>
      </div>
    );
  }

  const base = `/tournaments/${tournamentId}/player`;
  const me = myPlayerId ? tournament?.players.find((p) => p.id === myPlayerId) : undefined;

  // Phase puzzle : le chronomètre de la salle prend la place du décompte, et
  // le libellé passe de « restant » à « écoulé ».
  const isPuzzle = state?.phaseType === "puzzle";
  const remaining = isPuzzle
    ? stopwatchElapsedSeconds(state?.stopwatch ?? null, serverOffsetMs)
    : timerRemainingSeconds(state?.timer ?? null, serverOffsetMs);
  // Instant de référence des échéances : l'heure du serveur, corrigée du
  // décalage du poste. Une machine mal réglée afficherait sinon un intervalle
  // déjà expiré — le minuteur applique la même correction.
  const serverNow = DateTime.now().plus({ milliseconds: serverOffsetMs });
  const expired = !isPuzzle && remaining !== null && remaining < 0;
  const low = !isPuzzle && remaining !== null && remaining >= 0 && remaining < 300;
  const lastAnnouncement = state?.announcements?.[0];

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col pb-24">
      <header className="bg-neutral-950 px-5 pb-7 pt-4 text-white">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">
              {tournament?.name ?? t("playerShell.tournamentFallback")}
            </p>
            <p className="mt-0.5 text-xs text-neutral-400">
              {roundLabel ?? t("playerShell.subtitle")}
            </p>
          </div>
          {deadlineAt ? (
            <div className="shrink-0 text-right">
              <p
                className={cn(
                  "text-sm font-semibold",
                  DateTime.fromISO(deadlineAt) < serverNow ? "text-red-400" : "text-white"
                )}
              >
                {DateTime.fromISO(deadlineAt).setLocale(locale).toRelative({ base: serverNow })}
              </p>
              <p className="text-[11px] text-neutral-400">{t("playerShell.deadline")}</p>
            </div>
          ) : (
            remaining !== null && (
              <div className="shrink-0 text-right">
                <p
                  className={cn(
                    "font-mono text-xl font-semibold tabular-nums",
                    expired ? "text-red-400" : low ? "text-amber-300" : "text-white"
                  )}
                >
                  {formatDuration(remaining)}
                </p>
                <p className="text-[11px] text-neutral-400">
                  {isPuzzle ? t("playerShell.elapsed") : t("playerShell.remaining")}
                </p>
              </div>
            )
          )}
        </div>

        {lastAnnouncement && (
          <div
            className={cn(
              "mt-3.5 flex items-start gap-2.5 rounded-xl border p-3",
              lastAnnouncement.level === "urgent"
                ? "border-red-800 bg-red-950/80"
                : "border-neutral-800 bg-neutral-900"
            )}
          >
            <Megaphone
              className={cn(
                "mt-0.5 size-4 shrink-0",
                lastAnnouncement.level === "urgent" ? "text-red-300" : "text-sky-300"
              )}
            />
            <p
              className={cn(
                "whitespace-pre-wrap text-[13px] leading-snug",
                lastAnnouncement.level === "urgent" ? "text-red-200" : "text-neutral-200"
              )}
            >
              {lastAnnouncement.message}
            </p>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          {me ? (
            <p className="text-xs text-neutral-400">
              {t("playerShell.participatingAs")}{" "}
              <span className="font-semibold text-white">{me.displayName}</span>
              {me.discriminator && <span className="ml-0.5 text-neutral-500">#{me.discriminator}</span>}
            </p>
          ) : (
            <span />
          )}
          <ReportButton
            contentType="tournament"
            contentId={tournamentId}
            className="text-neutral-400 hover:bg-neutral-800 hover:text-red-400"
          />
        </div>
      </header>

      <div className="-mt-4 flex-1 px-4">
        {error && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {loading ? <p className="text-muted-foreground">{t("common.loading")}</p> : children}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-2xl border-t bg-card/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 backdrop-blur">
        {/* L'onglet du formulaire n'apparaît que si l'organisateur en a posé
            un : sans question, il n'y a rien à y répondre. */}
        {SECTIONS.filter(
          (section) =>
            section.key !== "form" || (tournament?.registrationForm?.fields.length ?? 0) > 0
        ).map(({ key, path, labelKey, Icon }) => {
          const href = path ? `${base}/${path}` : base;
          const isActive = active === key || pathname === href;
          return (
            <Link
              key={key}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-2 text-[11px] font-semibold transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("size-5", isActive && "text-foreground")} strokeWidth={isActive ? 2.4 : 1.9} />
              {t(labelKey)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
