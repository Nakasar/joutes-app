import { useTranslations } from "next-intl";
import { NextPhaseButton } from "../NextPhaseButton";
import { CreateRoundControl } from "./CreateRoundControl";
import { RoundsNav, type RoundsNavPhase } from "./RoundsNav";

/**
 * En-tête commun aux pages de rondes du portail organisateur (liste des rondes
 * et détail d'une ronde) : titre, actions globales (passer à la phase
 * suivante, créer une ronde) et navigation entre toutes les rondes.
 */
export function RoundsHeader({
  tournamentId,
  phases,
  currentRoundId,
}: {
  tournamentId: string;
  phases: RoundsNavPhase[];
  currentRoundId?: string;
}) {
  const t = useTranslations("Tournaments");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-semibold">{t("rounds.title")}</h2>
        <div className="flex flex-wrap items-start justify-end gap-2">
          <NextPhaseButton tournamentId={tournamentId} />
          <CreateRoundControl
            tournamentId={tournamentId}
            phases={phases.map((p) => ({ id: p.phaseId, name: p.phaseName }))}
          />
        </div>
      </div>
      <RoundsNav tournamentId={tournamentId} phases={phases} currentRoundId={currentRoundId} />
    </div>
  );
}
