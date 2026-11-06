import type { ImportResult } from "./types";

/**
 * Applique les choix faits à la vérification d'un import : chaque ligne
 * ambiguë dont la carte a été choisie parmi ses candidats devient un lot à
 * importer ; les autres restent des lignes écartées.
 *
 * Un choix qui ne figure pas parmi les candidats de la ligne est ignoré : la
 * vérification ne peut pas servir à glisser n'importe quelle carte dans un
 * import.
 */
export function resolveImportIssues(result: ImportResult, resolutions: Record<string, string>): ImportResult {
  const entries = [...result.entries];
  const issues = result.issues.filter((issue) => {
    const chosen = resolutions[String(issue.line)];
    const card = chosen ? issue.candidates?.find((candidate) => candidate.id === chosen) : undefined;
    if (!card || !issue.pending) return true;
    entries.push({ ...issue.pending, card, foil: issue.pending.foil || card.foil === true });
    return false;
  });
  return { entries, issues };
}
