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
  puis copier pkg/web/* dans lib/engine/pkg/, pkg/swu/* dans lib/engine/swu/pkg/ et
  pkg/cyberpunk/* dans lib/engine/cyberpunk/pkg/,
  et noter le commit dans le fichier VERSION de chacun.
*/
import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Un paquet par jeu : Riftbound (pkg/web du moteur), Star Wars: Unlimited (pkg/swu)
// et Cyberpunk TCG (pkg/cyberpunk).
const engines = [
  { wasm: "lib/engine/pkg/joutes_bg.wasm", out: "lib/engine/wasm.generated.ts", name: "ENGINE_WASM_BASE64" },
  { wasm: "lib/engine/swu/pkg/joutes_swu_bg.wasm", out: "lib/engine/swu/wasm.generated.ts", name: "SWU_WASM_BASE64" },
  {
    wasm: "lib/engine/cyberpunk/pkg/joutes_cyberpunk_bg.wasm",
    out: "lib/engine/cyberpunk/wasm.generated.ts",
    name: "CP_WASM_BASE64",
  },
];

for (const engine of engines) {
  const wasm = await readFile(path.join(root, engine.wasm));
  await writeFile(
    path.join(root, engine.out),
    `// Produit par scripts/build-engine.mjs. Ne pas modifier.\nexport const ${engine.name} =\n  "${wasm.toString("base64")}";\n`,
  );
  console.log(`moteur de jeu : ${(wasm.length / 1024).toFixed(0)} Ko → ${engine.out}`);
}
