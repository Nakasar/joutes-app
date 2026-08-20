import { requireAdminOrOwner } from "@/lib/middleware/admin.ts";
import { getLairById } from "@/lib/db/lairs.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { getUserById, getUsersFollowingLair } from "@/lib/db/users.ts";
import { User } from "@/lib/types/User.ts";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation.ts";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import LairDetailsForm from "./LairDetailsForm.tsx";
import OwnersManager from "./OwnersManager.tsx";
import ProSubscriptionCard from "./ProSubscriptionCard.tsx";
import { headers } from "next/headers";
import { auth } from "@/lib/auth.ts";
import { getSubscriptionByUserId, getSubscriptionForLair } from "@/lib/db/subscriptions.ts";
import { canAttachPro } from "@/lib/subscriptions/seats.ts";
import { plansFromSubscription } from "@/lib/subscriptions/access.ts";
import PrivateLairInvitationManager from "./PrivateLairInvitationManager.tsx";
import PrivateLairFollowersManager from "./PrivateLairFollowersManager.tsx";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";

/**
 * Rien de traduit ne reste dans la coquille, et c'est structurel.
 *
 * Le bouton de retour est un `Link` localisé : il lui faut `setRequestLocale`,
 * qui lui-même demande la langue — donc `await params`, une lecture de requête
 * sur une route à segment dynamique. La chaîne se referme : **sur ces routes,
 * rien de localisé ne peut tenir dans la coquille.** Une première version posait
 * le bouton devant et n'obtenait qu'une coquille de 5 Ko, réduite au cadre de
 * l'application.
 *
 * Ce qui reste devant est donc muet : le conteneur et deux silhouettes.
 */
export default function ManageLairPage({
  params,
}: {
  params: Promise<{ lairId: string }>;
}) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6">
        <Suspense fallback={<div className="h-8 w-40 animate-pulse rounded-md bg-muted" aria-hidden />}>
          <BackToLair params={params} />
        </Suspense>
      </div>

      <Suspense fallback={<ManageLairSkeleton />}>
        <ManageLairContent params={params} />
      </Suspense>
    </div>
  );
}

function ManageLairSkeleton() {
  return (
    <div className="space-y-6">
      <div className="mb-8 h-10 w-96 max-w-full animate-pulse rounded bg-muted" aria-hidden />
      <EditorFormSkeleton fields={4} label="Chargement du lieu" />
    </div>
  );
}

async function BackToLair({ params }: { params: Promise<{ lairId: string }> }) {
  const { lairId } = await params;
  const t = await getTranslations("Lairs");

  return (
    <Button variant="secondary" asChild size="sm">
      <Link href={`/lairs/${lairId}`}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t("manage.backToLair")}
      </Link>
    </Button>
  );
}

async function ManageLairContent({ params }: { params: Promise<{ lairId: string }> }) {
  const { lairId } = await params;
  const t = await getTranslations("Lairs");

  // Le pilote Mongo touche à l'horloge en lisant le lieu, ce qu'un prérendu ne
  // sait pas figer, et aucune frontière n'y change rien.
  await connection();

  // Vérifier que l'utilisateur est admin ou owner du lair
  await requireAdminOrOwner(lairId);
  const lair = await getLairById(lairId);

  if (!lair) {
    notFound();
  }

  const games = await readAllGames();

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
    <>
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
    </>
  );
}
