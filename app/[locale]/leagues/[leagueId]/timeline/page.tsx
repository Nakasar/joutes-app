import { getLeagueById, getLeagueParticipant, isLeagueOrganizer } from "@/lib/db/leagues";
import { getLeagueTimeline } from "@/lib/leagues/timeline-data";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import LeagueTimelineClient from "./LeagueTimelineClient";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type LeagueTimelinePageProps = {
  params: Promise<{ leagueId: string }>;
};

export async function generateMetadata({ params }: LeagueTimelinePageProps): Promise<Metadata> {
  const { leagueId } = await params;
  const league = await getLeagueById(leagueId);

  if (!league) {
    return { title: "Timeline introuvable" };
  }

  return {
    title: `${league.name} - Timeline`,
    description: `Les tournois de la ligue ${league.name}, du plus récent au plus ancien`,
  };
}

export default async function LeagueTimelinePage({ params }: LeagueTimelinePageProps) {
  const { leagueId } = await params;

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
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/leagues/${leagueId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour à la ligue
          </Link>
        </Button>
      </div>

      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
        <p className="text-sm text-muted-foreground">{league.name}</p>
      </div>

      <LeagueTimelineClient groups={groups} canManage={canManage} leagueId={leagueId} />
    </div>
  );
}
