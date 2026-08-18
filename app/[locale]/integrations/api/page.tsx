import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { setRequestLocale } from "next-intl/server";
import ApiDocsViewer from "./ApiDocsViewer";
import type {Metadata} from "next";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
    title: "Documentation développeurs et API",
    description: "Intégrer Joutes dans vos propres applications avec notre API ouverte.",
    keywords: ["api", "développeurs", "intégration", "openapi", "données ouvertes"],
    openGraph: {
        title: "Documentation développeurs et API - Joutes",
        description: "Intégrer Joutes dans vos propres applications avec notre API ouverte.",
    },
};

export default async function IntegrationsAPIPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Fixe la langue pour cette page : sans cet appel, le `Link` localisé la lit
  // à la requête et fait basculer toute la route en rendu dynamique.
  const { locale } = await params;
  setRequestLocale(locale);

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
                            <h1 className="text-4xl font-bold tracking-tight">API Joutes</h1>
                            <p className="text-muted-foreground">
                                Accès aux APIs ouvertes de Joutes.
                            </p>
                        </div>
                    </div>

                    <ApiDocsViewer />
                </div>
            </div>
        </div>
    );
}