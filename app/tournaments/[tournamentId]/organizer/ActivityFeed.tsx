"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { cn } from "@/lib/utils";
import type { TournamentActivityType } from "@/lib/types/Tournament";

type ApiActivity = {
  id: string;
  type: TournamentActivityType;
  params: Record<string, string | number>;
  actorLabel?: string;
  createdAt: string;
};

// Couleur de la pastille selon la nature de l'événement : ce qui avance le
// tournoi en vert, ce qui demande un arbitrage en rouge, le reste en neutre.
const TONE: Record<TournamentActivityType, string> = {
  "match-reported": "bg-emerald-500",
  "match-confirmed": "bg-emerald-500",
  "match-disputed": "bg-destructive",
  "match-cleared": "bg-amber-500",
  "match-extended": "bg-sky-500",
  "announcement-sent": "bg-sky-500",
  "round-created": "bg-sky-500",
  "round-validated": "bg-emerald-500",
  "phase-advanced": "bg-sky-500",
  "player-checked-in": "bg-emerald-500",
  "player-dropped": "bg-amber-500",
  "player-reregistered": "bg-emerald-500",
  "penalty-issued": "bg-destructive",
};

/**
 * Fil des dernières actions du tournoi. Rafraîchi périodiquement : plusieurs
 * arbitres saisissent en parallèle, le fil doit refléter la salle sans que
 * chacun recharge sa page.
 */
export function ActivityFeed({
  tournamentId,
  limit = 12,
  pollMs = 15000,
  className,
}: {
  tournamentId: string;
  limit?: number;
  pollMs?: number;
  className?: string;
}) {
  const t = useTranslations("Tournaments");
  const [items, setItems] = useState<ApiActivity[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/activity?limit=${limit}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch {
      // Le fil est un confort d'affichage : un échec réseau laisse simplement
      // la liste précédente en place.
    }
  }, [tournamentId, limit]);

  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  if (items.length === 0) {
    return (
      <div className={className}>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {t("activity.title")}
        </p>
        <p className="text-sm text-muted-foreground">{t("activity.empty")}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {t("activity.title")}
      </p>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", TONE[item.type] ?? "bg-muted-foreground")} />
            <div className="min-w-0">
              <p className="text-[13px] leading-snug">
                {t(`activity.types.${item.type}`, {
                  ...item.params,
                  actor: item.actorLabel ?? t("activity.staffActor"),
                })}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {DateTime.fromISO(item.createdAt).toRelative()}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
