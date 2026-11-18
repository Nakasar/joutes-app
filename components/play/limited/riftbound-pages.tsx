"use client";

import { LimitedGame } from "@/components/play/limited/LimitedGame";
import { LimitedRoom } from "@/components/play/limited/LimitedRoom";
import { RemoteLimited } from "@/components/play/limited/RemoteLimited";
import { riftboundLimitedKit } from "@/components/play/limited/riftbound-kit";

/**
 * Les pages de scellé et de draft de Riftbound. Le kit du jeu porte des
 * composants : il ne traverse pas la frontière serveur, ces enveloppes le posent.
 */
export function RiftboundLimitedGame() {
  return <LimitedGame kit={riftboundLimitedKit} />;
}

export function RiftboundLimitedRoom() {
  return <LimitedRoom kit={riftboundLimitedKit} />;
}

export function RiftboundRemoteLimited() {
  return <RemoteLimited kit={riftboundLimitedKit} />;
}
