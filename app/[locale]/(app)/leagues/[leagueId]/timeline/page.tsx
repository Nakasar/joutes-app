import { getLeagueById, getLeagueParticipant, isLeagueOrganizer } from "@/lib/db/leagues.ts";
import { getLeagueTimeline } from "@/lib/leagues/timeline-data.ts";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation.ts";
import { Metadata } from "next";
import { Button } from "@/components/ui/button.tsx";
import { ArrowLeft } from "lucide-react";
import LeagueTimelineClient from "./LeagueTimelineClient.tsx";

type LeagueTimelinePageProps = {
  params: Promise<{ leagueId: string }>;
};

export async function generateMetadata({ params }: LeagueTimelinePageProps): Promise<Metadata> {
  const { leagueId } = await params;

  // Même piège Mongo que dans le corps, à désarmer une seconde fois : les
  // métadonnées s'exécutent hors de la frontière de la page, avec leur propre
  // lecture de la ligue.
  await connection();

  const league = await getLeagueById(leagueId);

  if (!league) {
    return { title: "Timeline introuvable" };
  }

  return {
    title: `${league.name} - Timeline`,
    description: `Les tournois de la ligue ${league.name}, du plus récent au plus ancien`,
  };
}

/**
 * Deux frontières : le retour et le titre ne tiennent qu'à l'identifiant de la
 * ligue, la chronologie demande en plus la session — une ligue privée ne
 * s'ouvre qu'à ses participants.
 *
 * Le nom de la ligue descend avec la chronologie plutôt que de rester dans
 * l'en-tête : c'est une donnée, et la porte doit répondre avant qu'on la
 * montre.
 */
export default function LeagueTimelinePage({ params }: LeagueTimelinePageProps) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Suspense fallback={<BackToLeagueSkeleton />}>
          <BackToLeague params={params} />
        </Suspense>
      </div>

      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
      </div>

      <Suspense fallback={<TimelineSkeleton />}>
        <Timeline params={params} />
      </Suspense>
    </div>
  );
}

function BackToLeagueSkeleton() {
  return <div className="h-8 w-40 animate-pulse rounded-md bg-muted" aria-hidden />;
}

function TimelineSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="-mt-6 mb-8 h-5 w-56 rounded bg-muted/60" />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="space-y-3">
          <div className="h-5 w-32 rounded bg-muted" />
          <div className="h-24 rounded-xl border bg-card" />
        </div>
      ))}
    </div>
  );
}

async function BackToLeague({ params }: LeagueTimelinePageProps) {
  const { leagueId } = await params;

  return (
    <Button variant="ghost" size="sm" asChild>
      <Link href={`/leagues/${leagueId}`}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Retour à la ligue
      </Link>
    </Button>
  );
}

async function Timeline({ params }: LeagueTimelinePageProps) {
  const { leagueId } = await params;

  // Le pilote Mongo touche à l'horloge en lisant la ligue, ce qu'un prérendu ne
  // sait pas figer, et aucune frontière n'y change rien.
  await connection();

  const league = await getLeagueById(leagueId);
  if (!league) {
    notFound();
  }

  const session = await auth.api.getSession({ headers: await headers() });

  const leagueParticipant = session?.user?.id
    ? await getLeagueParticipant(league.id, session.user.id)
    : null;
  const canManage = session?.user?.id
    ? await isLeagueOrganizer(leagueId, session.user.id)
    : false;

  // Même porte que le reste de la ligue : une ligue privée ne s'ouvre qu'à ses
  // participants et à son organisation.
  if (!league.isPublic && !leagueParticipant && !canManage) {
    notFound();
  }

  const groups = await getLeagueTimeline(leagueId);

  return (
    <>
      <p className="-mt-6 mb-8 text-sm text-muted-foreground">{league.name}</p>
      <LeagueTimelineClient groups={groups} canManage={canManage} leagueId={leagueId} />
    </>
  );
}
