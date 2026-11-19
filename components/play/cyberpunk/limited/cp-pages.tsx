"use client";

import { cpLimitedKit } from "@/components/play/cyberpunk/limited/cp-kit";
import { LimitedGame } from "@/components/play/limited/LimitedGame";

/**
 * La page de scellé de Cyberpunk TCG. Le kit du jeu porte des composants : il ne
 * traverse pas la frontière serveur, cette enveloppe le pose.
 */
export function CpLimitedGame() {
  return <LimitedGame kit={cpLimitedKit} />;
}
