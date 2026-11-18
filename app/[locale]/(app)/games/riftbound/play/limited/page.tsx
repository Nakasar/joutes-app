import type { Metadata } from "next";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { LimitedGame } from "@/components/play/limited/LimitedGame.tsx";

// Un évènement en cours n'a rien à offrir à un moteur de recherche.
export const metadata: Metadata = { robots: { index: false } };

export default function RiftboundLimitedPage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="lobby">
      <LimitedGame />
    </PlayShell>
  );
}
