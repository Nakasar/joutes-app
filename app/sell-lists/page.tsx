import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSellListForOwner } from "@/lib/db/sell-lists";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag } from "lucide-react";
import Link from "next/link";

export default async function MySellListPage() {
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
