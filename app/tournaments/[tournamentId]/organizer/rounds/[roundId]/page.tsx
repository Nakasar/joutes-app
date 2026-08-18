import { redirect } from "next/navigation";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// La ronde s'ouvre par défaut sur la sous-page des matchs.
export default async function OrganizerRoundPage({
  params,
}: {
  params: Promise<{ tournamentId: string; roundId: string }>;
}) {
  const { tournamentId, roundId } = await params;
  redirect(`/tournaments/${tournamentId}/organizer/rounds/${roundId}/matches`);
}
