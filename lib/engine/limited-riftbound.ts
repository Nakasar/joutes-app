import { loadEngine } from "@/lib/engine/browser";
import { LIMITED_STORAGE_KEY, limitedRules } from "@/lib/engine/limited";
import type { LimitedProfile } from "@/lib/engine/limited-profile";

/** Le scellé et le draft de Riftbound (Tournament Rules, section 602). */
export const riftboundLimited: LimitedProfile = {
  game: "riftbound",
  slug: "riftbound",
  words: "setup",
  base: "/games/riftbound/play",
  storageKey: LIMITED_STORAGE_KEY,
  rules: limitedRules,
  engine: async () => {
    const engine = await loadEngine();
    return {
      sets: () => JSON.parse(engine.booster_sets()),
      create: (settings, seed) => new engine.LimitedEvent(JSON.stringify(settings), seed),
      restore: (record) => engine.LimitedEvent.restore(record),
    };
  },
};
