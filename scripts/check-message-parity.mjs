/**
 * Les quatre fichiers de messages portent-ils les mêmes clés ?
 *
 * `next-intl` lit un fichier par langue : une clé ajoutée au français et
 * oubliée ailleurs ne se voit qu'en changeant de langue, et se voit alors sous
 * la forme du nom de la clé au milieu de la page. Ce contrôle-là ne coûte rien
 * et remplace la relecture croisée de quatre fichiers de deux cent mille
 * caractères.
 *
 * Sort en erreur s'il trouve un écart. `node scripts/check-message-parity.mjs`
 */

import { readFileSync } from "node:fs";

const LOCALES = ["fr", "en", "it", "de"];
const REFERENCE = "fr";

/** Toutes les clés d'un objet, à plat : « Users.profile.tabs.showcase ». */
function flatten(value, prefix = "") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

const keysByLocale = new Map(
  LOCALES.map((locale) => [
    locale,
    new Set(flatten(JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")))),
  ]),
);

const reference = keysByLocale.get(REFERENCE);
let failures = 0;

for (const locale of LOCALES) {
  if (locale === REFERENCE) continue;

  const keys = keysByLocale.get(locale);
  const missing = [...reference].filter((key) => !keys.has(key));
  const extra = [...keys].filter((key) => !reference.has(key));

  for (const key of missing) {
    console.error(`messages/${locale}.json : « ${key} » manque`);
    failures += 1;
  }
  for (const key of extra) {
    console.error(`messages/${locale}.json : « ${key} » n'existe pas en ${REFERENCE}`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`\n${failures} écart(s) entre les fichiers de messages.`);
  process.exit(1);
}

console.log(`✅ Les ${LOCALES.length} fichiers de messages portent les mêmes clés.`);
