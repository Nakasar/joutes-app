import { Card, CardContent } from "@/components/ui/card";
import { UserIcon } from "lucide-react";
import Link from "next/link";

export default function UserNotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="flex justify-center mb-4">
              <UserIcon className="h-16 w-16 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Utilisateur non trouvé</h1>
            <p className="text-muted-foreground mb-6">
              L&apos;utilisateur que vous recherchez n&apos;existe pas ou a été supprimé.
            </p>
            <Link 
              href="/"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              Retour à l&apos;accueil
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
