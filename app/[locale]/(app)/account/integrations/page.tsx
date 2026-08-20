import { AccountPanelSkeleton } from "@/components/AccountPanelSkeleton.tsx";
import { Suspense } from "react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ApiKeysManager from "../ApiKeysManager.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Key, ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";

async function IntegrationsPageContent() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="space-y-8">
          {/* Header avec retour */}
          <div className="flex items-center gap-4">
            <Link href="/account">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour
              </Button>
            </Link>
            <div className="flex-1 space-y-2">
              <h1 className="text-4xl font-bold tracking-tight">Intégrations</h1>
              <p className="text-muted-foreground">
                Configurez vos intégrations et accès API
              </p>
            </div>
          </div>

          {/* Section API Keys et MCP */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Clés API et MCP
              </CardTitle>
              <CardDescription>
                Gérez vos clés d&apos;API pour accéder aux services externes et configurer Model Context Protocol
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ApiKeysManager />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte, titre compris : on ne montre pas la
 * mise en page d'un espace personnel avant de savoir à qui il appartient. La
 * coquille ne garde que le conteneur et la silhouette.
 */
export default function IntegrationsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
          <AccountPanelSkeleton cards={1} label="Chargement des intégrations" />
        </div>
    </div>
      }
    >
      <IntegrationsPageContent />
    </Suspense>
  );
}
