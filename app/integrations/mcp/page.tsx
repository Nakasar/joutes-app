import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type {Metadata} from "next";

export const metadata: Metadata = {
    title: "Documentation server MCP",
    description: "Un serveur MCP pour intégrer la plateforme Joutes avec vos agents IA.",
    keywords: ["mcp", "model context protocol", "agents ia", "intégration", "intelligence artificielle"],
};

export default function IntegrationsMPCPage() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
            <div className="container mx-auto px-4 max-w-5xl">
                <div className="space-y-8">
                    {/* Header avec retour */}
                    <div className="flex items-center gap-4">
                        <Link href="/integrations">
                            <Button variant="ghost" size="sm">
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Retour
                            </Button>
                        </Link>
                        <div className="flex-1 space-y-2">
                            <h1 className="text-4xl font-bold tracking-tight">MCP Joutes</h1>
                            <p className="text-muted-foreground">
                                Connectez vos agents IA à Joutes pour les questionner sur les règles des jeux et les évènements à venir.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}