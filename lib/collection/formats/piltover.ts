import { parseCsv, toCsv } from "@/lib/csv";
import { createCatalogIndex } from "./catalog";
import { parseCondition, parseGrade, parseQuantity, parseBoolean } from "./fields";
import { MAX_IMPORT_CANDIDATES } from "./types";
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
const FOIL_SUFFIX = "foil";

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
 * Découpe un « Variant Number » en extension, numéro et indicateur foil.
 * Piltover l'écrit `OGN-001`, `OGN-126b`, `UNL-T05`, et y accroche parfois un
 * suffixe de tirage : `-Foil`, mais aussi `-Nexus`, `-Release`, `-Prerift`,
 * `-promo`… Le numéro est donc le dernier segment qui porte un chiffre : ce qui
 * précède est l'extension, ce qui suit décrit le tirage. Joutes n'ayant pas de
 * fiche pour ces promos, elles retombent sur la carte de base.
 */
export function parseVariantNumber(value: string): {
  setCode: string;
  collectorNumber: string;
  foil: boolean;
} {
  const segments = value.trim().split("-").filter(Boolean);
  let numberAt = -1;
  for (let at = segments.length - 1; at >= 0; at--) {
    if (/\d/.test(segments[at])) {
      numberAt = at;
      break;
    }
  }
  // Sans chiffre nulle part, on garde l'ancienne lecture : le dernier tiret sépare.
  if (numberAt === -1) numberAt = segments.length - 1;

  const suffixes = segments.slice(numberAt + 1).map((segment) => segment.toLowerCase());
  return {
    setCode: segments.slice(0, Math.max(numberAt, 0)).join("-"),
    collectorNumber: segments[numberAt] ?? "",
    foil: suffixes.includes(FOIL_SUFFIX),
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
      // « Set Prefix » d'abord, puis l'extension du numéro de variante : pour
      // les promos, Piltover écrit `OGN-NN` dans la colonne et `OGN-126b` dans
      // le numéro, et seule la seconde existe au catalogue.
      const setPrefix = (row["Set Prefix"] ?? "").trim();

      const name = row["Card Name"] ?? "";
      const byName = index.byName(name);
      const card =
        index.byPrinting(setPrefix, variant.collectorNumber) ??
        index.byPrinting(variant.setCode, variant.collectorNumber) ??
        (byName.length === 1 ? byName[0] : undefined);

      if (!card) {
        const quantity = parseQuantity(row.Quantity ?? "");
        const ambiguous = byName.length > 1 && quantity !== null;
        const language = LANGUAGE_CODES[(row.Language ?? "").trim().toLowerCase()];
        const condition = parseCondition(row.Condition ?? "");
        const grade = parseGrade(row["Grading Value"] ?? "");
        issues.push({
          line,
          label: [name, row["Variant Number"]].filter(Boolean).join(" · ") || undefined,
          message:
            byName.length > 1
              ? row["Variant Number"]
                ? `Plusieurs cartes portent le nom « ${name} » : le numéro de variante « ${row["Variant Number"]} » n'a pas été reconnu.`
                : `Plusieurs cartes portent le nom « ${name} » et la ligne n'a pas de numéro de variante.`
              : `Carte introuvable dans le catalogue : « ${name || row["Variant Number"] || "?"} ».`,
          ...(ambiguous
            ? {
                candidates: byName.slice(0, MAX_IMPORT_CANDIDATES),
                pending: {
                  quantity,
                  foil: parseBoolean(row.Foil ?? "") ?? variant.foil,
                  ...(language ? { language } : {}),
                  ...(condition ? { condition } : {}),
                  ...(grade !== undefined ? { grade } : {}),
                },
              }
            : {}),
        });
        return;
      }

      const quantity = parseQuantity(row.Quantity ?? "");
      if (quantity === null) {
        issues.push({ line, message: `Quantité invalide : « ${row.Quantity} ».` });
        return;
      }

      // La colonne « Foil » prime sur le suffixe du numéro de variante, mais
      // seulement si elle est lisible : sinon c'est le suffixe qui tranche. Une
      // carte qui n'existe qu'en foil l'emporte sur les deux.
      const foilColumn = parseBoolean(row.Foil ?? "");
      const foil = card.foil === true || (foilColumn ?? variant.foil);

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
