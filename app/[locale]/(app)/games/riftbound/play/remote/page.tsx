import type { Metadata } from "next";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { RemoteGame } from "@/components/play/RemoteGame.tsx";

export const metadata: Metadata = { robots: { index: false } };

export default function RiftboundRemotePage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="lobby">
      <RemoteGame />
    </PlayShell>
  );
}
