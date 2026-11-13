import type { Metadata } from "next";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { CpSoloGame } from "@/components/play/cyberpunk/CpSoloGame.tsx";

// Une partie en cours n'a rien à offrir à un moteur de recherche.
export const metadata: Metadata = { robots: { index: false } };

export default function CpSoloPage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="lobby" game="cp">
      <CpSoloGame />
    </PlayShell>
  );
}
