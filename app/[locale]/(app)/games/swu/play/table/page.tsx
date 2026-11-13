import { Suspense } from "react";
import type { Metadata } from "next";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { SwuOnlineRoom } from "@/components/play/swu/SwuOnlineRoom.tsx";

export const metadata: Metadata = { robots: { index: false } };

export default function SwuTablePage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="lobby" game="swu">
      {/* La table lit son code dans l'adresse (`?id=`) : c'est une lecture du
          navigateur, qui attend derrière sa frontière. */}
      <Suspense fallback={null}>
        <SwuOnlineRoom />
      </Suspense>
    </PlayShell>
  );
}
