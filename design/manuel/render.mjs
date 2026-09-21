/**
 * Rend les illustrations du manuel utilisateur (espace Notion « Joutes » > « Manuel »).
 *
 *   node design/manuel/render.mjs            # tout
 *   node design/manuel/render.mjs ecrans     # les seules maquettes d'écrans
 *   node design/manuel/render.mjs affiches   # les seuls styles d'affiche
 *   node design/manuel/render.mjs vitrine organizer   # des écrans nommés
 *
 * Les PNG sortent dans `design/manuel/rendu/`, qui n'est pas versionné : ce sont
 * les sources qu'on garde, pas les images. Elles sont ensuite déposées à la main
 * dans les pages Notion correspondantes.
 *
 * Prérequis : `npm i -D playwright` (ou un Chromium déjà installé, dont le chemin
 * se passe par CHROMIUM_PATH).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ECRANS = path.join(HERE, "ecrans");
const AFFICHES = path.join(HERE, "..", "affiche-evenements");
const OUT = path.join(HERE, "rendu");
const TMP = path.join(OUT, ".tmp");

/**
 * Les maquettes d'écrans. La largeur est celle du viewport ; la hauteur suit le
 * contenu, puisqu'on capture l'élément `.screen` et non la fenêtre.
 */
const ECRANS_JOBS = [
  ["vitrine", 1280, "3 · La page de votre lieu — la vitrine publique"],
  ["manage", 1180, "3 · La page de votre lieu — l'écran de gestion"],
  ["connect", 940, "4 · Vos événements — connecter l'agenda de son site"],
  ["event", 880, "4 · Vos événements — le formulaire de création"],
  ["players", 1060, "5 · Les inscriptions — la page Joueurs"],
  ["wizard", 960, "6 · Vos tournois — le tunnel de création"],
  ["organizer", 1320, "6 · Vos tournois — le portail organisateur"],
  ["standings", 1060, "6 · Vos tournois — le classement"],
  ["projection", 1280, "6 · Vos tournois — l'écran de salle"],
  ["player", 390, "6 · Vos tournois — le portail joueur"],
  ["league", 1100, "7 · Vos ligues — une ligue au format points"],
];

/**
 * Les sept styles d'affiche, rendus depuis les maquettes de
 * `design/affiche-evenements/`. Ces fichiers sont des canvas Claude Design : leur
 * élément racine porte `class="{{modes}}"`, que l'outil de conception remplit au
 * chargement. Hors de cet outil il faut le poser soi-même, sans quoi la feuille
 * de style ne s'applique à rien et la page sort en texte brut.
 */
const AFFICHES_JOBS = [
  ["Main", "joutes"],
  ["Affichage", "cork"],
  ["JoutesMedievales", "tournoi"],
  ["Cyberpunk", "cyber"],
  ["Taverne", "tav"],
  ["ScienceFiction", "sf"],
  ["Grimoire", "grim"],
];

const A4 = { width: 794, height: 1123 }; // 210 × 297 mm à 96 dpi

function nettoyerCanvas(html, modes) {
  return html
    .replace('<script src="./support.js"></script>', "")
    // Les polices Google ne sont pas joignables hors ligne ; la chaîne de repli
    // du style prend le relais. Les laisser ne ferait qu'ajouter un délai.
    .replace(/<link rel="stylesheet" href="https:\/\/fonts[^>]*>/g, "")
    .replace("{{modes}}", modes)
    .replace(/<\/?(x-dc|helmet)>/g, "");
}

async function rendreEcrans(browser, noms) {
  const jobs = noms.length
    ? ECRANS_JOBS.filter(([nom]) => noms.includes(nom))
    : ECRANS_JOBS;

  for (const [nom, largeur, legende] of jobs) {
    const ctx = await browser.newContext({
      viewport: { width: largeur, height: 900 },
      deviceScaleFactor: 2,
      locale: "fr-FR",
    });
    const page = await ctx.newPage();
    await page.goto("file://" + path.join(ECRANS, `${nom}.html`), { waitUntil: "load" });
    await page.waitForTimeout(400);
    const cible = await page.$(".screen");
    if (!cible) throw new Error(`${nom}.html : aucun élément .screen à capturer`);
    const fichier = path.join(OUT, `ecran-${nom}.png`);
    await cible.screenshot({ path: fichier });
    console.log(`✓ ${path.basename(fichier)} — ${legende}`);
    await ctx.close();
  }
}

async function rendreAffiches(browser) {
  fs.mkdirSync(TMP, { recursive: true });
  // Les maquettes référencent leurs images en relatif : elles doivent voisiner
  // avec le HTML réécrit.
  for (const f of fs.readdirSync(AFFICHES)) {
    if (/\.(png|jpe?g|svg|webp)$/i.test(f)) {
      fs.copyFileSync(path.join(AFFICHES, f), path.join(TMP, f));
    }
  }

  const ctx = await browser.newContext({
    viewport: A4,
    deviceScaleFactor: 2,
    locale: "fr-FR",
  });
  const page = await ctx.newPage();

  for (const [source, cle] of AFFICHES_JOBS) {
    const html = nettoyerCanvas(
      fs.readFileSync(path.join(AFFICHES, `${source}.dc.html`), "utf8"),
      `poster ${cle} jeux-logos`,
    );
    const tmp = path.join(TMP, `${source}.html`);
    fs.writeFileSync(tmp, html);
    await page.goto("file://" + tmp, { waitUntil: "load" });
    await page.waitForTimeout(500);
    const cible = await page.$(".poster");
    if (!cible) throw new Error(`${source}.dc.html : aucun élément .poster à capturer`);
    const fichier = path.join(OUT, `affiche-${cle}.png`);
    await cible.screenshot({ path: fichier });
    console.log(`✓ ${path.basename(fichier)} — style « ${cle} »`);
  }

  await ctx.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}

const args = process.argv.slice(2);
const toutFaire = args.length === 0;
const veutEcrans = toutFaire || args.includes("ecrans");
const veutAffiches = toutFaire || args.includes("affiches");
const ecransNommes = args.filter((a) => ECRANS_JOBS.some(([nom]) => nom === a));

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});

if (veutEcrans || ecransNommes.length) await rendreEcrans(browser, ecransNommes);
if (veutAffiches) await rendreAffiches(browser);

await browser.close();
console.log(`\nRendu dans ${path.relative(process.cwd(), OUT)}/`);
