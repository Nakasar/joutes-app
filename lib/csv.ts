/**
 * Lecture et écriture de CSV, suivant RFC 4180.
 *
 * Les fichiers manipulés ici viennent d'outils tiers ou y retournent : découper
 * sur les virgules ne suffit pas, un nom de carte ou une note peut contenir une
 * virgule, un guillemet ou un retour à la ligne. Tout passe donc par ce module
 * plutôt que par un `split` au cas par cas.
 */

/** Une valeur n'est mise entre guillemets que si elle en a besoin. */
function escapeField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Sérialise des lignes en CSV. Les en-têtes donnent l'ordre des colonnes ; une
 * clé absente d'une ligne devient une cellule vide.
 */
export function toCsv(headers: string[], rows: Record<string, string>[]): string {
  const lines = [headers.map(escapeField).join(",")];

  for (const row of rows) {
    lines.push(headers.map((header) => escapeField(row[header] ?? "")).join(","));
  }

  // Terminaison CRLF : c'est ce qu'attendent les tableurs sous Windows, et les
  // autres s'en accommodent.
  return lines.join("\r\n") + "\r\n";
}

/**
 * Découpe un CSV en lignes de cellules brutes. Les lignes entièrement vides
 * sont ignorées — un fichier se termine presque toujours par un saut de ligne,
 * et les tableurs en ajoutent volontiers d'autres.
 */
export function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = "";
    started = false;
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell.length > 0)) rows.push(row);
    row = [];
  };

  // Le BOM d'un fichier produit par Excel se retrouverait sinon collé au nom de
  // la première colonne, qui ne correspondrait plus à rien.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && !started) {
      quoted = true;
      started = true;
    } else if (char === ",") {
      endField();
    } else if (char === "\n") {
      endRow();
    } else if (char === "\r") {
      // Fin de ligne CRLF : le \n qui suit fait le travail.
      if (text[i + 1] !== "\n") endRow();
    } else {
      field += char;
      started = true;
    }
  }

  if (field.length > 0 || row.length > 0) endRow();

  return rows;
}

export type CsvTable = {
  headers: string[];
  /** Une entrée par ligne de données, indexée par en-tête. */
  rows: Record<string, string>[];
  /**
   * Numéro de ligne dans le fichier pour chaque entrée de `rows` (1 = en-tête),
   * afin de situer une erreur d'import là où l'utilisateur la lira.
   */
  lineNumbers: number[];
};

/**
 * Lit un CSV à en-tête. Les valeurs sont détourées : les exports tiers alignent
 * parfois leurs colonnes avec des espaces.
 */
export function parseCsv(input: string): CsvTable {
  const raw = parseCsvRows(input);
  if (raw.length === 0) {
    return { headers: [], rows: [], lineNumbers: [] };
  }

  const headers = raw[0].map((header) => header.trim());
  const rows: Record<string, string>[] = [];
  const lineNumbers: number[] = [];

  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i];
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? "").trim();
    });
    rows.push(row);
    lineNumbers.push(i + 1);
  }

  return { headers, rows, lineNumbers };
}
