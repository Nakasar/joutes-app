import type { PlayerStanding } from "@/lib/utils/pairing.ts";

export type EnrichedStanding = PlayerStanding & { username?: string; discriminator?: string };
