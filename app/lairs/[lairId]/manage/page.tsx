import { requireAdmin } from "@/lib/middleware/admin";
import { getLairById } from "@/lib/db/lairs";
import { getAllGames } from "@/lib/db/games";
import { getUserById } from "@/lib/db/users";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import LairDetailsForm from "./LairDetailsForm";
import OwnersManager from "./OwnersManager";

export default async function ManageLairPage({
  params,
}: {
  params: Promise<{ lairId: string }>;
}) {
  // Vérifier que l'utilisateur est admin
  await requireAdmin();

  const { lairId } = await params;
  const lair = await getLairById(lairId);

  if (!lair) {
    notFound();
  }

  // Récupérer tous les jeux disponibles
  const games = await getAllGames();

  // Récupérer les détails des owners
  const ownersDetails = await Promise.all(
    lair.owners.map(async (ownerId) => {
      const user = await getUserById(ownerId);
      return user;
    })
  );
  const owners = ownersDetails.filter((owner): owner is NonNullable<typeof owner> => owner !== null);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6">
        <Button variant="secondary" asChild size="sm">
          <Link href={`/lairs/${lairId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour au lieu
          </Link>
        </Button>
      </div>

      <h1 className="text-4xl font-bold mb-8">Gérer {lair.name}</h1>

      <div className="space-y-6">
        {/* Formulaire de modification des détails */}
        <Card>
          <CardHeader>
            <CardTitle>Informations du lieu</CardTitle>
            <CardDescription>
              Modifiez le nom, la bannière et les jeux disponibles dans ce lieu
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LairDetailsForm lair={lair} games={games} />
          </CardContent>
        </Card>

        {/* Gestion des owners */}
        <Card>
          <CardHeader>
            <CardTitle>Propriétaires</CardTitle>
            <CardDescription>
              Gérez les personnes qui peuvent administrer ce lieu
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OwnersManager lairId={lairId} owners={owners} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
