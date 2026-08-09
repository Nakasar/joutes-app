import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estimateTokens,
  htmlToMarkdown,
  isNegotiablePath,
  MARKDOWN_CONTENT_TYPE,
} from "./markdown-negotiation";

/**
 * La négociation de contenu : la même URL en HTML pour un navigateur, en
 * markdown pour l'agent qui le demande.
 *
 * Ce qui peut mal tourner tient en deux points : convertir ce qui ne doit pas
 * l'être — du JSON, un linkset — et rendre au lecteur le menu et le pied de
 * page qu'il venait précisément éviter.
 *
 * Exécution : `npm run test`.
 */

const PAGE = `<!doctype html>
<html><head><title>Conditions d&#x27;Utilisation - Joutes</title>
<script>window.__NEXT_DATA__={"beaucoup":"de bruit"}</script>
<style>.a{color:red}</style></head>
<body>
<header><nav><a href="/lairs">Lieux</a></nav></header>
<main><h2>Résumé</h2><p>Le texte de la page.</p>
<ul><li>Un point</li></ul></main>
<footer><a href="/cgu">CGU</a></footer>
</body></html>`;

describe("htmlToMarkdown", () => {
  it("ne garde que le contenu, pas ce qui l'entoure", () => {
    // C'est tout l'intérêt : sur chaque page, le même menu et le même pied
    // coûtent des jetons pour rien.
    const markdown = htmlToMarkdown(PAGE);

    assert.ok(markdown.includes("Le texte de la page."));
    assert.ok(!markdown.includes("Lieux"), "la navigation a survécu");
    assert.ok(!markdown.includes("CGU"), "le pied de page a survécu");
  });

  it("laisse dehors ce qui ne se lit pas", () => {
    // Le JSON d'hydratation de Next pèse à lui seul plus que la page.
    const markdown = htmlToMarkdown(PAGE);

    assert.ok(!markdown.includes("beaucoup"), "le script a survécu");
    assert.ok(!markdown.includes("color:red"), "le style a survécu");
  });

  it("décode les entités du titre", () => {
    // Le corps passe par un analyseur HTML, le titre par une regex : sans
    // décodage, l'agent lit « d&#x27;Utilisation » et le recopie.
    const markdown = htmlToMarkdown(PAGE);

    assert.ok(markdown.startsWith("# Conditions d'Utilisation - Joutes"), markdown.slice(0, 60));
    assert.ok(!markdown.includes("&#x27;"));
  });

  it("n'ajoute pas un titre quand la page en a déjà un", () => {
    // Sinon la page s'ouvre deux fois sur la même phrase.
    const withH1 = PAGE.replace("<h2>Résumé</h2>", "<h1>Résumé</h1>");
    const markdown = htmlToMarkdown(withH1);

    assert.ok(markdown.startsWith("# Résumé"), markdown.slice(0, 40));
    assert.equal(markdown.match(/^# /gm)?.length, 1);
  });

  it("se rabat sur la page entière quand il n'y a pas de <main>", () => {
    // Mieux vaut une page bruyante qu'une page vide.
    const markdown = htmlToMarkdown(
      `<html><head><title>T</title></head><body><p>Sans repère.</p></body></html>`
    );

    assert.ok(markdown.includes("Sans repère."));
  });
});

describe("isNegotiablePath", () => {
  it("laisse tranquille ce qui sert déjà l'agent", () => {
    // Convertir un linkset en prose le rendrait illisible pour le client qui
    // l'attend en JSON.
    for (const path of [
      "/api/games",
      "/api",
      "/.well-known/api-catalog",
      "/.well-known/agent-skills/index.json",
      "/auth.md",
      "/robots.txt",
      "/sitemap.xml",
      "/_next/static/chunk.js",
      "/logo/joutes.png",
    ]) {
      assert.equal(isNegotiablePath(path), false, `converti à tort : ${path}`);
    }
  });

  it("convertit les pages", () => {
    for (const path of ["/", "/cgu", "/games/riftbound", "/lairs"]) {
      assert.equal(isNegotiablePath(path), true, `non converti : ${path}`);
    }
  });
});

describe("estimateTokens", () => {
  it("donne un ordre de grandeur croissant avec le texte", () => {
    // Ce n'est pas un compte exact et ne prétend pas l'être : le découpage
    // dépend du modèle. La valeur sert à budgéter avant de télécharger.
    assert.ok(estimateTokens("court") < estimateTokens("court".repeat(100)));
    assert.equal(estimateTokens(""), 0);
  });

  it("compte les caractères, pas les unités UTF-16", () => {
    // Un emoji occupe deux unités et un seul caractère : compter les unités
    // gonflerait l'estimation sans raison.
    assert.equal(estimateTokens("🎴🎴🎴🎴"), 1);
  });
});

describe("MARKDOWN_CONTENT_TYPE", () => {
  it("est ce que le scanner cherche", () => {
    assert.ok(MARKDOWN_CONTENT_TYPE.startsWith("text/markdown"));
  });
});
