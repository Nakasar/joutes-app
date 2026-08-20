import { Suspense } from "react";
import PlayGroupPortalClient from "@/components/play-groups/PlayGroupPortalClient.tsx";
import { PlayGroupScreenSkeleton } from "@/components/play-groups/PlayGroupSkeletons.tsx";

/**
 * L'écran est entièrement client et lit le paramètre d'URL avec `useParams()`,
 * inconnu au prérendu : il suspend. Cette enveloppe serveur ne porte donc plus
 * un opt-out, mais la frontière et sa silhouette.
 */
export default function PlayGroupDetailPage() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <Suspense fallback={<PlayGroupScreenSkeleton />}>
        <PlayGroupPortalClient />
      </Suspense>
    </div>
  );
}
