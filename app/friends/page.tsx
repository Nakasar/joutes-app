import FriendsPageClient from "@/components/friends/FriendsPageClient";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes amis",
  description: "Gérez votre liste d'amis sur Joutes : envoyez des demandes d'ami et retrouvez vos amis facilement.",
  keywords: ["amis", "liste d'amis", "communauté", "jeux de cartes à collectionner"],
  openGraph: {
    url: `https://joutes.app/friends`,
    siteName: 'Joutes',
    title: 'Mes amis - Joutes',
    description: "Envoyez des demandes d'ami et retrouvez vos amis facilement.",
  },
};

export default function FriendsPage() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Mes amis</h1>
          <p className="text-xl text-muted-foreground">
            Gérez vos amis et vos demandes d&apos;ami.
          </p>
        </div>
        <FriendsPageClient />
      </div>
    </div>
  );
}
