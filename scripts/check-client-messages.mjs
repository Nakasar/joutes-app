#!/usr/bin/env node
/**
 * Les textes envoyés au navigateur, section par section.
 *
 * Le fournisseur de traductions du layout racine ne reçoit que les espaces de
 * noms communs ; chaque section du site ajoute les siens (`i18n/client-messages.ts`).
 * Un composant client qui lit un espace de noms absent de sa section affiche
 * sa clé au lieu de son texte : ce script suit les imports de chaque section
 * jusqu'aux composants client et vérifie que tout ce qu'ils lisent est déclaré.
 *
 *   node scripts/check-client-messages.mjs           vérifie (sort en erreur)
 *   node scripts/check-client-messages.mjs --print   affiche ce que chaque section lit
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "app", "[locale]", "(app)");
const print = process.argv.includes("--print");

const sources = new Map();
function read(file) {
  if (!sources.has(file)) sources.set(file, fs.readFileSync(file, "utf8"));
  return sources.get(file);
}

const EXTENSIONS = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];
function resolve(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(root, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const importsOf = new Map();
function imports(file) {
  if (importsOf.has(file)) return importsOf.get(file);
  const found = [];
  if (/\.(tsx?|mjs|js)$/.test(file)) {
    const source = read(file);
    const pattern = /(?:import|export)\s+(?!type\s)(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
    for (const match of source.matchAll(pattern)) {
      const target = resolve(file, match[1]);
      if (target) found.push(target);
    }
  }
  importsOf.set(file, found);
  return found;
}

const isClient = (file) => /^\s*(['"])use client\1/m.test(read(file).slice(0, 400));

function namespaces(file) {
  const found = new Set();
  for (const match of read(file).matchAll(/useTranslations\(\s*(?:(['"`])([^'"`]*)\1)?\s*\)/g)) {
    // Sans espace de noms, le composant peut tout lire : aucun tri n'est sûr.
    found.add(match[2] ? match[2].split(".")[0] : "*");
  }
  return found;
}

/** Les espaces de noms lus côté navigateur à partir de ces fichiers. */
function clientNamespaces(entries) {
  const seen = new Set();
  const found = new Map();
  const stack = entries.map((file) => [file, false]);
  while (stack.length) {
    const [file, inClient] = stack.pop();
    if (!/\.(tsx?|mjs|js)$/.test(file)) continue;
    const client = inClient || isClient(file);
    const key = `${client ? "c" : "s"}:${file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (client) {
      for (const name of namespaces(file)) {
        if (!found.has(name)) found.set(name, path.relative(root, file));
      }
    }
    for (const target of imports(file)) stack.push([target, client]);
  }
  return found;
}

function filesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

// La déclaration : deux listes littérales, lues sans exécuter le fichier.
const declaration = read(path.join(root, "i18n", "client-messages.ts"));
function literalList(text) {
  return [...text.matchAll(/["']([A-Za-z0-9_]+)["']/g)].map((match) => match[1]);
}
const sharedBlock = declaration.match(/SHARED_NAMESPACES\s*=\s*\[([^\]]*)\]/);
const sectionsBlock = declaration.match(/SECTION_NAMESPACES\s*=\s*\{([\s\S]*?)\n\}/);
if (!sharedBlock || !sectionsBlock) {
  console.error("i18n/client-messages.ts : SHARED_NAMESPACES ou SECTION_NAMESPACES introuvable.");
  process.exit(1);
}
const shared = new Set(literalList(sharedBlock[1]));
const declared = new Map();
for (const match of sectionsBlock[1].matchAll(/["']?([\w-]+)["']?\s*:\s*\[([^\]]*)\]/g)) {
  declared.set(match[1], new Set(literalList(match[2])));
}

const messages = JSON.parse(read(path.join(root, "messages", "fr.json")));
const weight = (names) =>
  [...names].reduce((sum, name) => sum + (messages[name] ? JSON.stringify(messages[name]).length : 0), 0);

const errors = [];
function check(label, needed, allowed) {
  for (const [name, file] of needed) {
    if (name === "*") {
      errors.push(`${label} : ${file} appelle useTranslations() sans espace de noms.`);
    } else if (!allowed.has(name)) {
      errors.push(`${label} : « ${name} » manque (lu par ${file}).`);
    }
  }
}

// Le cadre : le layout racine et les fichiers posés à côté de lui (erreurs,
// page introuvable). L'accueil a son propre fournisseur, comme une section.
const frameFiles = fs
  .readdirSync(appDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && entry.name !== "page.tsx")
  .map((entry) => path.join(appDir, entry.name));
const frame = clientNamespaces(frameFiles);
check("cadre", frame, shared);
if (print) console.log(`cadre : ${[...frame.keys()].sort().join(", ")}`);

const sections = new Map([["home", [path.join(appDir, "page.tsx"), ...filesUnder(path.join(appDir, "_accueil"))]]]);
for (const entry of fs.readdirSync(appDir, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name !== "_accueil") {
    sections.set(entry.name, filesUnder(path.join(appDir, entry.name)));
  }
}

for (const [section, files] of sections) {
  const needed = clientNamespaces(files);
  const extra = [...needed.keys()].filter((name) => !shared.has(name)).sort();
  const own = declared.get(section);
  if (print) {
    console.log(`${section} : ${extra.join(", ") || "—"} (${weight(extra)} o)`);
  }
  if (extra.length === 0) continue;
  if (!own) {
    errors.push(
      `${section} : aucune entrée dans SECTION_NAMESPACES alors que ses composants lisent ${extra.join(", ")}.`,
    );
    continue;
  }
  check(section, needed, new Set([...shared, ...own]));

  // Déclarer ne suffit pas : il faut que la section pose son fournisseur.
  const holder = section === "home" ? path.join(appDir, "page.tsx") : path.join(appDir, section, "layout.tsx");
  const source = fs.existsSync(holder) ? read(holder) : "";
  if (!new RegExp(`section=["']${section}["']`).test(source)) {
    errors.push(`${section} : ${path.relative(root, holder)} ne rend pas <ClientMessages section="${section}">.`);
  }
}

for (const name of [...shared, ...[...declared.values()].flatMap((set) => [...set])]) {
  if (!(name in messages)) errors.push(`« ${name} » est déclaré mais n'existe pas dans messages/fr.json.`);
}

if (print) console.log(`commun : ${weight(shared)} o sur ${JSON.stringify(messages).length} o`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
if (!print) console.log("Textes du navigateur : chaque section déclare ce que ses composants lisent.");
