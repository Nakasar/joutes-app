import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getTournamentById,
  isTournamentOrganizer,
  listAnnouncements,
} from "@/lib/db/tournaments";
import { OrganizerShell } from "../OrganizerShell";
import { AnnouncementsManager } from "../AnnouncementsManager";
import { TimerManager } from "../TimerManager";

export default async function OrganizerLivePage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const tournament = await getTournamentById(tournamentId);
  if (!tournament) notFound();
  if (!isTournamentOrganizer(tournament, session.user.id)) redirect("/tournaments");

  const announcements = await listAnnouncements(tournamentId);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <OrganizerShell tournamentId={tournamentId} tournamentName={tournament.name} active="live">
        <div className="space-y-6">
          <TimerManager tournamentId={tournamentId} />
          <AnnouncementsManager tournamentId={tournamentId} initialAnnouncements={announcements} />
        </div>
      </OrganizerShell>
    </div>
  );
}
