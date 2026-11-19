import type { Metadata } from "next";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { RiftboundRemoteLimited } from "@/components/play/limited/riftbound-pages.tsx";

export const metadata: Metadata = { robots: { index: false } };

export default function RiftboundLimitedRemotePage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="lobby">
      <RiftboundRemoteLimited />
    </PlayShell>
  );
}
