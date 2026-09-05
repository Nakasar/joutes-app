/**
 * Les liens des éditeurs déjà connus, posés sur les jeux existants.
 *
 * Un raccourci, pas une source de vérité : ces liens s'éditent depuis
 * `/admin/games/<jeu>?tab=liens`, et c'est là que vivent ceux qui ne sont pas
 * dans cette table. Le script existe pour ne pas avoir à refaire la saisie sur
 * chaque environnement, et pour que les adresses de départ soient relues en
 * revue plutôt que collées à la main dans une console.
 *
 * **Idempotent, et non destructeur.** Il fusionne : une clé déjà renseignée est
 * remplacée par la valeur d'ici, une clé absente de la table est laissée
 * intacte. Rejouer ne coûte donc rien, et rien n'est jamais effacé.
 *
 * Un jeu que la base ne connaît pas est signalé et sauté : ce script suit le
 * catalogue, il ne le crée pas.
 *
 * Exécution :
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/db/seed-game-links.ts
 *
 * Les deux drapeaux ne sont pas décoratifs, pour les mêmes raisons que
 * `ensure-indexes.ts` : `--conditions=react-server` résout `server-only` vers
 * son module vide, `--import` installe l'alias `@/`.
 *
 * Le lien `youtube` fait en plus autre chose qu'ouvrir une page : c'est la
 * chaîne que le cron horaire interroge pour savoir si l'éditeur diffuse. Voir
 * `docs/GAME_LIVES.md`.
 */

import db from "../../lib/mongodb.ts";

type Seed = {
  /** Le slug du jeu, tel que `/games/<slug>` l'utilise. */
  slug: string;
  links: Record<string, string>;
};

const SEEDS: Seed[] = [
  {
    slug: "riftbound",
    links: {
      youtube: "https://www.youtube.com/@riftbound",
      x: "https://x.com/playriftbound",
      instagram: "https://www.instagram.com/playriftbound/",
      tiktok: "https://www.tiktok.com/@riftbound",
    },
  },
];

async function seedGameLinks() {
  console.log("🚀 Liens des éditeurs...");

  let written = 0;

  for (const { slug, links } of SEEDS) {
    const game = await db.collection("games").findOne({ slug });

    if (!game) {
      console.warn(`  • ${slug} — absent du catalogue, sauté`);
      continue;
    }

    const result = await db.collection("games").updateOne(
      { _id: game._id },
      { $set: Object.fromEntries(Object.entries(links).map(([key, url]) => [`links.${key}`, url])) },
    );

    written += 1;
    console.log(
      `  • ${slug} — ${Object.keys(links).length} lien(s) ${result.modifiedCount > 0 ? "posés" : "déjà à jour"}`,
    );
  }

  console.log(`✅ ${written} jeu(x) traité(s)`);
}

seedGameLinks()
  .then(() => {
    console.log("\n🎉 Terminé");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Échec:", error);
    process.exit(1);
  });
