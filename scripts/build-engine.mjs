#!/usr/bin/env node
/*
  Prépare le moteur de jeu pour le serveur.

  Le moteur (dépôt joutes-engine) est livré compilé dans lib/engine/pkg/ : le
  navigateur charge le fichier .wasm par son adresse, mais une fonction serveur
  n'a pas de fichier à lire à côté d'elle une fois déployée. Le binaire est donc
  versé en base64 dans un module TypeScript que le serveur importe
  (lib/engine/wasm.generated.ts, hors de git).

  Lancé avant `next dev` et `next build` (predev, prebuild).

  Pour mettre le moteur à jour : dans joutes-engine, `scripts/build-wasm.sh`,
  puis copier pkg/web/* dans lib/engine/pkg/ et noter le commit dans VERSION.
*/
import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wasm = await readFile(path.join(root, "lib/engine/pkg/joutes_bg.wasm"));
const out = path.join(root, "lib/engine/wasm.generated.ts");

await writeFile(
  out,
  `// Produit par scripts/build-engine.mjs. Ne pas modifier.\nexport const ENGINE_WASM_BASE64 =\n  "${wasm.toString("base64")}";\n`,
);
console.log(`moteur de jeu : ${(wasm.length / 1024).toFixed(0)} Ko → lib/engine/wasm.generated.ts`);
