"use client";

import {
  createSimulationAction,
  deleteSimulationAction,
  extendSimulationAction,
  getSimulationAction,
  loadSimulatorAction,
  recordSimulationGamesAction,
} from "@/app/[locale]/(app)/games/riftbound/play/simulate/actions";
import type { SimulatorKit } from "@/components/play/simulator-kit";
import { SimulationResults } from "@/components/play/SimulationResults";
import { SimulatorSetup } from "@/components/play/SimulatorSetup";
import { writeSoloSave } from "@/components/play/useSoloGame";
import { useTableCards } from "@/components/play/useTableCards";
import type { LobbyDeck } from "@/lib/engine/lobby-decks";
import { gameConfig, SECONDS_PER_GAME, SIMULATION_SOURCES } from "@/lib/engine/simulation";
import { DOMAIN_HEX } from "@/lib/engine/told-text";
import type { EngineConfig } from "@/lib/engine/types";
import { ENGINE_VERSION } from "@/lib/engine/version";

/** Riftbound pour les écrans du simulateur. */
const KIT: SimulatorKit<LobbyDeck> = {
  home: "/games/riftbound/play",
  engine: ENGINE_VERSION,
  sources: SIMULATION_SOURCES,
  defaultSources: ["meta"],
  colors: DOMAIN_HEX,
  secondsPerGame: SECONDS_PER_GAME,
  actions: {
    load: loadSimulatorAction,
    create: createSimulationAction,
    get: getSimulationAction,
    record: recordSimulationGamesAction,
    extend: extendSimulationAction,
    remove: deleteSimulationAction,
  },
  createWorker: () => new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" }),
  config: gameConfig,
  watch: (config, seed, level) => {
    writeSoloSave({ seat: null, bots: [level, level], record: { config: config as EngineConfig, seed, actions: [] } });
    return "/games/riftbound/play/solo";
  },
};

export function RiftboundSimulatorSetup() {
  return <SimulatorSetup kit={KIT} cards={useTableCards()} />;
}

export function RiftboundSimulationResults() {
  return <SimulationResults kit={KIT} cards={useTableCards()} />;
}
