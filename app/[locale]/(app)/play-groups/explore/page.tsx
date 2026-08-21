import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Cinzel } from "next/font/google";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth.ts";
import { readExploreRoll } from "@/lib/db/play-groups-explore.ts";
import { readFollowedPlayGroupIds } from "@/lib/db/play-groups.ts";

import ExploreRoll from "./ExploreRoll.tsx";

/**
 * Le rôle d'armes : la page d'exploration des groupes de jeu.
 *
 * Cinzel n'est chargée que par cette page — l'instancier ici plutôt que dans la
 * coquille évite de la précharger sur tout le site pour les capitales romaines
 * d'un seul écran.
 */
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-cinzel",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("PlayGroups.explore");

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    openGraph: {
      url: "https://joutes.app/play-groups/explore",
      siteName: "Joutes",
      title: t("metaTitle"),
      description: t("metaDescription"),
    },
  };
}

export default function PlayGroupsExplorePage() {
  return (
    <div className={`play-group-roll ${cinzel.variable}`}>
      <Suspense fallback={<RollFallback />}>
        <Roll />
      </Suspense>
    </div>
  );
}

async function Roll() {
  // Le pilote Mongo et l'en-tête `host` touchent tous deux à ce qu'un prérendu
  // ne sait pas figer — le direct dépend du domaine qui intègre le lecteur.
  await connection();

  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  const userId = session?.user?.id ?? null;

  const [roll, followedIds] = await Promise.all([
    readExploreRoll({ host: requestHeaders.get("host") ?? "localhost" }),
    userId ? readFollowedPlayGroupIds(userId) : Promise.resolve(new Set<string>()),
  ]);

  return (
    <ExploreRoll
      groups={roll.groups}
      lives={roll.lives}
      posts={roll.posts}
      followedIds={[...followedIds]}
      isAuthenticated={!!userId}
      now={Date.now()}
    />
  );
}

/** Le squelette : la même colonne, pour que le titre ne saute pas à l'arrivée. */
function RollFallback() {
  return (
    <div className="container mx-auto max-w-[1120px] px-4 pb-16 lg:px-6">
      <div className="flex flex-col items-center gap-4 pt-12 pb-7">
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        <div className="h-12 w-[420px] max-w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
      </div>
      <div className="h-9 w-full animate-pulse rounded bg-muted" />
      <div className="mt-8 aspect-[21/9] w-full animate-pulse rounded bg-muted" />
    </div>
  );
}
