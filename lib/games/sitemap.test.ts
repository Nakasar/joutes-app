import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type SitemapGame, gameSitemapUrls, gamesSitemapUrls } from "./sitemap";

/**
 * Tests des pages de jeu déclarées au sitemap. Ce qui compte ici tient en une
 * phrase : **on n'annonce que ce qui existe et se lit sans compte**. Déclarer
 * une page fermée, vide, ou personnelle, c'est envoyer un moteur sur une porte
 * close — et un sitemap est une promesse.
 *
 * Exécution : `npm run test`.
 */

const paths = (game: SitemapGame) => gameSitemapUrls(game).map((url) => url.path);

describe("gameSitemapUrls", () => {
  it("déclare la fiche d'un jeu, même sans aucune fonctionnalité", () => {
    assert.deepEqual(paths({ id: "1", slug: "swu" }), ["/games/swu"]);
  });

  it("n'annonce un outil que si le jeu l'ouvre", () => {
    const swu: SitemapGame = { id: "1", slug: "swu", features: { policies: true, products: true } };

    assert.deepEqual(paths(swu), ["/games/swu", "/games/swu/policies", "/games/swu/products"]);
  });

  it("ouvre les manipulations de cartes avec les cartes", () => {
    // La barre d'outils les propose sous le même fanion : les déclarer ailleurs
    // promettrait des pages que le jeu ne montre pas.
    assert.deepEqual(paths({ id: "1", slug: "riftbound", features: { cards: true } }), [
      "/games/riftbound",
      "/games/riftbound/cards",
      "/games/riftbound/loop",
      "/games/riftbound/scanner",
    ]);
  });

  it("déclare les deux documents de règles avec les règles", () => {
    assert.deepEqual(paths({ id: "1", slug: "swu", features: { rules: true } }), [
      "/games/swu",
      "/games/swu/rules",
      "/games/swu/rules/tr",
      "/games/swu/rules/cr",
    ]);
  });

  it("n'annonce quiz et actualité qu'ouverts et remplis", () => {
    // Deux conditions : le fanion, sans lequel la page répond 404, et du
    // contenu — une page vide déclarée au sitemap est un rendez-vous manqué.
    assert.deepEqual(
      paths({ id: "1", slug: "shatterpoint", features: { quizz: true }, hasQuizzes: true }),
      ["/games/shatterpoint", "/games/shatterpoint/quizz"]
    );
    assert.deepEqual(
      paths({ id: "1", slug: "shatterpoint", features: { news: true }, hasNews: true }),
      ["/games/shatterpoint", "/games/shatterpoint/news"]
    );

    // Le contenu sans le fanion : la page est fermée.
    assert.deepEqual(paths({ id: "1", slug: "shatterpoint", hasQuizzes: true, hasNews: true }), [
      "/games/shatterpoint",
    ]);
    // Le fanion sans le contenu : la page est vide.
    assert.deepEqual(paths({ id: "1", slug: "shatterpoint", features: { quizz: true, news: true } }), [
      "/games/shatterpoint",
    ]);
  });

  it("annonce l'explorateur de decks sur son seul fanion", () => {
    // À la différence des quiz, ce que la page montre vient de la communauté
    // entière : elle se remplit sans qu'on ait rien à écrire pour ce jeu.
    assert.deepEqual(paths({ id: "1", slug: "swu", features: { decks: true } }), [
      "/games/swu",
      "/games/swu/decks",
    ]);
  });

  it("laisse la collection en dehors : elle est personnelle", () => {
    // Elle figure pourtant dans la barre d'outils du jeu, sous le fanion des
    // cartes — mais elle ne se lit qu'avec un compte.
    const urls = paths({ id: "1", slug: "swu", features: { cards: true, collection: true } });

    assert.equal(
      urls.some((path) => path.includes("collection")),
      false
    );
  });

  it("laisse le vérificateur de deck en dehors : sa page n'existe que pour riftbound", () => {
    // Le fanion existe pour tous les jeux, la route non (`app/games/riftbound/
    // deck-checker`). L'annoncer promettrait un 404 à tous les autres.
    const urls = paths({ id: "1", slug: "swu", features: { deckChecker: true } });

    assert.deepEqual(urls, ["/games/swu"]);
  });

  it("ignore un jeu sans slug", () => {
    // Ses pages répondent sous son identifiant, mais une adresse technique n'a
    // pas à devenir l'adresse canonique d'un jeu dans un index public.
    assert.deepEqual(paths({ id: "507f1f77bcf86cd799439011", features: { cards: true } }), []);
    assert.deepEqual(paths({ id: "1", slug: "   ", features: { cards: true } }), []);
  });
});

describe("gamesSitemapUrls", () => {
  it("suit l'ordre des jeux donnés", () => {
    const urls = gamesSitemapUrls([
      { id: "1", slug: "swu", features: { policies: true } },
      { id: "2", slug: "shatterpoint", features: { quizz: true }, hasQuizzes: true },
    ]);

    assert.deepEqual(
      urls.map((url) => url.path),
      ["/games/swu", "/games/swu/policies", "/games/shatterpoint", "/games/shatterpoint/quizz"]
    );
  });

  it("n'écrit jamais deux fois la même adresse", () => {
    // Deux jeux qui porteraient le même slug (une base à recoller) donneraient
    // sinon un index où la même page revient — mal tenu, et deux fois lu.
    const urls = gamesSitemapUrls([
      { id: "1", slug: "swu", features: { cards: true } },
      { id: "2", slug: "swu", features: { cards: true, policies: true } },
    ]);

    assert.deepEqual(
      urls.map((url) => url.path),
      ["/games/swu", "/games/swu/cards", "/games/swu/loop", "/games/swu/scanner", "/games/swu/policies"]
    );
  });
});
