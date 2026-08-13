import type { TournamentScenario } from "@/lib/types/Tournament";

/**
 * Saisie d'un pool de scénarios en texte libre : une ligne par scénario, au
 * format « Nom | consignes ». Un éditeur en champ libre reste le plus rapide
 * pour saisir trois missions d'affilée, et se relit d'un coup d'œil.
 *
 * Partagé entre le pool d'une phase et le catalogue d'un jeu (administration) :
 * les deux se saisissent pareil, et une mission recopiée de l'un à l'autre doit
 * se relire à l'identique.
 */
export function scenariosToText(scenarios: TournamentScenario[] | undefined): string {
  return (scenarios ?? [])
    .map((scenario) => (scenario.description ? `${scenario.name} | ${scenario.description}` : scenario.name))
    .join("\n");
}

export function scenariosFromText(text: string): TournamentScenario[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const separator = line.indexOf("|");
      const name = (separator === -1 ? line : line.slice(0, separator)).trim();
      const description = separator === -1 ? undefined : line.slice(separator + 1).trim() || undefined;
      // L'identifiant est dérivé du rang : les rondes déjà créées portent une
      // copie du scénario, elles ne sont donc pas affectées par une renumérotation.
      return { id: `s${index + 1}`, name, description };
    });
}

/** Une ligne de saisie pour ce scénario, telle que l'éditeur la relira. */
export function scenarioToLine(scenario: TournamentScenario): string {
  return scenariosToText([scenario]);
}
