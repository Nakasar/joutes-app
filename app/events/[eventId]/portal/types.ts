import type { PlayerStanding } from "@/lib/utils/pairing";

export type EnrichedStanding = PlayerStanding & { username?: string; discriminator?: string };
