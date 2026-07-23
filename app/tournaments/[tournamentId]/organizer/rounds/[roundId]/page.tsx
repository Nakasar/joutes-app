import { redirect } from "next/navigation";

// La ronde s'ouvre par défaut sur la sous-page des matchs.
export default async function OrganizerRoundPage({
  params,
}: {
  params: Promise<{ tournamentId: string; roundId: string }>;
}) {
  const { tournamentId, roundId } = await params;
  redirect(`/tournaments/${tournamentId}/organizer/rounds/${roundId}/matches`);
}
