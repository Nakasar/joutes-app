import { Suspense } from "react";
import { PlayGroupCollectionSkeleton, PlayGroupToolsRowSkeleton } from "@/components/play-groups/PlayGroupSkeletons.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups.ts";
import { getWishlistsForOwner } from "@/lib/db/wishlists.ts";
import WishlistsClient from "@/app/[locale]/(app)/wishlists/WishlistsClient.tsx";
import { PlayGroupToolsNavBar } from "@/components/play-groups/PlayGroupToolsNavBar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import { ownerHasAdvancedCollection } from "@/lib/db/collection-access.ts";


export async function generateMetadata({
  params,
}: {
  params: Promise<{ playGroupId: string }>;
}): Promise<Metadata> {
  const { playGroupId } = await params;

  // Le pilote Mongo touche à l'horloge en lisant le groupe, ce qu'un prérendu
  // ne sait pas figer, et aucune frontière n'y change rien.
  await connection();
  const t = await getTranslations("Wishlists");
  const session = await auth.api.getSession({ headers: await headers() });
  const group = session?.user?.id ? await getPlayGroupByIdAndUser(playGroupId, session.user.id) : null;

  return {
    title: group ? t("metadataTitleGroup", { group: group.name }) : t("metadata.title"),
  };
}

async function PlayGroupWishlistsPageContent({
  params,
}: {
  params: Promise<{ playGroupId: string }>;
}) {
  const { playGroupId } = await params;

  // Le pilote Mongo touche à l'horloge en lisant le groupe, ce qu'un prérendu
  // ne sait pas figer, et aucune frontière n'y change rien.
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect("/login");
  }

  const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);
  if (!group) {
    notFound();
  }

  const owner = { type: "playGroup", id: group.id } as const;
  const [wishlists, advanced] = await Promise.all([
    getWishlistsForOwner(owner),
    // Un seul membre abonné suffit à ouvrir la gestion avancée au groupe entier.
    ownerHasAdvancedCollection(owner),
  ]);
  const tNav = await getTranslations("PlayGroups.page");
  const member = group.members.find((m) => m.userId === session.user.id);
  const canManageSettings = member?.role === "owner" || member?.role === "admin";

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <div className="flex flex-row flex-wrap justify-between items-center gap-2 mb-4">
        <Button asChild variant="outline">
          <Link href="/play-groups">{tNav("back")}</Link>
        </Button>
        <PlayGroupToolsNavBar playGroupId={group.id} currentTab="wishlists" canManageSettings={canManageSettings} />
      </div>
      <WishlistsClient
        initialWishlists={wishlists}
        apiBasePath={`/api/play-groups/${group.id}/wishlists`}
        advanced={advanced}
      />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte : il faut être membre du groupe. La
 * coquille ne garde donc que le conteneur et la silhouette — le nom du groupe
 * lui-même n'a pas à s'afficher avant que la porte ait répondu.
 */
export default function PlayGroupWishlistsPage(props: Parameters<typeof PlayGroupWishlistsPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <PlayGroupToolsRowSkeleton />
          <PlayGroupCollectionSkeleton tiles={6} label="Chargement des listes d’envies" />
        </div>
      }
    >
      <PlayGroupWishlistsPageContent {...props} />
    </Suspense>
  );
}
