import { Suspense } from "react";
import { CollectionSkeleton } from "@/components/CollectionSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getSellListAccess, getSellListById, getSellListItems, getSellListOwnerInfo } from "@/lib/db/sell-lists.ts";
import SellListDetailClient from "../SellListDetailClient.tsx";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sellListId: string }>;
}): Promise<Metadata> {
  const { sellListId } = await params;
  const t = await getTranslations("SellLists");
  const sellList = await getSellListById(sellListId);

  if (!sellList) {
    return { title: t("metadata.notFoundTitle") };
  }

  const ownerInfo = await getSellListOwnerInfo(sellList);
  const description = ownerInfo
    ? `Liste de vente de ${ownerInfo.label}${sellList.description ? ` - ${sellList.description}` : ""}.`
    : sellList.description;
  const title = ownerInfo ? t("metadataTitle", { name: ownerInfo.label }) : t("detail.title");

  return {
    title,
    description,
    openGraph: { title: `${title} - Joutes`, description },
  };
}

async function SellListDetailPageContent({
  params,
}: {
  params: Promise<{ sellListId: string }>;
}) {
  const { sellListId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });

  const sellList = await getSellListById(sellListId);
  if (!sellList) {
    notFound();
  }

  const { canEdit } = await getSellListAccess(sellList, session?.user?.id);

  const [initialItems, ownerInfo, locale] = await Promise.all([
    getSellListItems(sellListId, { page: 1, limit: 48 }),
    getSellListOwnerInfo(sellList),
    getLocale(),
  ]);

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <SellListDetailClient
        sellList={sellList}
        initialItems={initialItems}
        canEdit={canEdit}
        ownerInfo={ownerInfo}
        locale={locale}
      />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function SellListDetailPage(props: Parameters<typeof SellListDetailPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <CollectionSkeleton tiles={8} label="Chargement de la liste de vente" />
        </div>
      }
    >
      <SellListDetailPageContent {...props} />
    </Suspense>
  );
}
