import { Suspense } from "react";
import { gameSupportsDecklistParsing } from "@/lib/tournaments/decklist-parsing.ts";
import { FormBuilder } from "../FormBuilder.tsx";
import { loadOrganizerContext } from "../organizerContext.ts";

import { CardSectionSkeleton } from "../OrganizerSkeletons.tsx";

type Params = Promise<{ tournamentId: string }>;

export default function OrganizerFormPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="p-6"><CardSectionSkeleton cards={2} /></div>}>
      <OrganizerFormPageSection params={params} />
    </Suspense>
  );
}

async function OrganizerFormPageSection({ params }: { params: Params }) {
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
