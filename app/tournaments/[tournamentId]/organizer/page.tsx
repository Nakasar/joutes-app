import { redirect } from "next/navigation";

export default async function TournamentOrganizerPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  redirect(`/tournaments/${tournamentId}/organizer/settings`);
}
