import type { LimitedProfile } from "@/lib/engine/limited-profile";
import { loadSwuEngine } from "@/lib/engine/swu/browser";
import { swuLimitedRules } from "@/lib/engine/swu/limited";

export const SWU_LIMITED_STORAGE_KEY = "joutes.play.swu.limited";

/** Le scellé et le draft de Star Wars: Unlimited (Comprehensive Rules, section 10). */
export const swuLimited: LimitedProfile = {
  game: "swu",
  base: "/games/swu/play",
  storageKey: SWU_LIMITED_STORAGE_KEY,
  rules: swuLimitedRules,
  engine: async () => {
    const engine = await loadSwuEngine();
    return {
      sets: () => JSON.parse(engine.swu_booster_sets()),
      create: (settings, seed) => new engine.SwuLimitedEvent(JSON.stringify(settings), seed),
      restore: (record) => engine.SwuLimitedEvent.restore(record),
    };
  },
};
