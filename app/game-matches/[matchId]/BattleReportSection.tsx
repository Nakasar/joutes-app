"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Swords, Trophy } from "lucide-react";
import ArmyListEditor from "@/components/battle-reports/ArmyListEditor";
import { MAX_NOTES_LENGTH, MAX_SCENARIO_LENGTH, countArmyUnits } from "@/lib/battle-reports/army";
import type { BattleReport, BattleReportArmy, GameMatchPlayer } from "@/lib/types/Match";
import { updateBattleReportAction, updateBattleReportArmyAction } from "../actions";

/**
 * Volet « rapport de bataille » d'une partie.
 *
 * Les droits d'écriture y sont volontairement dissymétriques, et pour deux
 * raisons différentes :
 *
 *  - **le scénario et les notes n'appartiennent qu'au créateur.** Ce sont les
 *    deux seuls champs partagés de la fiche : deux joueurs qui les écriraient en
 *    même temps s'effaceraient l'un l'autre sans le voir.
 *  - **chacun tient sa propre liste d'armée**, le créateur pouvant tenir celles
 *    des autres — c'est souvent lui qui remplit le rapport pour toute la table.
 */
export default function BattleReportSection({
  matchId,
  gameId,
  report,
  players,
  winnerIds,
  currentUserId,
  isCreator,
}: {
  matchId: string;
  gameId: string;
  report: BattleReport;
  players: GameMatchPlayer[];
  winnerIds: string[];
  currentUserId: string;
  isCreator: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [scenario, setScenario] = useState(report.scenario ?? "");
  const [notes, setNotes] = useState(report.notes ?? "");

  /** Liste en cours d'édition ; `null` quand tout le monde est en lecture. */
  const [editedPlayerId, setEditedPlayerId] = useState<string | null>(null);
  const [draftArmy, setDraftArmy] = useState<BattleReportArmy>({ units: [] });

  const isDirty = scenario !== (report.scenario ?? "") || notes !== (report.notes ?? "");

  const handleSaveReport = () => {
    setError(null);
    // L'enregistrement débarrasse les champs de leurs espaces. Envoyer la saisie
    // brute puis garder celle-ci à l'écran laisserait le formulaire « modifié »
    // juste après avoir été enregistré, et afficherait autre chose que la base.
    const trimmedScenario = scenario.trim();
    const trimmedNotes = notes.trim();

    startTransition(async () => {
      const result = await updateBattleReportAction(matchId, {
        scenario: trimmedScenario,
        notes: trimmedNotes,
      });
      if (result.success) {
        setScenario(trimmedScenario);
        setNotes(trimmedNotes);
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de la mise à jour du rapport");
      }
    });
  };

  const startEditingArmy = (playerId: string) => {
    setError(null);
    setEditedPlayerId(playerId);
    setDraftArmy(report.armies?.[playerId] ?? { units: [] });
  };

  const handleSaveArmy = (playerId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await updateBattleReportArmyAction(matchId, playerId, draftArmy);
      if (result.success) {
        setEditedPlayerId(null);
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de la mise à jour de la liste d'armée");
      }
    });
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Rapport de bataille</h2>
        </div>

        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Scénario */}
        <div className="space-y-2">
          <label htmlFor="battle-report-scenario" className="text-sm font-medium">
            Scénario
          </label>
          {isCreator ? (
            <Input
              id="battle-report-scenario"
              type="text"
              value={scenario}
              maxLength={MAX_SCENARIO_LENGTH}
              disabled={isPending}
              placeholder="Ex. : Prise de position"
              onChange={(event) => setScenario(event.target.value)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {report.scenario || "Aucun scénario renseigné"}
            </p>
          )}
        </div>

        {/* Fiche de notes */}
        <div className="space-y-2">
          <label htmlFor="battle-report-notes" className="text-sm font-medium">
            Notes
          </label>
          {isCreator ? (
            <Textarea
              id="battle-report-notes"
              value={notes}
              rows={8}
              maxLength={MAX_NOTES_LENGTH}
              disabled={isPending}
              placeholder="Le déroulé de la partie, les moments marquants, ce qu'il faudra retenir pour la prochaine fois…"
              onChange={(event) => setNotes(event.target.value)}
            />
          ) : report.notes ? (
            // Les notes sont saisies au fil de la plume : leurs retours à la
            // ligne font le récit, et les perdre le rendrait illisible.
            <p className="text-sm whitespace-pre-wrap">{report.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune note pour le moment</p>
          )}
        </div>

        {isCreator && (
          <div className="flex justify-end">
            <Button onClick={handleSaveReport} disabled={isPending || !isDirty}>
              {isPending ? "Enregistrement..." : "Enregistrer le rapport"}
            </Button>
          </div>
        )}

        {/* Listes d'armée */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Listes d&apos;armée</h3>

          {players.map((player) => {
            const army = report.armies?.[player.userId];
            const canEdit = isCreator || player.userId === currentUserId;
            const isEditing = editedPlayerId === player.userId;
            const total = army ? countArmyUnits(army) : 0;

            return (
              <div key={player.userId} className="p-3 border rounded-lg bg-muted/50 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="secondary" className="text-sm">
                      {player.username}
                    </Badge>
                    {winnerIds.includes(player.userId) && (
                      <span title="Vainqueur">
                        <Trophy className="h-4 w-4 text-amber-600" />
                      </span>
                    )}
                    {army?.name && (
                      <span className="truncate text-sm text-muted-foreground">{army.name}</span>
                    )}
                  </div>

                  {canEdit && !isEditing && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 shrink-0"
                      disabled={isPending}
                      onClick={() => startEditingArmy(player.userId)}
                    >
                      <Pencil className="h-4 w-4" />
                      {army ? "Modifier" : "Ajouter"}
                    </Button>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-3">
                    <ArmyListEditor
                      gameId={gameId}
                      idPrefix={`army-${player.userId}`}
                      army={draftArmy}
                      onChange={setDraftArmy}
                      disabled={isPending}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={isPending}
                        onClick={() => setEditedPlayerId(null)}
                      >
                        Annuler
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={isPending}
                        onClick={() => handleSaveArmy(player.userId)}
                      >
                        {isPending ? "Enregistrement..." : "Enregistrer la liste"}
                      </Button>
                    </div>
                  </div>
                ) : army && army.units.length > 0 ? (
                  <div className="space-y-1">
                    <ul className="space-y-1">
                      {army.units.map((unit, index) => (
                        <li
                          key={`${unit.productId ?? "libre"}-${unit.name}-${index}`}
                          className="text-sm flex items-center gap-2"
                        >
                          <span className="w-8 shrink-0 text-muted-foreground tabular-nums">
                            {unit.quantity}×
                          </span>
                          <span className="min-w-0 truncate">{unit.name}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {total} figurine{total === 1 ? "" : "s"}
                    </p>
                  </div>
                ) : (
                  !army?.name && (
                    <p className="text-xs text-muted-foreground">Aucune liste d&apos;armée</p>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
