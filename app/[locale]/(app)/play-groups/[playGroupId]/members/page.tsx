import { Suspense } from "react";
import PlayGroupMembersClient from "@/components/play-groups/PlayGroupMembersClient.tsx";
import { PlayGroupScreenSkeleton } from "@/components/play-groups/PlayGroupSkeletons.tsx";

/**
 * Même forme que le portail du groupe : écran entièrement client, paramètre
 * d'URL lu par `useParams()`, donc frontière et silhouette depuis l'enveloppe
 * serveur.
 */
export default function PlayGroupMembersPage() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <Suspense fallback={<PlayGroupScreenSkeleton rows={5} label="Chargement des membres" />}>
        <PlayGroupMembersClient />
      </Suspense>
    </div>
  );
}
