import Link from "next/link";
import {Button} from "@/components/ui/button";
import {ArrowLeft, Key} from "lucide-react";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {AddPassKeyButton} from "@/app/account/security/components";

export default async function AccountSecurity() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const passKeys = await auth.api.listPasskeys({
    headers: await headers(),
  });

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
              <h1 className="text-4xl font-bold tracking-tight">Sécurité</h1>
              <p className="text-muted-foreground">
                Configurez la sécurité de votre compte.
              </p>
            </div>
          </div>

          {/* Section API Keys et MCP */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Clés de connexion (PassKeys)
              </CardTitle>
              <CardDescription>
                Gérez vos clés de connexion WebAuthN/PassKeys pour une authentification sécurisée et sans mot de passe rapide sur vos appareils.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AddPassKeyButton />
              {passKeys.map((key, index) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between border-b py-4 last:border-0"
                >
                  <div>
                    <p className="font-medium">{key.name || `Clé ${index + 1}`}</p>
                    <p className="text-sm text-muted-foreground">
                      Enregistrée le {new Date(key.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button variant="destructive" size="sm">
                    Supprimer
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}