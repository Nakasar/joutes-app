/**
 * Import des prix CardNexus, à la main.
 *
 * Le même import passe chaque jour par le cron (`app/api/cron/prices-cardnexus`) ;
 * ce script sert à le lancer hors de ce rythme, à regarder le rapprochement
 * sans rien écrire, ou à passer outre le garde-fou quand il a refusé un import
 * légitime. Le travail lui-même est dans `lib/services/price-imports.ts`.
 * Cf. docs/CARD_PRICES.md.
 *
 * Usage (depuis la racine du dépôt) :
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/prices/import-cardnexus.ts [--game riftbound] [--dry-run] [--sets] [--force]
 *
 * `--conditions=react-server` est nécessaire parce que `lib/mongodb` importe
 * `server-only`, et le hook résout l'alias `@/` de tsconfig.json hors bundler.
 *
 * - `--game <slug>` : jeu à traiter, `riftbound` par défaut ;
 * - `--dry-run` : rapproche et affiche le bilan sans rien écrire en base ;
 * - `--sets` : détaille les extensions, une par ligne, la moins couverte en tête ;
 * - `--force` : écrit même si le nombre de cartes cotées a chuté de plus de
 *   10 % depuis le dernier import (cf. `lib/prices/import-guard.ts`).
 *
 * Variables d'environnement : `MONGODB_URI` et `CARDNEXUS_API_KEY`.
 */
import { importCardnexusPrices } from "../../lib/services/price-imports.ts";

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);

  const result = await importCardnexusPrices({
    slug: argValue(args, "--game") ?? "riftbound",
    apiKey: process.env.CARDNEXUS_API_KEY,
    dryRun: args.includes("--dry-run"),
    verbose: args.includes("--sets"),
    force: args.includes("--force"),
  });

  if (result.status === "rejected") {
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
