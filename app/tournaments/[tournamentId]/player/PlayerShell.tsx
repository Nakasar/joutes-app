"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlayerLiveBanner } from "./PlayerLiveBanner";
import type { ApiTournament } from "./usePlayerTournament";
import { PlayerNameTag } from "../PlayerNameTag";

const STATUS_LABELS: Record<string, string> = {
  draft: "À venir",
  "in-progress": "En cours",
  completed: "Terminé",
};

// Libellé/variante du statut du joueur, affiché sur l'encadré d'identité.
const PLAYER_STATUS_BADGE: Record<string, { label: string; variant: "secondary" | "outline" }> = {
  registered: { label: "Inscrit", variant: "secondary" },
  "pre-registered": { label: "Pré-inscrit", variant: "outline" },
  dropped: { label: "Abandon", variant: "outline" },
};

export type PlayerSection = "match" | "standings" | "players";

export function PlayerShell({
  tournamentId,
  active,
  tournament,
  syncKey,
  myPlayerId,
  loading,
  error,
  children,
}: {
  tournamentId: string;
  active: PlayerSection;
  tournament: ApiTournament | null;
  syncKey: string | null | undefined;
  myPlayerId?: string | null;
  loading: boolean;
  error: string | null;
  children: ReactNode;
}) {
  // Ce navigateur n'est pas synchronisé et l'utilisateur n'est pas identifié.
  if (syncKey === null && !loading && !tournament) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-8 text-center">
        <h1 className="text-2xl font-bold">Tournoi non synchronisé</h1>
        <p className="text-muted-foreground">
          Ce navigateur n&apos;est pas synchronisé avec ce tournoi. Scannez le QR code fourni par
          l&apos;organisateur, ou connectez-vous si vous êtes inscrit avec votre compte.
        </p>
        <Button asChild variant="outline">
          <Link href="/tournaments">Mes tournois</Link>
        </Button>
      </div>
    );
  }

  const sections: { key: PlayerSection; label: string; path: string }[] = [
    { key: "match", label: "Mon match", path: "" },
    { key: "standings", label: "Classement", path: "standings" },
    { key: "players", label: "Joueurs", path: "players" },
  ];
  const base = `/tournaments/${tournamentId}/player`;

  // Joueur qui consulte le portail (identité portée par la clé ou la session).
  const me = myPlayerId ? tournament?.players.find((p) => p.id === myPlayerId) : undefined;
  const meBadge = me ? PLAYER_STATUS_BADGE[me.status] : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{tournament?.name ?? "Tournoi"}</h1>
          <p className="mt-1 text-muted-foreground">Portail joueur</p>
        </div>
        {tournament && (
          <Badge variant="secondary">{STATUS_LABELS[tournament.status] ?? tournament.status}</Badge>
        )}
      </div>

      <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {sections.map((section) => (
          <Link
            key={section.key}
            href={section.path ? `${base}/${section.path}` : base}
            aria-current={active === section.key ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active === section.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      {me && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-sm">
            <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Vous participez en tant que</span>
            <PlayerNameTag
              name={me.displayName}
              discriminator={me.discriminator}
              className="font-semibold text-foreground"
            />
            {!me.userId && <span className="text-xs text-muted-foreground">(invité)</span>}
          </div>
          {meBadge && <Badge variant={meBadge.variant}>{meBadge.label}</Badge>}
        </div>
      )}

      <PlayerLiveBanner tournamentId={tournamentId} />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? <p className="text-muted-foreground">Chargement...</p> : children}
    </div>
  );
}
