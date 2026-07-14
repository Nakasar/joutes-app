import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Joutes Discord pour Riftbound | Bot et automatisations",
  description: "Découvrez les fonctionnalités Discord de Joutes pour Riftbound : commandes d’événements, tableaux synchronisés, recherche de cartes et inscriptions directes.",
  keywords: ["discord", "bot discord", "riftbound", "événements", "automatisation"],
  alternates: { canonical: "/games/riftbound/developers/discord" },
  openGraph: {
    url: "https://www.joutes.app/games/riftbound/developers/discord",
    title: "Joutes Discord pour Riftbound",
    description: "Automatisez les échanges autour des événements Riftbound avec le bot Discord de Joutes.",
    type: "website",
  },
};

export default function RiftboundDevelopersDiscordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto px-4 max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/games/riftbound/developers">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour à la documentation
            </Button>
          </Link>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">Discord pour Riftbound</h1>
            <p className="text-muted-foreground">
              Le bot Discord de Joutes facilite la communication autour des événements, la recherche de cartes et la synchronisation de tableaux pour Riftbound.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Événements et tableaux synchronisés
            </CardTitle>
            <CardDescription>
              Affichez rapidement les informations d’un événement, publiez un tableau mis à jour automatiquement et laissez les joueurs s’inscrire depuis Discord.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="list-disc space-y-2 pl-6 text-sm text-muted-foreground">
              <li>Commande d’information pour un événement ou une URL.</li>
              <li>Création d’un tableau Discord synchronisé avec la fiche Joutes.</li>
              <li>Inscriptions directes depuis le tableau pour les comptes liés.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Recherche de cartes
            </CardTitle>
            <CardDescription>
              Interrogez des cartes Riftbound directement depuis votre salon Discord.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Le bot peut retourner les informations essentielles d’une carte, ses erratas et ses rulings pour aider les joueurs à prendre une décision rapidement.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Lier votre compte Joutes
            </CardTitle>
            <CardDescription>
              La liaison de compte est requise pour profiter des inscriptions depuis Discord.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/account/security">Gérer la liaison Discord</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
