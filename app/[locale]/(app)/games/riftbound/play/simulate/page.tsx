import type { Metadata } from "next";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { RiftboundSimulatorSetup } from "@/components/play/RiftboundSimulator.tsx";

// Une page d'outil propre à chaque compte : rien à indexer.
export const metadata: Metadata = { robots: { index: false } };

export default function RiftboundSimulatePage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="lobby">
      <RiftboundSimulatorSetup />
    </PlayShell>
  );
}
