"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import {
  COMPANION_GAMES,
  companionStorageKey,
  companionSummary,
  parseStoredCompanion,
  type CompanionGame,
} from "@/lib/companion/state";
import { cn } from "@/lib/utils";

import { companionFonts } from "./shared";

const NAMES: Record<CompanionGame, string> = {
  riftbound: "Riftbound",
  swu: "Star Wars: Unlimited",
  mtg: "Magic: The Gathering",
};

const THEMES: Record<CompanionGame, string> = { riftbound: "cmp-rb", swu: "cmp-swu", mtg: "cmp-mtg" };

/** Le choix du jeu, et les parties en cours à reprendre. */
export function CompanionHub() {
  const t = useTranslations("Games.Companion");
  const [ongoing, setOngoing] = useState<{ game: CompanionGame; score: string; detail: string }[]>([]);

  useEffect(() => {
    const found: { game: CompanionGame; score: string; detail: string }[] = [];
    for (const game of COMPANION_GAMES) {
      try {
        const raw = localStorage.getItem(companionStorageKey(game));
        const parsed = raw ? parseStoredCompanion(game, JSON.parse(raw)) : null;
        const summary = parsed ? companionSummary(parsed.present) : null;
        if (summary && parsed?.present.phase === "playing") found.push({ game, ...summary });
      } catch {
        // Une partie illisible ne s'affiche pas.
      }
    }
    setOngoing(found);
  }, []);

  return (
    <div className={cn("mx-auto flex max-w-xl flex-col gap-4", companionFonts)}>
      {ongoing.map((game) => (
        <Link key={game.game} href={`/games/${game.game}/companion`} className="flex items-center gap-3 rounded-2xl border bg-card p-3 hover:border-primary">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-primary">{t("ongoing")}</div>
            <div className="truncate font-semibold">{game.score}</div>
            <div className="truncate text-sm text-muted-foreground">{NAMES[game.game]} · {game.detail}</div>
          </div>
          <span className="rounded-full bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground">{t("resumeShort")}</span>
        </Link>
      ))}
      {COMPANION_GAMES.map((game) => (
        <Link key={game} href={`/games/${game}/companion`} className={cn("cmp block", THEMES[game])}>
          <div className="cmp-setup" style={{ maxWidth: "none", minHeight: 120 }}>
            <div className="cmp-title text-xl">{NAMES[game]}</div>
            <p className="m-0 text-sm cmp-muted">{t(`hub.${game}`)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
