import { requireAdminOrOwner } from "@/lib/middleware/admin";
import { getLairById } from "@/lib/db/lairs";
import { getAllGames } from "@/lib/db/games";
import { getUserById, getUsersFollowingLair } from "@/lib/db/users";
import { User } from "@/lib/types/User";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import LairDetailsForm from "./LairDetailsForm";
import OwnersManager from "./OwnersManager";
import ProSubscriptionCard from "./ProSubscriptionCard";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSubscriptionByUserId, getSubscriptionForLair } from "@/lib/db/subscriptions";
import { canAttachPro } from "@/lib/subscriptions/seats";
import { plansFromSubscription } from "@/lib/subscriptions/access";
import PrivateLairInvitationManager from "./PrivateLairInvitationManager";
import PrivateLairFollowersManager from "./PrivateLairFollowersManager";
import { getTranslations } from "next-intl/server";

export default async function ManageLairPage({
  params,
}: {
  params: Promise<{ lairId: string }>;
}) {
  const t = await getTranslations("Lairs");
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

  // État Pro du lieu : dérivé de l'abonnement qui détient son siège, jamais
  // stocké sur le lieu. C'est ce qui fait qu'un abonnement éteint retire le
  // statut au rendu suivant, sans révocation à écrire.
  const session = await auth.api.getSession({ headers: await headers() });
  const sponsor = await getSubscriptionForLair(lairId);
  const mySubscription = session?.user?.id ? await getSubscriptionByUserId(session.user.id) : null;
  const proState = {
    // Les paliers composés, et non `sponsor.plans` : un lieu parrainé par
    // quelqu'un dont le Pro a été offert par l'équipe est un lieu Pro.
    isPro: plansFromSubscription(sponsor).includes("pro"),
    attachedByMe: Boolean(
      session?.user?.id && sponsor?.seats.some((seat) => seat.attachedBy === session.user.id)
    ),
    ...(() => {
      const check = canAttachPro({
        // Idem pour le sien : lire le champ brut annonçait « pas d'abonnement »
        // à qui en avait reçu un de l'équipe.
        plans: plansFromSubscription(mySubscription),
        seats: mySubscription?.seats ?? [],
        lair,
      });
      return { canAttach: check.ok, refusal: check.ok ? null : check.reason };
    })(),
  };

  // Récupérer les abonnés pour les lairs privés
  let followers: User[] = [];
  if (lair.isPrivate) {
    const allFollowers = await getUsersFollowingLair(lairId);
    followers = allFollowers;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6">
        <Button variant="secondary" asChild size="sm">
          <Link href={`/lairs/${lairId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("manage.backToLair")}
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-4xl font-bold">{t("manage.title", { name: lair.name })}</h1>
        {lair.isPrivate && (
          <Badge variant="secondary" className="bg-muted">
            <Lock className="h-3 w-3 mr-1" />
            {t("manage.privateBadge")}
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

        {/* Gestion des abonnés pour les lairs privés */}
        {lair.isPrivate && (
          <PrivateLairFollowersManager
            lairId={lairId}
            followers={followers}
            owners={owners}
          />
        )}

        {/* Formulaire de modification des détails */}
        <Card>
          <CardHeader>
            <CardTitle>{t("manage.detailsTitle")}</CardTitle>
            <CardDescription>
              {t("manage.detailsDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LairDetailsForm lair={lair} games={games} />
          </CardContent>
        </Card>

        {/* Gestion des owners */}
        <Card>
          <CardHeader>
            <CardTitle>{t("manage.ownersTitle")}</CardTitle>
            <CardDescription>
              {t("manage.ownersDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OwnersManager lairId={lairId} owners={owners} />
          </CardContent>
        </Card>

        {/* Abonnement Pro */}
        <Card>
          <CardHeader>
            <CardTitle>{t("manage.pro.title")}</CardTitle>
            <CardDescription>{t("manage.pro.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ProSubscriptionCard
              lairId={lairId}
              isPro={proState.isPro}
              attachedByMe={proState.attachedByMe}
              canAttach={proState.canAttach}
              refusal={proState.refusal}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
