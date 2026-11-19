"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { CpTable } from "@/components/play/cyberpunk/CpTable";
import { CpBuildScreen } from "@/components/play/cyberpunk/limited/CpBuildScreen";
import { useCpSoloGame, type CpSave } from "@/components/play/cyberpunk/useCpSoloGame";
import { useCpTableCards } from "@/components/play/cyberpunk/useCpTableCards";
import type { LimitedKit, SoloMatchProps } from "@/components/play/limited/kit";
import { CostCurve, Dot } from "@/components/play/limited/limited-kit";
import { COLOR_HEX, type CpTableCard, type CpTableCards } from "@/lib/engine/cyberpunk/cards";
import {
  CP_COLORS,
  CP_RARITIES,
  CP_RARITY_COLORS,
  cpCostCurve,
  cpDeckColors,
  emptyCpDeck,
  fitCpToPool,
  isCpMain,
} from "@/lib/engine/cyberpunk/limited";
import { cpLimited } from "@/lib/engine/cyberpunk/limited-profile";
import type { CpConfig, CpDeckList, CpRecord } from "@/lib/engine/cyberpunk/types";
import type { CardFace, Faces } from "@/lib/engine/limited-faces";

/** La clé de phrase d'une rareté : « Nova Rare » s'écrit `nova`. */
export function cpRarityKey(rarity: string): string {
  return rarity === "Nova Rare" ? "nova" : rarity.toLowerCase();
}

/** Les cartes de Cyberpunk TCG dans la forme que lisent les écrans de limité. */
function useCpFaces(cards: CpTableCards): Faces {
  const t = useTranslations("Games.Limited");
  return useMemo(() => {
    const groups = CP_COLORS.map((color) => ({ key: color, label: t(`cp.color.${color}`), color: COLOR_HEX[color] }));
    // « Unit · Rouge · coût 3 · 5 · Rare »
    const line = (card: CpTableCard): string => {
      const parts: string[] = [t(`cp.kind.${card.kind}`), t(`cp.color.${card.color}`)];
      if (card.cost !== null) parts.push(t("cp.cost", { cost: card.cost }));
      if (card.power !== null) parts.push(t("cp.power", { power: card.power }));
      if (card.kind === "legend" && card.ram > 0) parts.push(t("cp.ram", { ram: card.ram }));
      if (card.rarity && CP_RARITIES.includes(card.rarity)) parts.push(t(`cp.rarity.${cpRarityKey(card.rarity)}`));
      return parts.join(" · ");
    };
    const made = new Map<string, CardFace>();
    const get = (code: string): CardFace | undefined => {
      const known = made.get(code);
      if (known) return known;
      const card = cards[code];
      if (!card) return undefined;
      const main = isCpMain(card);
      const face: CardFace = {
        name: card.name,
        image: card.image,
        landscape: false,
        text: card.text,
        cost: main ? (card.cost ?? 0) : null,
        groups: [card.color],
        kind: t(`cp.kind.${card.kind}`),
        line: line(card),
        rarity: Math.max(0, CP_RARITIES.indexOf(card.rarity ?? "Common")),
        ring: (card.rarity && CP_RARITY_COLORS[card.rarity]) ?? null,
        main,
      };
      made.set(code, face);
      return face;
    };
    return { get, name: (code: string) => cards[code]?.name ?? code, groups, groupWord: t("cp.colorWord") };
  }, [cards, t]);
}

function useCards(): { cards: CpTableCards; faces: Faces } {
  const cards = useCpTableCards();
  const faces = useCpFaces(cards);
  return { cards, faces };
}

function DeckSummary({ deck, cards, faces }: { deck: CpDeckList; cards: CpTableCards; faces: Faces }) {
  const t = useTranslations("Games.Limited");
  return (
    <>
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t("results.deck", { count: deck.cards.length })}</h2>
        <span className="flex gap-1">
          {cpDeckColors(deck, cards).map((color) => (
            <Dot key={color} color={COLOR_HEX[color]} />
          ))}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {deck.legends.length > 0 ? deck.legends.map((code) => faces.name(code)).join(" · ") : t("cp.build.noLegends")}
      </p>
      <CostCurve curve={cpCostCurve(deck, cards)} />
      <ul className="flex max-h-96 flex-col overflow-y-auto text-sm">
        {[...new Set(deck.cards)]
          .sort((a, b) => (cards[a]?.cost ?? 0) - (cards[b]?.cost ?? 0))
          .map((code) => (
            <li key={code} className="flex items-center gap-2 border-b py-1.5 last:border-b-0">
              <span className="w-6 shrink-0 text-muted-foreground">
                ×{deck.cards.filter((other) => other === code).length}
              </span>
              <span className="truncate">{faces.name(code)}</span>
              <span className="ml-auto tabular-nums text-muted-foreground">{cards[code]?.cost ?? ""}</span>
            </li>
          ))}
      </ul>
    </>
  );
}

/** Mon match contre une IA, sur la table de Cyberpunk TCG. */
function SoloMatch({ save, place, cards, onRecord, onResult, afterResult }: SoloMatchProps<CpTableCards, CpRecord>) {
  // La partie est ouverte une fois : la sauvegarde change à chaque coup, la table reste.
  const [solo] = useState<CpSave>(() => ({ seat: place, bots: save.bots, record: save.record }));
  const feed = useCpSoloGame(solo, cards, { onSave: (next) => onRecord(next.record) });
  const result = feed.update?.view.result ?? null;
  const told = useRef(false);
  useEffect(() => {
    if (!result || told.current) return;
    told.current = true;
    onResult(Array.isArray(result.winners) ? (result.winners as number[]) : []);
  }, [result, onResult]);
  return <CpTable feed={feed} cards={cards} afterResult={afterResult} />;
}

/** Le scellé de Cyberpunk TCG : ses cartes, sa construction, sa table. Contre des IA seulement. */
export const cpLimitedKit: LimitedKit<CpDeckList, CpTableCards, CpRecord, CpConfig> = {
  ...cpLimited,
  useCards,
  emptyDeck: emptyCpDeck,
  fitToPool: fitCpToPool,
  soloRecord: (game) => ({ config: game.config, seed: game.seed, actions: [] }),
  worker: () => new Worker(new URL("../cp-simulation.worker.ts", import.meta.url), { type: "module" }),
  Build: CpBuildScreen,
  DeckSummary,
  SoloMatch,
};
