"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { searchSwuPlayDecksAction } from "@/app/[locale]/(app)/games/swu/play/actions";
import {
  createSwuSimulationAction,
  deleteSwuSimulationAction,
  extendSwuSimulationAction,
  getSwuSimulationAction,
  loadSwuSimulatorAction,
  recordSwuSimulationGamesAction,
} from "@/app/[locale]/(app)/games/swu/play/simulate/actions";
import type { SimulatorKit } from "@/components/play/simulator-kit";
import { SimulationResults } from "@/components/play/SimulationResults";
import { SimulatorSetup } from "@/components/play/SimulatorSetup";
import { writeSwuSave } from "@/components/play/swu/useSwuSoloGame";
import { useSwuTableCards } from "@/components/play/swu/useSwuTableCards";
import { swuGameConfig } from "@/lib/engine/simulation";
import { ASPECT_HEX, swuPickerCards } from "@/lib/engine/swu/cards";
import type { SwuLobbyDeck } from "@/lib/engine/swu/lobby-decks";
import type { SwuConfig } from "@/lib/engine/swu/types";
import { SWU_ENGINE_VERSION } from "@/lib/engine/swu/version";
import type { BotLevel } from "@/lib/engine/types";

/** Durée d'une partie de SWU entre IA dans le navigateur, en secondes (mesurée sur le moteur). */
const SWU_SECONDS_PER_GAME: Record<BotLevel, number> = { easy: 0.1, normal: 0.75, hard: 8.5 };

const searchDecks = (query: string) =>
  searchSwuPlayDecksAction(query).then((result) => (result.ok ? result.decks : []));

/** Star Wars: Unlimited pour les écrans du simulateur. Pas de decks de tournoi pour ce jeu. */
const KIT: SimulatorKit<SwuLobbyDeck> = {
  home: "/games/swu/play",
  engine: SWU_ENGINE_VERSION,
  words: "Games.PlaySwu",
  sources: ["mine", "shared", "public", "auto"],
  defaultSources: ["auto"],
  colors: ASPECT_HEX,
  secondsPerGame: SWU_SECONDS_PER_GAME,
  actions: {
    load: loadSwuSimulatorAction,
    create: createSwuSimulationAction,
    get: getSwuSimulationAction,
    record: recordSwuSimulationGamesAction,
    extend: extendSwuSimulationAction,
    remove: deleteSwuSimulationAction,
  },
  createWorker: () => new Worker(new URL("./swu-simulation.worker.ts", import.meta.url), { type: "module" }),
  config: swuGameConfig,
  watch: (config, seed, level) => {
    writeSwuSave({ seat: null, bots: [level, level], record: { config: config as SwuConfig, seed, actions: [] } });
    return "/games/swu/play/solo";
  },
};

/** Le kit avec les textes de la liste des decks, qui nomment le leader. */
function useKit(): SimulatorKit<SwuLobbyDeck> {
  const ts = useTranslations("Games.PlaySwu");
  return useMemo(
    () => ({
      ...KIT,
      picker: {
        search: searchDecks,
        texts: { auto: ts("lobby.deckAuto"), randomHint: ts("lobby.deckRandomHint"), search: ts("lobby.deckSearch") },
      },
    }),
    [ts],
  );
}

function usePickerCards() {
  const cards = useSwuTableCards();
  return useMemo(() => swuPickerCards(cards), [cards]);
}

export function SwuSimulatorSetup() {
  return <SimulatorSetup kit={useKit()} cards={usePickerCards()} />;
}

export function SwuSimulationResults() {
  return <SimulationResults kit={useKit()} cards={usePickerCards()} />;
}
