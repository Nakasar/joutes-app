"use client";

import { LimitedGame } from "@/components/play/limited/LimitedGame";
import { LimitedRoom } from "@/components/play/limited/LimitedRoom";
import { RemoteLimited } from "@/components/play/limited/RemoteLimited";
import { swuLimitedKit } from "@/components/play/swu/limited/swu-kit";

/**
 * Les pages de scellé et de draft de Star Wars: Unlimited. Le kit du jeu porte
 * des composants : il ne traverse pas la frontière serveur, ces enveloppes le posent.
 */
export function SwuLimitedGame() {
  return <LimitedGame kit={swuLimitedKit} />;
}

export function SwuLimitedRoom() {
  return <LimitedRoom kit={swuLimitedKit} />;
}

export function SwuRemoteLimited() {
  return <RemoteLimited kit={swuLimitedKit} />;
}
