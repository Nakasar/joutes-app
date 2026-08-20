import { Suspense } from "react";
import { CollectionSkeleton } from "@/components/CollectionSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import {
  getDefaultWishlistId,
  getWishlistAccess,
  getWishlistById,
  getWishlistItems,
  getWishlistOwnerInfo,
} from "@/lib/db/wishlists.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { getPlayGroupById, isGameEnabledForPlayGroup } from "@/lib/db/play-groups.ts";
import WishlistDetailClient from "./WishlistDetailClient.tsx";
import { ownerHasAdvancedCollection } from "@/lib/db/collection-access.ts";
import { isWishlistReadOnly } from "@/lib/wishlists/limits.ts";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ wishlistId: string }>;
}): Promise<Metadata> {
  // Le pilote Mongo touche à l'horloge en lisant la base, ce qu'un prérendu
  // ne sait pas figer. Les métadonnées s'exécutent hors de la frontière de la
  // page : le déblocage du corps ne les couvre pas.
  await connection();

  const { wishlistId } = await params;
  const t = await getTranslations("Wishlists");
  const wishlist = await getWishlistById(wishlistId);

  if (!wishlist) {
    return { title: t("metadata.notFoundTitle") };
  }

  const ownerInfo = await getWishlistOwnerInfo(wishlist);
  const description = ownerInfo
    ? `Liste de souhaits de ${ownerInfo.label}${wishlist.description ? ` - ${wishlist.description}` : ""}.`
    : wishlist.description;
  const title = t("metadataTitleWishlist", { name: wishlist.name });

  return {
    title,
    description,
    openGraph: { title: `${title} - Joutes`, description },
  };
}

async function WishlistDetailPageContent({
  params,
}: {
  params: Promise<{ wishlistId: string }>;
}) {
  const { wishlistId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });

  const wishlist = await getWishlistById(wishlistId);
  if (!wishlist) {
    notFound();
  }

  const { canView, canEdit } = await getWishlistAccess(wishlist, session?.user?.id);
  if (!canView) {
    notFound();
  }

  const owner = { type: wishlist.ownerType, id: wishlist.ownerId } as const;
  const [initialItems, allGames, ownerInfo, advanced, defaultId] = await Promise.all([
    getWishlistItems(wishlistId, { page: 1, limit: 48, viewerId: session?.user?.id }),
    getAllGames(),
    getWishlistOwnerInfo(wishlist),
    ownerHasAdvancedCollection(owner),
    // L'identifiant résolu, et non `wishlist.isDefault` : ce champ vaut `false`
    // sur les listes créées avant lui, et cette page est atteignable par son URL
    // sans passer par la liste de gestion, donc sans rattrapage préalable. S'y
    // fier afficherait en lecture seule l'unique liste d'un compte ancien.
    getDefaultWishlistId(owner),
  ]);

  // Sans gestion avancée, seule la liste par défaut reste modifiable. On éteint
  // `canEdit` plutôt que d'ajouter une condition partout : tout ce qui écrit sur
  // cet écran en dépend déjà, et le serveur refuserait de toute façon.
  const readOnly = isWishlistReadOnly({ isDefault: defaultId === wishlist.id, advanced });

  // L'explication ne s'adresse qu'à qui aurait pu écrire : un simple visiteur
  // n'a que faire d'une invitation à s'abonner pour une liste qui n'est pas la
  // sienne.
  const showsReadOnlyNotice = canEdit && readOnly;

  let games = allGames;
  if (wishlist.ownerType === "playGroup") {
    const group = await getPlayGroupById(wishlist.ownerId);
    if (group?.enabledGameIds) {
      games = allGames.filter((game) => isGameEnabledForPlayGroup(group, game.id));
    }
  }

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <WishlistDetailClient
        wishlist={wishlist}
        initialItems={initialItems}
        canEdit={canEdit && !readOnly}
        readOnly={showsReadOnlyNotice}
        games={games}
        isLoggedIn={!!session?.user?.id}
        ownerInfo={ownerInfo}
      />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function WishlistDetailPage(props: Parameters<typeof WishlistDetailPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <CollectionSkeleton tiles={8} label="Chargement de la liste d’envies" />
        </div>
      }
    >
      <WishlistDetailPageContent {...props} />
    </Suspense>
  );
}
