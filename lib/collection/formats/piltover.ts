import { parseCsv, toCsv } from "@/lib/csv";
import { createCatalogIndex } from "./catalog";
import { parseCondition, parseGrade, parseQuantity, parseBoolean } from "./fields";
import type { CollectionFormat, CollectionLanguage, ImportIssue, ImportedEntry } from "./types";

/**
 * Format « Piltover Archive » : l'export de collection du site du même nom,
 * repris colonne pour colonne pour qu'un fichier passe de l'un à l'autre sans
 * retouche.
 *
 * Il ne transporte ni date d'acquisition ni prix : ces colonnes de la
 * collection Joutes sont perdues à l'export, et absentes à l'import. Sa notion
 * de gradation est plus riche que la nôtre (organisme, note, mention) — seule
 * la note numérique a un équivalent.
 */

const HEADERS = [
  "Variant Number",
  "Card Name",
  "Set",
  "Set Prefix",
  "Rarity",
  "Variant Type",
  "Variant Label",
  "Foil",
  "Quantity",
  "Language",
  "Condition",
  "Grading Company",
  "Grading Value",
  "Grading Label",
  "Notes",
] as const;

/** Suffixe que Piltover ajoute au numéro de variante d'un tirage foil. */
const FOIL_SUFFIX = "-foil";

const LANGUAGE_NAMES: Record<CollectionLanguage, string> = {
  EN: "English",
  FR: "French",
  IT: "Italian",
  ZH: "Chinese",
  JA: "Japanese",
  KO: "Korean",
};

const LANGUAGE_CODES: Record<string, CollectionLanguage> = Object.fromEntries(
  Object.entries(LANGUAGE_NAMES).map(([code, name]) => [name.toLowerCase(), code as CollectionLanguage]),
);

/**
 * Découpe un « Variant Number » (`OGN-001`, `OGN-001-Foil`) en extension,
 * numéro et indicateur foil. Le suffixe foil est retiré d'abord, sans quoi il
 * passerait pour une partie du numéro.
 */
export function parseVariantNumber(value: string): {
  setCode: string;
  collectorNumber: string;
  foil: boolean;
} {
  let rest = value.trim();
  let foil = false;

  if (rest.toLowerCase().endsWith(FOIL_SUFFIX)) {
    rest = rest.slice(0, -FOIL_SUFFIX.length);
    foil = true;
  }

  const separator = rest.lastIndexOf("-");
  if (separator === -1) {
    return { setCode: "", collectorNumber: rest, foil };
  }

  return {
    setCode: rest.slice(0, separator),
    collectorNumber: rest.slice(separator + 1),
    foil,
  };
}

export const piltoverFormat: CollectionFormat = {
  id: "piltover-archive",
  label: "Piltover Archive",
  gameSlugs: ["riftbound"],
  fileSuffix: "piltover-archive",

  toCsv(groups, context) {
    return toCsv(
      [...HEADERS],
      groups.map((group) => {
        const variantType = group.printingName ?? "Standard";
        return {
          "Variant Number": `${group.setCode}-${group.collectorNumber}${group.foil ? "-Foil" : ""}`,
          "Card Name": group.name,
          Set: context.setNames[group.setCode] ?? group.setCode,
          "Set Prefix": group.setCode,
          Rarity: group.rarity ?? "",
          "Variant Type": variantType,
          "Variant Label": group.foil ? "Foil" : variantType,
          Foil: group.foil ? "true" : "false",
          Quantity: String(group.quantity),
          Language: group.language ? LANGUAGE_NAMES[group.language] : "",
          Condition: group.condition ?? "",
          // Joutes ne retient qu'une note numérique : l'organisme et la mention
          // n'ont pas d'équivalent à remplir.
          "Grading Company": "",
          "Grading Value": group.grade !== undefined ? String(group.grade) : "",
          "Grading Label": "",
          Notes: "",
        };
      }),
    );
  },

  fromCsv(csv, context) {
    const table = parseCsv(csv);
    const index = createCatalogIndex(context.catalog);
    const entries: ImportedEntry[] = [];
    const issues: ImportIssue[] = [];

    table.rows.forEach((row, position) => {
      const line = table.lineNumbers[position];
      const variant = parseVariantNumber(row["Variant Number"] ?? "");
      // « Set Prefix » fait foi quand il est renseigné : le numéro de variante
      // peut porter un préfixe abrégé, la colonne dédiée non.
      const setCode = (row["Set Prefix"] ?? "").trim() || variant.setCode;

      const name = row["Card Name"] ?? "";
      const byName = index.byName(name);
      const card =
        index.byPrinting(setCode, variant.collectorNumber) ??
        (byName.length === 1 ? byName[0] : undefined);

      if (!card) {
        issues.push({
          line,
          message:
            byName.length > 1
              ? `Plusieurs cartes portent le nom « ${name} » : le numéro de variante « ${row["Variant Number"]} » n'a pas été reconnu.`
              : `Carte introuvable dans le catalogue : « ${name || row["Variant Number"] || "?"} ».`,
        });
        return;
      }

      const quantity = parseQuantity(row.Quantity ?? "");
      if (quantity === null) {
        issues.push({ line, message: `Quantité invalide : « ${row.Quantity} ».` });
        return;
      }

      // La colonne « Foil » prime sur le suffixe du numéro de variante ; une
      // carte qui n'existe qu'en foil l'emporte sur les deux.
      const foilColumn = (row.Foil ?? "").trim();
      const foil = card.foil || (foilColumn ? parseBoolean(foilColumn) : variant.foil);

      const language = LANGUAGE_CODES[(row.Language ?? "").trim().toLowerCase()];
      const condition = parseCondition(row.Condition ?? "");
      const grade = parseGrade(row["Grading Value"] ?? "");

      entries.push({
        card,
        quantity,
        foil,
        ...(language ? { language } : {}),
        ...(condition ? { condition } : {}),
        ...(grade !== undefined ? { grade } : {}),
      });
    });

    return { entries, issues };
  },
};
