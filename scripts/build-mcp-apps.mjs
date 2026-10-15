#!/usr/bin/env node
/*
  Empaquette les vues MCP App (mcp-apps/) en une page HTML autonome chacune.

  Un client MCP affiche une vue dans un cadre isolé, à partir du seul HTML que
  lui renvoie la ressource `ui://…` : scripts et styles doivent y être en
  ligne. Chaque vue est donc compilée (esbuild pour le script, Tailwind pour
  les styles) puis versée dans un module TypeScript que le serveur MCP importe
  (app/mcp/apps/*.generated.ts, hors de git).

  Lancé avant `next dev` et `next build` (predev, prebuild). À relancer à la
  main après une modification d'une vue : `npm run build:mcp-apps`.
*/
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as esbuild from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "app/mcp/apps");

const VIEWS = [
  {name: "deck-check", exportName: "DECK_CHECK_VIEW_HTML"},
];

/** Les blocs de thème de app/globals.css : couleurs et rayons du site. */
async function globalsTheme() {
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");
  return ["@theme inline", ":root", ".dark"].map((selector) => {
    const start = css.indexOf(`\n${selector} {`);
    if (start === -1) throw new Error(`Bloc « ${selector} » introuvable dans app/globals.css.`);
    let depth = 0;
    for (let i = css.indexOf("{", start); i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}" && --depth === 0) return css.slice(start + 1, i + 1);
    }
    throw new Error(`Bloc « ${selector} » non fermé dans app/globals.css.`);
  }).join("\n\n");
}

/**
 * Les vues n'emportent des dictionnaires que la partie qu'elles lisent : un
 * fichier de messages entier pèse plusieurs centaines de Ko par langue.
 */
const messagesPlugin = {
  name: "messages-subset",
  setup(build) {
    build.onLoad({filter: /[\\/]messages[\\/]\w+\.json$/}, async (args) => {
      const messages = JSON.parse(await readFile(args.path, "utf8"));
      const subset = {Games: {DeckChecker: messages.Games.DeckChecker}};
      return {contents: JSON.stringify(subset), loader: "json"};
    });
  },
};

/**
 * zod, qu'emporte le SDK MCP, exporte ses messages d'erreur dans une
 * quarantaine de langues, que l'empaqueteur ne sait pas écarter : près de la
 * moitié de son poids. La vue ne les affiche jamais (zod n'y valide que les
 * messages du client) : seul l'anglais, sa langue par défaut, est gardé.
 */
const zodLocalesPlugin = {
  name: "zod-locales",
  setup(build) {
    build.onResolve({filter: /^\.\/[\w-]+\.js$/}, (args) => {
      if (!/[\\/]zod[\\/]v4[\\/]locales$/.test(args.resolveDir)) return undefined;
      if (args.path === "./en.js" || args.path === "./index.js") return undefined;
      return {path: args.path, namespace: "zod-locale-stub"};
    });
    build.onLoad({filter: /.*/, namespace: "zod-locale-stub"}, () => ({
      contents: "export default function locale() { return {}; }",
      loader: "js",
    }));
  },
};

async function buildView({name, exportName}) {
  const dir = path.join(root, "mcp-apps", name);

  const script = await esbuild.build({
    entryPoints: [path.join(dir, "main.tsx")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    jsx: "automatic",
    legalComments: "none",
    tsconfig: path.join(root, "tsconfig.json"),
    alias: {"next-intl": path.join(root, "mcp-apps/next-intl.ts")},
    define: {"process.env.NODE_ENV": '"production"'},
    plugins: [messagesPlugin, zodLocalesPlugin],
    logLevel: "warning",
  });
  const js = script.outputFiles[0].text;

  const stylesPath = path.join(dir, "styles.css");
  const styles = (await readFile(stylesPath, "utf8")).replace("/* @globals-theme */", await globalsTheme());
  const css = (await postcss([tailwindcss({optimize: {minify: true}})]).process(styles, {from: stylesPath})).css;

  // Un `</script>` dans le code (une chaîne, une expression régulière)
  // fermerait la balise avant la fin du script ; même chose pour les styles.
  const template = await readFile(path.join(dir, "index.html"), "utf8");
  const html = template
    .replace("/* @styles */", () => css.replace(/<\/style/gi, "<\\/style"))
    .replace("/* @script */", () => js.replace(/<\/script/gi, "<\\/script"));

  const out = path.join(outDir, `${name}.generated.ts`);
  await mkdir(outDir, {recursive: true});
  await writeFile(out, [
    "// Généré par scripts/build-mcp-apps.mjs depuis mcp-apps/" + name + "/ : ne pas modifier.",
    `export const ${exportName} = ${JSON.stringify(html)};`,
    "",
  ].join("\n"));

  console.log(`[mcp-apps] ${name} : ${(html.length / 1024).toFixed(0)} Ko → ${path.relative(root, out)}`);
}

for (const view of VIEWS) {
  await buildView(view);
}
