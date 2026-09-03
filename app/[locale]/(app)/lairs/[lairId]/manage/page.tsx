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
import { plansFromSubscription, lairHasPro } from "@/lib/subscriptions/access.ts";
import { checkAdmin } from "@/lib/middleware/admin.ts";
import { getLairProGrant } from "@/lib/db/lairs.ts";
import LairProGrantCard from "./LairProGrantCard.tsx";
import PrivateLairInvitationManager from "./PrivateLairInvitationManager.tsx";
import PrivateLairFollowersManager from "./PrivateLairFollowersManager.tsx";
import { getTranslations } from "next-intl/server";
import { getEventsByLairId } from "@/lib/db/events.ts";
import { isLairPro } from "@/lib/lairs/pro.ts";
import ManageTabsBar, { readManageTab } from "./ManageTabsBar.tsx";
import LairCustomizationForm from "./LairCustomizationForm.tsx";
import LairCustomizationSidebar from "./LairCustomizationSidebar.tsx";
import LairNewsEditor from "./LairNewsEditor.tsx";
import { connection } from "next/server";
import { Suspense } from "react";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import LairEventsConnect from "./LairEventsConnect.tsx";
import LairPosterSettings from "./LairPosterSettings.tsx";
import { readPosterOptions } from "@/lib/posters/styles.ts";
import { getLairEventsRefreshReport, getLairEventsSourceRequest } from "@/lib/db/lairs.ts";
import { findManagerSource } from "@/lib/events/connect.ts";

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
  searchParams,
}: {
  params: Promise<{ lairId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6">
        <Suspense fallback={<div className="h-8 w-40 animate-pulse rounded-md bg-muted" aria-hidden />}>
          <BackToLair params={params} />
        </Suspense>
      </div>

      <Suspense fallback={<ManageLairSkeleton />}>
        <ManageLairContent params={params} searchParams={searchParams} />
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

async function ManageLairContent({
  params,
  searchParams,
}: {
  params: Promise<{ lairId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { lairId } = await params;
  const tab = readManageTab((await searchParams).tab);
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
    // Les deux voies composées : un lieu équipé par l'équipe doit ouvrir
    // exactement les mêmes options, sinon l'écran de personnalisation refuserait
    // ce que sa vitrine accorde déjà.
    isPro: await lairHasPro(lairId),
    // Le parrainage seul, pour distinguer les deux voies dans la carte d'équipe.
    isSponsored: plansFromSubscription(sponsor).includes("pro"),
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

  // Les événements à venir, pour le choix de « À la une ». Lus seulement quand
  // l'onglet les demande : c'est une requête de plus sur une page qui en fait
  // déjà cinq, et quatre onglets sur cinq n'en ont aucun usage.
  // `getEventsByLairId` n'applique sa fenêtre de dates que si `month` **et**
  // `year` sont fournis : passer l'année seule ne filtrait rien, et le select
  // listait tout l'historique du lieu, sans ordre. Le tri et la coupe se font
  // donc ici.
  const upcomingEvents =
    tab === "customization"
      ? (await getEventsByLairId(lairId, { gameId: "all" }))
          .filter((event) => event.startDateTime >= new Date().toISOString())
          .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime))
          .slice(0, 50)
          .map((event) => ({ id: event.id, name: event.name, startDateTime: event.startDateTime }))
      : [];

  // La connexion du site du lieu : sa source, le dernier rapport et sa
  // demande d'aide, lus seulement pour l'onglet qui les montre — le rapport et
  // la demande sont hors du lieu à dessein (voir `getLairEventsRefreshReport`).
  const managerSource = tab === "events" ? findManagerSource(lair.eventsSourceUrls) : null;
  const teamSourceCount =
    tab === "events" ? (lair.eventsSourceUrls ?? []).filter((source) => source.managedBy !== "owner").length : 0;
  const refreshReport = tab === "events" ? await getLairEventsRefreshReport(lairId) : null;
  const sourceRequest = tab === "events" ? await getLairEventsSourceRequest(lairId) : null;

  // Le statut d'administrateur, pour la carte d'octroi réservée à l'équipe.
  // L'action serveur refait le contrôle : ceci ne décide que de l'affichage.
  const viewerIsAdmin = tab === "subscription" ? await checkAdmin() : false;

  // Le motif et son auteur ne se lisent que pour l'écran d'équipe, et seulement
  // si c'en est bien un qui regarde.
  const proGrant = viewerIsAdmin ? await getLairProGrant(lairId) : null;

  // Récupérer les abonnés pour les lairs privés
  let followers: User[] = [];
  if (lair.isPrivate) {
    const allFollowers = await getUsersFollowingLair(lairId);
    followers = allFollowers;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-4xl font-bold">{t("manage.title", { name: lair.name })}</h1>
        {lair.isPrivate && (
          <Badge variant="secondary" className="bg-muted">
            <Lock className="h-3 w-3 mr-1" />
            {t("manage.privateBadge")}
          </Badge>
        )}
        {proState.isPro && (
          <Badge variant="outline" className="border-primary/50 font-mono text-[11px] text-primary">
            {t("manage.customization.proBadge")}
          </Badge>
        )}
      </div>

      <ManageTabsBar lairId={lairId} active={tab} />

      {tab === "customization" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <LairCustomizationForm
            lair={lair}
            isPro={proState.isPro}
            upcomingEvents={upcomingEvents}
          />
          <LairCustomizationSidebar lair={lair} isPro={proState.isPro} />
        </div>
      )}

      {tab === "news" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("manage.customization.news.title")}</CardTitle>
            <CardDescription>{t("manage.customization.news.cardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LairNewsEditor lairId={lairId} news={lair.options?.news ?? []} />
          </CardContent>
        </Card>
      )}

      {tab === "events" && (
        <LairEventsConnect
          lairId={lairId}
          address={lair.address}
          isPrivate={Boolean(lair.isPrivate)}
          isPro={proState.isPro}
          userEmail={session?.user?.email ?? undefined}
          source={managerSource}
          frequency={lair.eventsRefreshFrequency ?? "weekly"}
          report={refreshReport}
          teamSourceCount={teamSourceCount}
          games={games.map((game) => ({ name: game.name }))}
          pendingRequest={
            sourceRequest?.status === "pending"
              ? { requestedAt: sourceRequest.requestedAt, ...(sourceRequest.url ? { url: sourceRequest.url } : {}) }
              : null
          }
        />
      )}

      {tab === "poster" && (
        <LairPosterSettings
          lairId={lairId}
          isPro={proState.isPro}
          saved={readPosterOptions(lair.options?.poster, proState.isPro)}
        />
      )}

      <div className="space-y-6">
        {/* Gestion des invitations pour les lairs privés */}
        {tab === "details" && lair.isPrivate && lair.invitationCode && (
          <PrivateLairInvitationManager
            lairId={lairId}
            lairName={lair.name}
            initialInvitationCode={lair.invitationCode}
          />
        )}

        {/* Gestion des abonnés pour les lairs privés */}
        {tab === "details" && lair.isPrivate && (
          <PrivateLairFollowersManager
            lairId={lairId}
            followers={followers}
            owners={owners}
          />
        )}

        {/* Formulaire de modification des détails */}
        {tab === "details" && (
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
        )}

        {/* Gestion des owners */}
        {tab === "owners" && (
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
        )}

        {/* Abonnement Pro */}
        {tab === "subscription" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("manage.pro.title")}</CardTitle>
            <CardDescription>{t("manage.pro.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* `isSponsored` et non `isPro` : cette carte ne parle que du
                siège. Lui passer le Pro composé faisait qu'un lieu équipé par
                l'équipe affichait « Détacher » alors qu'aucun siège n'existe —
                bouton qui échoue —, et privait son gérant du rattachement. */}
            <ProSubscriptionCard
              lairId={lairId}
              isPro={proState.isSponsored}
              attachedByMe={proState.attachedByMe}
              canAttach={proState.canAttach}
              refusal={proState.refusal}
            />
          </CardContent>
        </Card>
        )}

        {/* Réservé à l'équipe : offrir Pro à un lieu qu'aucun abonnement ne
            parraine — boutique partenaire, lieu pilote. */}
        {tab === "subscription" && viewerIsAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>{t("manage.proGrant.title")}</CardTitle>
              <CardDescription>{t("manage.proGrant.cardDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <LairProGrantCard
                lairId={lairId}
                lairName={lair.name}
                grant={proGrant}
                isSponsored={proState.isSponsored}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
