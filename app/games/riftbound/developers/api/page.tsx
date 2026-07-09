import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Joutes API pour Riftbound | Données ouvertes et intégrations",
  description: "Consultez les endpoints API de Joutes pour Riftbound afin d’accéder aux jeux, règles, sets et documentation OpenAPI pour vos intégrations.",
  alternates: { canonical: "/games/riftbound/developers/api" },
  openGraph: {
    url: "https://www.joutes.app/games/riftbound/developers/api",
    title: "Joutes API pour Riftbound",
    description: "Accédez aux données de Riftbound via les endpoints API et la documentation OpenAPI de Joutes.",
    type: "website",
  },
};

export default function RiftboundDevelopersApiPage() {
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
            <h1 className="text-4xl font-bold tracking-tight">API pour Riftbound</h1>
            <p className="text-muted-foreground">
              Récupérez les données de Joutes de manière programmatique pour alimenter vos outils, dashboards ou agents IA autour de Riftbound.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              Endpoints disponibles
            </CardTitle>
            <CardDescription>
              Les routes API de Joutes couvrent les métadonnées de jeu, les règles et les ressources associées.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="list-disc space-y-2 pl-6 text-sm text-muted-foreground">
              <li>Récupération d’un jeu par son slug ou son identifiant.</li>
              <li>Accès aux règles et sets de Riftbound.</li>
              <li>Documentation OpenAPI disponible pour explorer les endpoints.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Authentification
            </CardTitle>
            <CardDescription>
              Certaines intégrations peuvent nécessiter une clé API ou une authentification utilisateur.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Les clés API personnelles vous permettent d’authentifier vos requêtes et de construire des expériences connectées à votre compte Joutes.
            </p>
            <Button asChild>
              <Link href="/account/api-keys">Gérer mes clés API</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
