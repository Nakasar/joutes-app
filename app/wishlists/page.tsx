import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getWishlistsForOwner } from "@/lib/db/wishlists";
import WishlistsClient from "./WishlistsClient";
import { ownerHasAdvancedCollection } from "@/lib/db/collection-access";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Wishlists");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    keywords: ["wishlist", "liste de souhaits", "cartes recherchées", "échange de cartes", "jeux de cartes à collectionner"],
    openGraph: {
      title: `${t("metadata.title")} - Joutes`,
      description: t("metadata.description"),
    },
  };
}

export default async function WishlistsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    redirect("/login");
  }

  const owner = { type: "user", id: session.user.id } as const;
  const [wishlists, advanced] = await Promise.all([
    getWishlistsForOwner(owner),
    ownerHasAdvancedCollection(owner),
  ]);

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <WishlistsClient initialWishlists={wishlists} apiBasePath="/api/wishlists" advanced={advanced} />
    </div>
  );
}
