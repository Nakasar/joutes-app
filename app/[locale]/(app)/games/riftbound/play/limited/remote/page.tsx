import type { Metadata } from "next";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { RemoteLimited } from "@/components/play/limited/RemoteLimited.tsx";

export const metadata: Metadata = { robots: { index: false } };

export default function RiftboundLimitedRemotePage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="lobby">
      <RemoteLimited />
    </PlayShell>
  );
}
