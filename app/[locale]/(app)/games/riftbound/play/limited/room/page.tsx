import { Suspense } from "react";
import type { Metadata } from "next";

import { PlayShell, type PlayPageProps } from "@/app/[locale]/(app)/games/riftbound/play/PlayShell.tsx";
import { RiftboundLimitedRoom } from "@/components/play/limited/riftbound-pages.tsx";

export const metadata: Metadata = { robots: { index: false } };

export default function RiftboundLimitedRoomPage({ params }: PlayPageProps) {
  return (
    <PlayShell params={params} back="lobby">
      {/* La salle lit son code dans l'adresse (`?id=`) : c'est une lecture du
          navigateur, qui attend derrière sa frontière. */}
      <Suspense fallback={null}>
        <RiftboundLimitedRoom />
      </Suspense>
    </PlayShell>
  );
}
