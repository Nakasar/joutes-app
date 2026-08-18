#!/usr/bin/env node
/**
 * Lit ce que contient réellement la coquille statique d'une route.
 *
 * Le glyphe de la table des routes dit qu'une coquille existe, pas ce qu'il y a
 * dedans : une frontière `<Suspense>` posée trop haut passe la validation en ne
 * prérendant que `<html><body>`. Le build écrit ses coquilles dans
 * `.next/server/app/**.html` — ce script en extrait le texte visible.
 *
 *   node scripts/inspect-shells.mjs /fr/about /fr/cgu
 *   node scripts/inspect-shells.mjs            # toutes les coquilles
 *
 * Un fichier vide (0 octet) n'est pas une coquille vide : c'est l'absence de
 * coquille, la route rendant entièrement à la requête. La distinction est tout
 * l'enjeu, d'où deux verdicts séparés.
 *
 * À lancer après `next build`.
 */
import fs from "fs";
import path from "path";

const ROOT = ".next/server/app";

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

if (!fs.existsSync(ROOT)) {
  console.error(`${ROOT} est absent : lancer \`next build\` d'abord.`);
  process.exit(1);
}

const args = process.argv.slice(2);
const files = args.length
  ? args.map((r) => path.join(ROOT, r.replace(/^\//, "") + ".html"))
  : fs
      .readdirSync(ROOT, { recursive: true })
      .filter((f) => f.endsWith(".html"))
      .map((f) => path.join(ROOT, f))
      .sort();

let empty = 0;
for (const file of files) {
  const route = file.replace(ROOT, "").replace(/\.html$/, "");

  if (!fs.existsSync(file)) {
    console.log(`${route}\n   AUCUNE coquille (fichier absent)`);
    continue;
  }
  const raw = fs.readFileSync(file, "utf8");
  if (raw.length === 0) {
    console.log(`${route}\n   AUCUNE coquille — la route rend à la requête`);
    continue;
  }

  const text = visibleText(raw);
  if (text.length === 0) {
    // Next marque ainsi les routes qui redirigent ou renvoient `notFound` au
    // prérendu. Elles n'ont rien à afficher par construction : leur coquille
    // sans contenu est correcte, pas le symptôme d'une frontière mal posée.
    if (raw.includes('id="__next_error__"')) {
      console.log(`${route}\n   sans contenu, à raison — la route redirige ou renvoie notFound`);
      continue;
    }
    empty += 1;
    console.log(`${route}\n   ⚠ COQUILLE VIDE : préfabriquée, mais sans contenu visible`);
    continue;
  }
  console.log(`${route}\n   ${text.length} caractères visibles`);
  console.log(`   « ${text.slice(0, 140)}${text.length > 140 ? "…" : ""} »`);
}

if (empty > 0) {
  console.error(`\n${empty} coquille(s) vide(s) : validation verte pour un bénéfice nul.`);
  process.exit(1);
}
