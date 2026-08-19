import { Suspense, type ComponentProps } from "react";

import PageClient from "./PageClient.tsx";
import { PlayerMatchSkeleton } from "./PlayerSkeletons.tsx";


/**
 * L'écran est entièrement client : il lit le paramètre d'URL et consulte
 * l'horloge à chaque rendu. La frontière est posée ici, depuis le serveur, pour
 * que la silhouette parte dans la coquille et qu'un joueur voie le cadre du
 * portail avant même l'hydratation.
 */
export default function Page(props: ComponentProps<typeof PageClient>) {
  return (
    <Suspense fallback={<PlayerMatchSkeleton />}>
      <PageClient {...props} />
    </Suspense>
  );
}
