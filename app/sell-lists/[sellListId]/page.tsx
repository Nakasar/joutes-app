import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getSellListAccess, getSellListById, getSellListItems, getSellListOwnerInfo } from "@/lib/db/sell-lists";
import SellListDetailClient from "../SellListDetailClient";

export const dynamic = "force-dynamic";

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

export default async function SellListDetailPage({
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
