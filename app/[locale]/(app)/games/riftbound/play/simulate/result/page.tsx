import { Suspense } from "react";
import type { Metadata } from "next";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { SimulationResults } from "@/components/play/SimulationResults.tsx";

export const metadata: Metadata = { robots: { index: false } };

export default function RiftboundSimulationResultPage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="lobby">
      {/* La série se lit dans l'adresse (`?id=`) : une lecture du navigateur,
          qui attend derrière sa frontière. */}
      <Suspense fallback={null}>
        <SimulationResults />
      </Suspense>
    </PlayShell>
  );
}
