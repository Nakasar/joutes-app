import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getCollectionOverview } from "@/lib/db/collection";
import CollectionOverview from "./CollectionOverview";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Collection");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    keywords: ["collection de cartes", "suivi de collection", "jeux de cartes à collectionner", "master set", "cartes possédées"],
    openGraph: {
      title: `${t("metadata.title")} - Joutes`,
      description: t("metadata.description"),
    },
  };
}

export default async function CollectionPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    redirect("/login");
  }

  const overview = await getCollectionOverview({ type: "user", id: session.user.id });

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <CollectionOverview initialOverview={overview} />
    </div>
  );
}
