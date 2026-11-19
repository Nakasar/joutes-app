import type { Metadata } from "next";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { SwuRemoteLimited } from "@/components/play/swu/limited/swu-pages.tsx";

export const metadata: Metadata = { robots: { index: false } };

export default function SwuLimitedRemotePage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="lobby" game="swu">
      <SwuRemoteLimited />
    </PlayShell>
  );
}
