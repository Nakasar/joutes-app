import { loadCpEngine } from "@/lib/engine/cyberpunk/browser";
import { cpLimitedRules } from "@/lib/engine/cyberpunk/limited";
import type { LimitedProfile } from "@/lib/engine/limited-profile";

export const CP_LIMITED_STORAGE_KEY = "joutes.play.cp.limited";

/**
 * Le scellé de Cyberpunk TCG (Tournament Rules, annexe D.2.2). Contre des IA
 * seulement : le site n'a pas encore de table en ligne pour ce jeu.
 */
export const cpLimited: LimitedProfile = {
  game: null,
  words: "cp",
  base: "/games/cp/play",
  storageKey: CP_LIMITED_STORAGE_KEY,
  rules: cpLimitedRules,
  engine: async () => {
    const engine = await loadCpEngine();
    return {
      sets: () => JSON.parse(engine.cp_booster_sets()),
      create: (settings, seed) => new engine.CpLimitedEvent(JSON.stringify(settings), seed),
      restore: (record) => engine.CpLimitedEvent.restore(record),
    };
  },
};
