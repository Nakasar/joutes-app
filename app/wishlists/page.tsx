import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getWishlistsForOwner } from "@/lib/db/wishlists";
import WishlistsClient from "./WishlistsClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Wishlists");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default async function WishlistsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    redirect("/login");
  }

  const wishlists = await getWishlistsForOwner({ type: "user", id: session.user.id });

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <WishlistsClient initialWishlists={wishlists} apiBasePath="/api/wishlists" />
    </div>
  );
}
