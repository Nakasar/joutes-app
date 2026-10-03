/**
 * Pose tous les index de la base : `npm run indexes`.
 *
 * Les définitions vivent dans `lib/db/indexes/registry.ts`, chacune avec la
 * requête qu'elle sert. Le script est **idempotent** et **additif** :
 *
 * - un index déjà là — même clés, mêmes options, quel que soit son nom — est
 *   laissé tel quel ; rejouer le script ne coûte que quelques lectures ;
 * - rien n'est jamais supprimé. Un index de mêmes clés mais d'autres options
 *   est signalé comme conflit, à régler à la main ;
 * - un échec (des doublons sous un index unique, typiquement) n'arrête pas les
 *   suivants. Le script sort en erreur à la fin s'il y en a eu, avec la liste.
 *
 * Options :
 *
 *   npm run indexes -- --dry-run      liste ce qui serait créé, sans rien écrire
 *   npm run indexes -- --undeclared   liste aussi les index présents en base
 *                                     mais absents du registre
 *
 * La base visée est celle de `MONGODB_URI`, lue dans l'environnement ou dans
 * `.env.local` / `.env`. Vérifiez-la avant de lancer.
 *
 * Sur une grosse collection, la création d'un index lit toute la collection ;
 * MongoDB (≥ 4.2) ne la verrouille qu'au début et à la fin, les lectures et
 * écritures continuent pendant ce temps.
 */

import db from "../../lib/mongodb.ts";
import { ensureIndexes, undeclaredIndexes } from "../../lib/db/indexes/ensure.ts";
import { INDEXES } from "../../lib/db/indexes/registry.ts";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const listUndeclared = args.has("--undeclared");

function describeTarget(): string {
  try {
    const url = new URL(process.env.MONGODB_URI ?? "");
    return `${url.host}${url.pathname}`;
  } catch {
    return "(MONGODB_URI illisible)";
  }
}

async function main(): Promise<number> {
  console.log(`🚀 Index de ${describeTarget()}${dryRun ? " — à blanc, rien ne sera écrit" : ""}\n`);

  const outcomes = await ensureIndexes(db, INDEXES, { dryRun });

  let created = 0;
  let present = 0;
  const problems: string[] = [];

  for (const outcome of outcomes) {
    const { collection, why } = outcome.definition;
    switch (outcome.status) {
      case "created":
        created++;
        console.log(`  ➕ ${collection}.${outcome.name} — ${why}`);
        break;
      case "present":
        present++;
        break;
      case "conflict":
        problems.push(
          `${collection}.${outcome.name} existe avec d'autres options ` +
            `(${JSON.stringify(outcome.existing)}) ; attendu ${JSON.stringify(outcome.definition.options ?? {})}`
        );
        break;
      case "failed":
        problems.push(`${collection} ${JSON.stringify(outcome.definition.keys)} : ${outcome.error}`);
        break;
    }
  }

  console.log(`\n${dryRun ? "À créer" : "Créés"} : ${created} · déjà en place : ${present} · problèmes : ${problems.length}`);

  if (listUndeclared) {
    const undeclared = await undeclaredIndexes(db, INDEXES);
    console.log(`\nIndex présents en base mais absents du registre : ${undeclared.length}`);
    for (const { collection, name, key } of undeclared) {
      console.log(`  • ${collection}.${name} ${JSON.stringify(key)}`);
    }
  }

  if (problems.length > 0) {
    console.error("\n❌ À régler à la main :");
    for (const problem of problems) console.error(`  • ${problem}`);
    return 1;
  }

  console.log("\n🎉 Index en place");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("\n❌ La pose des index a échoué:", error);
    process.exit(1);
  });
