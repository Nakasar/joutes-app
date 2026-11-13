import type { Metadata } from "next";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { SwuSoloGame } from "@/components/play/swu/SwuSoloGame.tsx";

// Une partie en cours n'a rien à offrir à un moteur de recherche.
export const metadata: Metadata = { robots: { index: false } };

export default function SwuSoloPage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="lobby" game="swu">
      <SwuSoloGame />
    </PlayShell>
  );
}
