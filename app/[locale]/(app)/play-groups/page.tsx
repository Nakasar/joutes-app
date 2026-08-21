import PlayGroupsPageClient from "@/components/play-groups/PlayGroupsPageClient.tsx";
import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";

export const metadata: Metadata = {
  title: "Groupes de jeu",
  description: "Gérez vos groupes de jeu sur Joutes : partagez collections et wishlists, invitez des membres et organisez vos parties avec votre communauté.",
  keywords: ["groupes de jeu", "collection partagée", "wishlist", "communauté", "jeux de cartes à collectionner"],
  openGraph: {
    url: `https://joutes.app/play-groups`,
    siteName: 'Joutes',
    title: 'Groupes de jeu - Joutes',
    description: "Partagez collections et wishlists, invitez des membres et organisez vos parties avec votre groupe de jeu.",
  },
};

export default async function PlayGroupsPage() {
  const t = await getTranslations("PlayGroups.explore");

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-6">
        {/* Cette page gère *vos* groupes ; le rôle d'armes montre ceux des
            autres. Le lien est ici parce que c'est là qu'on arrive quand on
            cherche un groupe et qu'on n'en a pas encore. */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">Groupes de jeu</h1>
            <p className="text-xl text-muted-foreground">
              Gérez vos groupes, vos invitations et les membres de votre équipe.
            </p>
          </div>

          <Button variant="outline" asChild>
            <Link href="/play-groups/explore">
              <Compass aria-hidden />
              {t("link")}
            </Link>
          </Button>
        </div>
        <PlayGroupsPageClient />
      </div>
    </div>
  );
}
