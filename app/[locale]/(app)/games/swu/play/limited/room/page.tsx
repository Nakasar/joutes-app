import { Suspense } from "react";
import type { Metadata } from "next";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { SwuLimitedRoom } from "@/components/play/swu/limited/swu-pages.tsx";

export const metadata: Metadata = { robots: { index: false } };

export default function SwuLimitedRoomPage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="lobby" game="swu">
      {/* La salle lit son code dans l'adresse (`?id=`) : c'est une lecture du
          navigateur, qui attend derrière sa frontière. */}
      <Suspense fallback={null}>
        <SwuLimitedRoom />
      </Suspense>
    </PlayShell>
  );
}
