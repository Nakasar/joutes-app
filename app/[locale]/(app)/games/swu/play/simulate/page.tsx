import type { Metadata } from "next";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { SwuSimulatorSetup } from "@/components/play/swu/SwuSimulator.tsx";

// Une page d'outil propre à chaque compte : rien à indexer.
export const metadata: Metadata = { robots: { index: false } };

export default function SwuSimulatePage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="lobby" game="swu">
      <SwuSimulatorSetup />
    </PlayShell>
  );
}
