/**
 * Import des prix Cardmarket, à la main.
 *
 * Le même import passe chaque jour par le cron (`app/api/cron/prices-cardmarket`) ;
 * ce script sert à le lancer hors de ce rythme, à regarder le rapprochement
 * sans rien écrire, ou à passer outre le garde-fou quand il a refusé un import
 * légitime. Le travail lui-même est dans `lib/services/price-imports.ts`.
 * Cf. docs/CARD_PRICES.md.
 *
 * Usage (depuis la racine du dépôt) :
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/prices/import-cardmarket.ts [--game fab] [--dry-run] [--expansions] [--force]
 *
 * `--conditions=react-server` est nécessaire parce que `lib/mongodb` importe
 * `server-only`, et le hook résout l'alias `@/` de tsconfig.json hors bundler.
 *
 * - `--game <slug>` : jeu à traiter, `fab` par défaut ;
 * - `--dry-run` : rapproche et affiche le bilan sans rien écrire en base ;
 * - `--expansions` : détaille la correspondance déduite entre les extensions
 *   de Cardmarket et les nôtres, extension par extension ;
 * - `--force` : écrit même si le nombre de cartes cotées a chuté de plus de
 *   10 % depuis le dernier import (cf. `lib/prices/import-guard.ts`).
 *
 * Variable d'environnement : `MONGODB_URI`.
 */
import { importCardmarketPrices } from "../../lib/services/price-imports.ts";

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);

  const result = await importCardmarketPrices({
    slug: argValue(args, "--game") ?? "fab",
    dryRun: args.includes("--dry-run"),
    verbose: args.includes("--expansions"),
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
