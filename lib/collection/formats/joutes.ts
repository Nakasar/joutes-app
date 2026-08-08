import { parseCsv, toCsv } from "@/lib/csv";
import { createCatalogIndex } from "./catalog";
import {
  parseCondition,
  parseCurrency,
  parseGrade,
  parseLanguageCode,
  parseObtainedAt,
  parsePrice,
  parseQuantity,
  matchPrinting,
  parseBoolean,
} from "./fields";
import type { CollectionFormat, ImportIssue, ImportedEntry } from "./types";

/**
 * Format « Joutes » : le format commun à tous les jeux, qui transporte tout ce
 * que la collection sait d'un exemplaire. C'est le format d'échange entre deux
 * comptes Joutes et le seul aller-retour sans perte.
 */

const HEADERS = [
  "Card ID",
  "Name",
  "Set Code",
  "Collector Number",
  "Printing",
  "Foil",
  "Language",
  "Condition",
  "Grade",
  "Obtained At",
  "Acquisition Price",
  "Acquisition Currency",
  "Quantity",
] as const;

export const joutesFormat: CollectionFormat = {
  id: "joutes",
  label: "Joutes",
  fileSuffix: "joutes",

  toCsv(groups) {
    return toCsv(
      [...HEADERS],
      groups.map((group) => ({
        "Card ID": group.cardId,
        Name: group.name,
        "Set Code": group.setCode,
        "Collector Number": group.collectorNumber,
        Printing: group.printingName ?? "",
        Foil: group.foil ? "true" : "false",
        Language: group.language ?? "",
        Condition: group.condition ?? "",
        Grade: group.grade !== undefined ? String(group.grade) : "",
        "Obtained At": group.obtainedAt ?? "",
        "Acquisition Price": group.acquisitionPrice !== undefined ? String(group.acquisitionPrice) : "",
        "Acquisition Currency": group.acquisitionCurrency ?? "",
        Quantity: String(group.quantity),
      })),
    );
  },

  fromCsv(csv, context) {
    const table = parseCsv(csv);
    const index = createCatalogIndex(context.catalog);
    const entries: ImportedEntry[] = [];
    const issues: ImportIssue[] = [];

    table.rows.forEach((row, position) => {
      const line = table.lineNumbers[position];

      // Trois clés, de la plus sûre à la plus approximative : l'identifiant du
      // catalogue, le tirage, puis le nom — qui ne tranche que s'il ne désigne
      // qu'une seule carte.
      const byName = index.byName(row.Name ?? "");
      const card =
        index.byId(row["Card ID"] ?? "") ??
        index.byPrinting(row["Set Code"] ?? "", row["Collector Number"] ?? "") ??
        (byName.length === 1 ? byName[0] : undefined);

      if (!card) {
        issues.push({
          line,
          message:
            byName.length > 1
              ? `Plusieurs cartes portent le nom « ${row.Name} » : précisez l'extension et le numéro.`
              : `Carte introuvable dans le catalogue : « ${row.Name || row["Card ID"] || "?"} ».`,
        });
        return;
      }

      const quantity = parseQuantity(row.Quantity ?? "");
      if (quantity === null) {
        issues.push({ line, message: `Quantité invalide : « ${row.Quantity} ».` });
        return;
      }

      const printing = matchPrinting(card, row.Printing ?? "");
      const language = parseLanguageCode(row.Language ?? "");
      const condition = parseCondition(row.Condition ?? "");
      const grade = parseGrade(row.Grade ?? "");
      const obtainedAt = parseObtainedAt(row["Obtained At"] ?? "");
      const acquisitionPrice = parsePrice(row["Acquisition Price"] ?? "");
      const acquisitionCurrency = parseCurrency(row["Acquisition Currency"] ?? "");

      entries.push({
        card,
        quantity,
        // Une carte ou une variante qui n'existe qu'en foil l'emporte sur la
        // colonne ; sinon le foil n'est retenu que s'il est affirmé, une valeur
        // illisible ne valant pas « non ».
        foil: printing.foil || card.foil === true || parseBoolean(row.Foil ?? "") === true,
        ...(printing.printingId ? { printingId: printing.printingId } : {}),
        ...(printing.printingName ? { printingName: printing.printingName } : {}),
        ...(language ? { language } : {}),
        ...(condition ? { condition } : {}),
        ...(grade !== undefined ? { grade } : {}),
        ...(obtainedAt ? { obtainedAt } : {}),
        ...(acquisitionPrice !== undefined ? { acquisitionPrice } : {}),
        ...(acquisitionCurrency ? { acquisitionCurrency } : {}),
      });
    });

    return { entries, issues };
  },
};
