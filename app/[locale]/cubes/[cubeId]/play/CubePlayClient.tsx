"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowLeft, Dices, Layers, Loader2, TriangleAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CubeDrawResult, CubeDrawnCard, CubeDrawnPack } from "@/lib/db/cube-draw";
import type { Cube, CubeDrawConfig } from "@/lib/types/Cube";
import { CUBE_DRAW_MAX_PLAYERS, CUBE_DRAW_MIN_PLAYERS } from "@/lib/constants/cubes";

type Props = {
  cube: Cube;
  config: CubeDrawConfig;
  /** Vrai quand le cube n'a pas de configuration et joue sur les valeurs par défaut. */
  usingDefaults: boolean;
};

function CardGrid({ cards }: { cards: CubeDrawnCard[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
      {cards.map((card, index) => (
        // Une même carte peut sortir chez plusieurs joueurs : la clé combine
        // l'entrée et sa position pour rester unique dans la grille.
        <div key={`${card.id}-${index}`} className="overflow-hidden rounded-lg border bg-card">
          <div className="relative aspect-[3/4] w-full bg-muted">
            {card.image ? (
              <Image src={card.image} alt={card.name} fill unoptimized sizes="120px" className="object-cover" />
            ) : null}
          </div>
          <div className="p-1.5">
            <p className="truncate text-[11px] font-medium leading-tight" title={card.name}>{card.name}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {card.setCode} #{card.collectorNumber}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CubePlayClient({ cube, config, usingDefaults }: Props) {
  const t = useTranslations("Cubes");

  const [players, setPlayers] = useState("4");
  const [result, setResult] = useState<CubeDrawResult | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerCount = Number.parseInt(players, 10);
  const validPlayers = Number.isFinite(playerCount)
    && playerCount >= CUBE_DRAW_MIN_PLAYERS
    && playerCount <= CUBE_DRAW_MAX_PLAYERS;

  const draw = async () => {
    if (!validPlayers) return;
    setDrawing(true);
    setError(null);
    try {
      const res = await fetch(`/api/cubes/${cube.id}/draw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players: playerCount }),
      });
      if (res.ok) {
        setResult(await res.json());
        return;
      }
      const body = await res.json().catch(() => null);
      setError(body?.error ?? t("draw.error"));
    } catch {
      setError(t("draw.error"));
    } finally {
      setDrawing(false);
    }
  };

  const packLabel = (pack: CubeDrawnPack) => pack.name || t("packFallbackName", { index: pack.index });

  const summary = config.mode === "packs"
    ? t("draw.summaryPacks", { count: config.packsPerPlayer })
    : t("draw.summaryRandom", { count: config.cardsPerPlayer });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/cubes/${cube.id}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("backToCube", { name: cube.name })}
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("draw.title")}</h1>
          <p className="text-muted-foreground">{t("draw.subtitle", { name: cube.name })}</p>
        </div>
      </div>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[11px]">{summary}</Badge>
          {config.allowDuplicates ? (
            <Badge variant="outline" className="text-[11px]">{t("draw.duplicatesAllowed")}</Badge>
          ) : null}
          {config.mode === "random" && config.rules.length > 0 ? (
            <Badge variant="outline" className="text-[11px]">{t("draw.ruleCountBadge", { count: config.rules.length })}</Badge>
          ) : null}
          {usingDefaults ? (
            <span className="text-xs text-muted-foreground">{t("draw.usingDefaults")}</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="draw-players">{t("draw.players")}</Label>
            <Input
              id="draw-players"
              type="number"
              min={CUBE_DRAW_MIN_PLAYERS}
              max={CUBE_DRAW_MAX_PLAYERS}
              value={players}
              onChange={(e) => setPlayers(e.target.value)}
              className="w-28"
            />
          </div>
          <Button onClick={draw} disabled={drawing || !validPlayers} className="gap-2">
            {drawing ? <Loader2 className="size-4 animate-spin" /> : <Dices className="size-4" />}
            {result ? t("draw.redraw") : t("draw.generate")}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>

      {result ? (
        <>
          {result.shortfalls.length > 0 ? (
            <div className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                <TriangleAlert className="size-4" />
                {t("draw.shortfallTitle")}
              </p>
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {result.shortfalls.map((shortfall, index) => (
                  <li key={index}>
                    {shortfall.reason === "rule"
                      ? t("draw.shortfallRule", {
                          value: shortfall.value ?? "",
                          requested: shortfall.requested,
                          provided: shortfall.provided,
                        })
                      : t(shortfall.reason === "packs" ? "draw.shortfallPacks" : "draw.shortfallCards", {
                          requested: shortfall.requested,
                          provided: shortfall.provided,
                        })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-6">
            {result.players.map((entry) => (
              <section key={entry.player} className="space-y-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Users className="size-4" />
                  {t("draw.player", { index: entry.player })}
                </h2>

                {entry.packs.length > 0 ? (
                  <div className="space-y-4">
                    {entry.packs.map((pack, index) => (
                      <div key={`${pack.id}-${index}`} className="space-y-2 rounded-xl border bg-card p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Layers className="size-4 text-muted-foreground" />
                          <span className="font-medium">{packLabel(pack)}</span>
                          {pack.type ? <Badge variant="secondary" className="text-[11px]">{pack.type}</Badge> : null}
                          <span className="text-xs text-muted-foreground">
                            {t("cardCount", { count: pack.cards.length })}
                          </span>
                        </div>
                        {pack.cards.length > 0 ? <CardGrid cards={pack.cards} /> : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {entry.cards.length > 0 ? (
                  <div className="space-y-2 rounded-xl border bg-card p-4">
                    <span className="text-xs text-muted-foreground">
                      {t("cardCount", { count: entry.cards.length })}
                    </span>
                    <CardGrid cards={entry.cards} />
                  </div>
                ) : null}

                {entry.packs.length === 0 && entry.cards.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    {t("draw.emptyPlayer")}
                  </p>
                ) : null}
              </section>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
