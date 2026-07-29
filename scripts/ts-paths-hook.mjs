import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

// Résolution des imports TypeScript pour `node --test`.
//
// Le typage est retiré nativement par Node ≥ 22.18, mais deux conventions
// restent des affaires de bundler : l'alias `@/` de tsconfig.json, et les
// imports relatifs sans extension. Une trentaine de lignes ici évitent
// d'ajouter un exécuteur TypeScript aux dépendances du projet.
const ROOT = path.resolve(import.meta.dirname, "..");

// Chemin d'un module TypeScript, en essayant les formes qu'un import sans
// extension peut désigner.
function resolveTsFile(basePath) {
  for (const candidate of [`${basePath}.ts`, `${basePath}.tsx`, path.join(basePath, "index.ts")]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = path.join(ROOT, specifier.slice(2));
      const file = resolveTsFile(base) ?? base;
      return { url: pathToFileURL(file).href, shortCircuit: true };
    }

    if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL) {
      const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
      const file = resolveTsFile(base);
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});
