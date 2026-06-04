import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, BotIcon, Key } from "lucide-react";
import Link from "next/link";

export default function IntegrationsPage() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
            <div className="container mx-auto px-4 max-w-5xl">
                <div className="space-y-8">
                    {/* Header avec retour */}
                    <div className="flex items-center gap-4">
                        <Link href="/">
                            <Button variant="ghost" size="sm">
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Retour
                            </Button>
                        </Link>
                        <div className="flex-1 space-y-2">
                            <h1 className="text-4xl font-bold tracking-tight">Intégrations et Développeurs</h1>
                            <p className="text-muted-foreground">
                                Accès aux APIs ouvertes de Joutes.
                            </p>
                        </div>
                    </div>

                    {/* Section API documentation */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Key className="h-5 w-5" />
                                API Documentation
                            </CardTitle>
                            <CardDescription>
                                Découvrez comment intégrer Joutes à vos applications avec notre documentation complète.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="mb-4">
                                Nos APIs ouvertes vous donnent accès de manière programmable aux données hébergées sur Joutes : liste et description des jeux, règles complètes, précis de règles et guides de la communauté, erratas des éléments de jeux et clarification/rulings de la communauté, évènements à venirs et lieux de jeu.
                            </p>
                            <p className="mb-4">
                                Vous pouvez également accéder aux informations des utilisateurs via leur consentement par une authentification OAuth2 ou des clés API personnelles.
                            </p>
                            <Button asChild variant="outline">
                                <Link href="/integrations/api">
                                    Voir la documentation API
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Section MCP */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BotIcon className="h-5 w-5" />
                                MCP (Model Context Protocol)
                            </CardTitle>
                            <CardDescription>
                                Connectez vos agents IA à Joutes pour les questionner sur les règles des jeux et les évènements à venir.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="mb-4">
                                Notre serveur MCP expose les informations de Joutes dans un protocole supporté par les applications d'agents IA. Utilisez les connecteurs personnalisés pour intégrer les données de Joutes dans vos agents et permettre des interactions intelligentes avec les règles de jeux, les erratas, les précises de règles, les évènements à venir et les lieux de jeu.
                            </p>
                            <Button asChild variant="outline">
                                <Link href="/integrations/mcp">
                                    Voir la documentation MCP
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}