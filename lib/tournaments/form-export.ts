import { buildCsvDocument, formatPlayerLabel } from "@/lib/tournaments/match-export";
import type {
  TournamentForm,
  TournamentFormAnswer,
  TournamentFormField,
  TournamentPlayer,
  TournamentPlayerStatus,
} from "@/lib/types/Tournament";

/**
 * Mise à plat des réponses au formulaire d'inscription, pour la vue d'ensemble
 * de l'organisation et l'export CSV. Les deux partagent la même lecture des
 * réponses : une ligne par joueur, une colonne par question, pour ne pas
 * diverger avec le temps.
 *
 * Module pur : c'est ce qui le rend testable.
 */

export type FormExportPlayer = Pick<
  TournamentPlayer,
  "id" | "displayName" | "discriminator" | "status" | "formAnswers"
>;

/** Une cellule de réponse, telle qu'affichée ou exportée. */
export type FormResponseCell = {
  /** Texte complet de la réponse (une liste de deck entière, par exemple). */
  text: string;
  /**
   * Résumé court pour l'écran : le texte lui-même, sauf pour une liste de deck
   * où il vaut mieux le nombre de cartes que trente lignes dans une cellule.
   */
  summary: string;
  late: boolean;
  /** Avertissements d'arbitrage : cartes non reconnues, bannies, liste non analysée. */
  warnings: string[];
};

export type FormResponseRow = {
  playerId: string;
  /** `pseudo#1234` quand le discriminateur existe. */
  label: string;
  status: TournamentPlayerStatus;
  /** Au moins une réponse enregistrée. */
  answered: boolean;
  /** Dernière mise à jour d'une réponse, pour dater la soumission. */
  answeredAt?: Date;
  /** Au moins une réponse tardive. */
  late: boolean;
  /** Une cellule par champ du formulaire, dans l'ordre du formulaire. */
  cells: FormResponseCell[];
};

export type FormResponseLabels = {
  /** « Cartes : {count} ». */
  decklistCount: (count: number) => string;
  unrecognized: (count: number) => string;
  banned: (count: number) => string;
  parseError: string;
};

/** Le texte complet d'une réponse selon le type du champ. Vide sans réponse. */
export function formAnswerText(field: TournamentFormField, answer: TournamentFormAnswer | undefined): string {
  if (!answer) return "";
  switch (field.type) {
    case "text":
    case "long-text":
      return answer.text?.trim() ?? "";
    case "number":
      return typeof answer.number === "number" && Number.isFinite(answer.number)
        ? String(answer.number)
        : "";
    case "single-choice":
    case "multiple-choice":
      return (answer.choices ?? []).join(", ");
    case "card": {
      const card = answer.card;
      if (!card) return "";
      const reference = [card.setCode, card.collectorNumber].filter(Boolean).join(" ");
      return reference ? `${card.name} (${reference})` : card.name;
    }
    case "decklist":
      return answer.decklist?.input?.trim() ?? "";
  }
}

/** La cellule d'un champ pour un joueur. */
export function formResponseCell(
  field: TournamentFormField,
  answer: TournamentFormAnswer | undefined,
  labels: FormResponseLabels
): FormResponseCell {
  const text = formAnswerText(field, answer);
  const warnings: string[] = [];
  let summary = text;

  if (field.type === "decklist" && answer?.decklist && text) {
    const parsed = answer.decklist.parsed;
    if (parsed) {
      summary = labels.decklistCount(parsed.totalCards);
      if (parsed.unrecognizedCards > 0) warnings.push(labels.unrecognized(parsed.unrecognizedCards));
      if (parsed.bannedCards > 0) warnings.push(labels.banned(parsed.bannedCards));
    } else {
      // Liste non analysée : le nombre de lignes non vides tient lieu de compte.
      const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "").length;
      summary = labels.decklistCount(lines);
      if (answer.decklist.parseError) warnings.push(labels.parseError);
    }
  }

  return { text, summary, late: answer?.late === true && text !== "", warnings };
}

/**
 * Une ligne par joueur, dans l'ordre reçu (celui du tournoi : seed puis
 * inscription). Les joueurs retirés restent : leurs réponses ont pu servir
 * avant leur départ, et l'organisation peut vouloir les relire.
 */
export function buildFormResponseRows(
  form: TournamentForm,
  players: FormExportPlayer[],
  labels: FormResponseLabels
): FormResponseRow[] {
  return players.map((player) => {
    const answers = new Map((player.formAnswers ?? []).map((answer) => [answer.fieldId, answer]));
    const cells = form.fields.map((field) => formResponseCell(field, answers.get(field.id), labels));
    const dates = (player.formAnswers ?? [])
      .map((answer) => answer.updatedAt)
      .filter((date): date is Date => date instanceof Date && !Number.isNaN(date.getTime()));
    const answeredAt =
      dates.length > 0 ? new Date(Math.max(...dates.map((date) => date.getTime()))) : undefined;

    return {
      playerId: player.id,
      label: formatPlayerLabel(player, player.displayName),
      status: player.status,
      answered: cells.some((cell) => cell.text !== ""),
      answeredAt,
      late: cells.some((cell) => cell.late),
      cells,
    };
  });
}

export type FormResponsesCsvLabels = {
  player: string;
  status: string;
  answeredAt: string;
  late: string;
  yes: string;
  no: string;
  statusLabels: Record<TournamentPlayerStatus, string>;
  /** Date déjà mise en forme, dans la langue de l'export. */
  formatDate: (date: Date) => string;
};

/**
 * Les réponses au format CSV : joueur, statut, puis une colonne par question
 * (son libellé en en-tête), la date de dernière réponse et le marqueur de
 * réponse tardive. Le texte complet est exporté — une liste de deck entière
 * tient dans une cellule, c'est ce qu'on veut retrouver dans le tableur.
 */
export function buildFormResponsesCsv(
  form: TournamentForm,
  rows: FormResponseRow[],
  labels: FormResponsesCsvLabels
): string {
  const header = [
    labels.player,
    labels.status,
    ...form.fields.map((field) => field.label),
    labels.answeredAt,
    labels.late,
  ];
  const lines = rows.map((row) => [
    row.label,
    labels.statusLabels[row.status],
    ...row.cells.map((cell) => cell.text),
    row.answeredAt ? labels.formatDate(row.answeredAt) : "",
    row.answered ? (row.late ? labels.yes : labels.no) : "",
  ]);
  return buildCsvDocument([header, ...lines]);
}

/** Nom de fichier sûr, dérivé du nom du tournoi. */
export function buildFormResponsesCsvFileName(tournamentName: string): string {
  const slug = tournamentName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return `${slug || "tournoi"}-reponses.csv`;
}
