import type { Metadata } from "next";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { SwuLimitedGame } from "@/components/play/swu/limited/swu-pages.tsx";

// Un évènement en cours n'a rien à offrir à un moteur de recherche.
export const metadata: Metadata = { robots: { index: false } };

export default function SwuLimitedPage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="lobby" game="swu">
      <SwuLimitedGame />
    </PlayShell>
  );
}
