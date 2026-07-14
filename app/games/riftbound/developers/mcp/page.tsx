import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bot, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Joutes MCP pour Riftbound | Intégrer les règles et cartes via MCP",
  description: "Découvrez comment utiliser le serveur MCP de Joutes pour Riftbound avec les assistants IA : recherche d’événements, cartes, règles, erratas et plus encore.",
  keywords: ["mcp", "model context protocol", "riftbound", "ia", "agents ia"],
  alternates: { canonical: "/games/riftbound/developers/mcp" },
  openGraph: {
    url: "https://www.joutes.app/games/riftbound/developers/mcp",
    title: "Joutes MCP pour Riftbound",
    description: "Intégrez les données de Riftbound dans vos agents IA grâce au protocole MCP de Joutes.",
    type: "website",
  },
};

export default function RiftboundDevelopersMcpPage() {
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
            <h1 className="text-4xl font-bold tracking-tight">MCP pour Riftbound</h1>
            <p className="text-muted-foreground">
              Connectez vos agents IA à Joutes via le protocole MCP pour interroger les cartes, les règles, les erratas et les événements autour de Riftbound.
            </p>
          </div>
        </div>

        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-background">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Ce que le serveur MCP expose
            </CardTitle>
            <CardDescription>
              Les outils sont pensés pour aider les assistants à répondre rapidement avec des données fiables issues de Joutes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="list-disc space-y-2 pl-6 text-sm text-muted-foreground">
              <li>Recherche d’événements et de lieux de jeu.</li>
              <li>Recherche de cartes et de détails associés.</li>
              <li>Recherche de règles, politiques et textes de tournoi.</li>
              <li>Vote sur les erratas et accès rapide aux règles par identifiant.</li>
              <li>Création et suivi d’événements pour les profils autorisés.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="h-5 w-5" />
              Utilisation rapide
            </CardTitle>
            <CardDescription>
              Le endpoint MCP est disponible sur la route principale du site et accepte une authentification via clé API ou token utilisateur.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Les outils principaux sont déjà exposés dans la route MCP de Joutes, ce qui permet d’utiliser des clients compatibles MCP dans votre environnement d’IA préféré.
            </p>
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="font-mono text-sm">Endpoint MCP : /mcp</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
