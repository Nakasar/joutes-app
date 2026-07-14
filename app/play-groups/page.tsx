import PlayGroupsPageClient from "@/components/play-groups/PlayGroupsPageClient";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

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

export default function PlayGroupsPage() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Groupes de jeu</h1>
          <p className="text-xl text-muted-foreground">
            Gérez vos groupes, vos invitations et les membres de votre équipe.
          </p>
        </div>
        <PlayGroupsPageClient />
      </div>
    </div>
  );
}
