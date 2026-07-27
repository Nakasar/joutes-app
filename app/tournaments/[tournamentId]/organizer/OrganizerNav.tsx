"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { OrganizerNavCounts } from "./organizerContext";

export type OrganizerNavSection =
  | "rounds"
  | "standings"
  | "live"
  | "players"
  | "phases"
  | "settings";

type NavItem = {
  key: OrganizerNavSection;
  href: string;
  badge?: { label: string; tone: "muted" | "alert" };
};

/**
 * Barre latérale du portail organisateur, en deux groupes : ce qui sert pendant
 * le tournoi puis ce qui relève de la préparation. La section active est
 * déduite de l'URL — le layout qui rend ce composant ne connaît pas la route
 * de la page affichée.
 */
export function OrganizerNav({
  tournamentId,
  currentRoundId,
  counts,
}: {
  tournamentId: string;
  currentRoundId?: string;
  counts: OrganizerNavCounts;
}) {
  const t = useTranslations("Tournaments");
  const pathname = usePathname();
  const base = `/tournaments/${tournamentId}/organizer`;

  // « Ronde en cours » pointe directement sur les matchs de la ronde courante
  // quand il y en a une ; sinon sur la liste des rondes, qui propose d'en créer.
  const roundsHref = currentRoundId ? `${base}/rounds/${currentRoundId}/matches` : `${base}/rounds`;

  const liveGroup: NavItem[] = [
    {
      key: "rounds",
      href: roundsHref,
      badge:
        counts.disputedMatches > 0
          ? { label: String(counts.disputedMatches), tone: "alert" }
          : counts.pendingMatches > 0
            ? { label: String(counts.pendingMatches), tone: "muted" }
            : undefined,
    },
    { key: "standings", href: `${base}/standings` },
    { key: "live", href: `${base}/live` },
  ];

  const prepGroup: NavItem[] = [
    {
      key: "players",
      href: `${base}/players`,
      badge: {
        label: `${counts.checkedInPlayers}/${counts.totalPlayers}`,
        tone: "muted",
      },
    },
    { key: "phases", href: `${base}/phases` },
    { key: "settings", href: `${base}/settings` },
  ];

  // Le classement vit sous /rounds/:id/standings : on le distingue des matchs
  // pour que les deux entrées ne s'allument pas ensemble.
  const isRoundStandings = /\/rounds\/[^/]+\/standings$/.test(pathname);
  const activeKey: OrganizerNavSection = pathname.startsWith(`${base}/standings`)
    ? "standings"
    : isRoundStandings
      ? "standings"
      : pathname.startsWith(`${base}/rounds`)
        ? "rounds"
        : pathname.startsWith(`${base}/live`)
          ? "live"
          : pathname.startsWith(`${base}/players`)
            ? "players"
            : pathname.startsWith(`${base}/phases`)
              ? "phases"
              : "settings";

  const renderItem = (item: NavItem) => {
    const active = item.key === activeKey;
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
          active
            ? "bg-accent font-semibold text-foreground"
            : "font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        )}
      >
        <span>{t(`organizerShell.sections.${item.key}`)}</span>
        {item.badge && (
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 font-mono text-xs",
              item.badge.tone === "alert"
                ? "bg-destructive/10 text-destructive"
                : "text-muted-foreground"
            )}
          >
            {item.badge.label}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col gap-0.5">
      <p className="mx-2 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t("organizerShell.groupLive")}
      </p>
      {liveGroup.map(renderItem)}
      <p className="mx-2 mb-1.5 mt-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t("organizerShell.groupPrep")}
      </p>
      {prepGroup.map(renderItem)}
    </nav>
  );
}
