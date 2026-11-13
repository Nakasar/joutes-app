import type { Metadata } from "next";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { SwuRemoteGame } from "@/components/play/swu/SwuRemoteGame.tsx";

export const metadata: Metadata = { robots: { index: false } };

export default function SwuRemotePage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="lobby" game="swu">
      <SwuRemoteGame />
    </PlayShell>
  );
}
