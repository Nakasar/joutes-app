import { gameSupportsDecklistParsing } from "@/lib/tournaments/decklist-parsing";
import { FormBuilder } from "../FormBuilder";
import { loadOrganizerContext } from "../organizerContext";

export default async function OrganizerFormPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const { tournament } = await loadOrganizerContext(tournamentId);

  const decklistSupported = await gameSupportsDecklistParsing(tournament.gameId);

  return (
    <div className="p-6">
      <FormBuilder
        tournamentId={tournamentId}
        initialForm={tournament.registrationForm ?? null}
        decklistSupported={decklistSupported}
        hasGame={!!tournament.gameId}
      />
    </div>
  );
}
