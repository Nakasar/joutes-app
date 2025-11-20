import { requireAdminOrOwner } from "@/lib/middleware/admin";
import { getLairById } from "@/lib/db/lairs";
import { getAllGames } from "@/lib/db/games";
import { getUserById } from "@/lib/db/users";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import LairDetailsForm from "./LairDetailsForm";
import OwnersManager from "./OwnersManager";
import PrivateLairInvitationManager from "./PrivateLairInvitationManager";

export default async function ManageLairPage({
  params,
}: {
  params: Promise<{ lairId: string }>;
}) {
  const { lairId } = await params;
  
  // Vérifier que l'utilisateur est admin ou owner du lair
  await requireAdminOrOwner(lairId);
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

      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-4xl font-bold">Gérer {lair.name}</h1>
        {lair.isPrivate && (
          <Badge variant="secondary" className="bg-muted">
            <Lock className="h-3 w-3 mr-1" />
            Privé
          </Badge>
        )}
      </div>

      <div className="space-y-6">
        {/* Gestion des invitations pour les lairs privés */}
        {lair.isPrivate && lair.invitationCode && (
          <PrivateLairInvitationManager
            lairId={lairId}
            lairName={lair.name}
            initialInvitationCode={lair.invitationCode}
          />
        )}
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
