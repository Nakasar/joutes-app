import { Suspense } from "react";
import { CollectionSkeleton } from "@/components/CollectionSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSellListForOwner } from "@/lib/db/sell-lists.ts";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Tag } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";

async function MySellListPageContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect("/login");
  }

  const sellList = await getSellListForOwner({ type: "user", id: session.user.id });
  if (sellList) {
    redirect(`/sell-lists/${sellList.id}`);
  }

  const t = await getTranslations("SellLists");

  return (
    <div className="container mx-auto max-w-2xl p-4 sm:p-6">
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <Tag className="size-10 text-muted-foreground" />
          <div className="space-y-1">
            <p className="font-semibold">{t("empty.title")}</p>
            <p className="text-sm text-muted-foreground">{t("empty.description")}</p>
          </div>
          <Button asChild>
            <Link href="/collection">{t("empty.cta")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function MySellListPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-2xl p-4 sm:p-6">
          <CollectionSkeleton tiles={8} label="Chargement de vos listes de vente" />
        </div>
      }
    >
      <MySellListPageContent />
    </Suspense>
  );
}
