import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type NavGame,
  gameToolLinks,
  selectMenuGames,
  showsGameTools,
} from "./nav-menu";

/**
 * Tests du menu « Jeux » de la barre de navigation. Ce qui compte ici, c'est
 * l'ordre des sources — un choix explicite passe avant un choix vague, qui
 * passe avant un défaut — et le fait qu'un menu ne soit jamais vide.
 *
 * Exécution : `npm run test`.
 */

const shatterpoint: NavGame = {
  id: "aaaaaaaaaaaaaaaaaaaaaaa1",
  name: "Star Wars: Shatterpoint",
  slug: "shatterpoint",
  features: { products: true, battleReports: true, rules: true },
};
const magic: NavGame = {
  id: "aaaaaaaaaaaaaaaaaaaaaaa2",
  name: "Magic: The Gathering",
  slug: "mtg",
  features: { cards: true, collection: true, deckChecker: true },
};
const defaults: NavGame[] = [
  { id: "d1", name: "Riftbound", slug: "riftbound" },
  { id: "d2", name: "Magic: The Gathering", slug: "mtg" },
];

describe("selectMenuGames", () => {
  it("préfère les favoris aux jeux suivis", () => {
    const selection = selectMenuGames({
      followed: [shatterpoint, magic],
      favoriteIds: [magic.id],
      defaults,
    });

    assert.equal(selection.source, "favorites");
    assert.deepEqual(selection.games.map((game) => game.id), [magic.id]);
  });

  it("garde l'ordre des jeux suivis, pas celui des favoris", () => {
    const selection = selectMenuGames({
      followed: [shatterpoint, magic],
      favoriteIds: [magic.id, shatterpoint.id],
      defaults,
    });

    assert.deepEqual(selection.games.map((game) => game.id), [shatterpoint.id, magic.id]);
  });

  it("ignore un favori qui n'est plus suivi", () => {
    const selection = selectMenuGames({
      followed: [shatterpoint],
      favoriteIds: ["un-jeu-oublié"],
      defaults,
    });

    assert.equal(selection.source, "followed");
    assert.deepEqual(selection.games.map((game) => game.id), [shatterpoint.id]);
  });

  it("retombe sur les jeux par défaut sans favori ni jeu suivi", () => {
    const selection = selectMenuGames({ followed: [], favoriteIds: [], defaults });

    assert.equal(selection.source, "defaults");
    assert.deepEqual(selection.games, defaults);
  });
});

describe("showsGameTools", () => {
  it("montre les outils d'un favori unique", () => {
    const selection = selectMenuGames({
      followed: [shatterpoint, magic],
      favoriteIds: [shatterpoint.id],
      defaults,
    });

    assert.equal(showsGameTools(selection), true);
  });

  it("montre les outils d'un jeu suivi unique, sans favori", () => {
    const selection = selectMenuGames({ followed: [magic], favoriteIds: [], defaults });

    assert.equal(showsGameTools(selection), true);
  });

  it("garde la liste dès qu'il y a deux jeux", () => {
    const selection = selectMenuGames({
      followed: [shatterpoint, magic],
      favoriteIds: [],
      defaults,
    });

    assert.equal(showsGameTools(selection), false);
  });

  it("ne réduit jamais un visiteur aux outils d'un jeu par défaut", () => {
    const selection = selectMenuGames({
      followed: [],
      favoriteIds: [],
      defaults: [defaults[0]],
    });

    assert.equal(selection.source, "defaults");
    assert.equal(showsGameTools(selection), false);
  });
});

describe("gameToolLinks", () => {
  it("n'ouvre que les outils activés par le jeu", () => {
    assert.deepEqual(
      gameToolLinks(magic).map((tool) => tool.key),
      ["hub", "cards", "collection", "deckChecker"],
    );
  });

  it("mène le rapport de bataille au formulaire, par identifiant", () => {
    const battleReports = gameToolLinks(shatterpoint).find((tool) => tool.key === "battleReports");

    assert.equal(battleReports?.href, `/game-matches/new?gameId=${shatterpoint.id}`);
  });

  it("retombe sur l'identifiant quand le jeu n'a pas de slug", () => {
    const links = gameToolLinks({ id: "abc", name: "Sans slug", features: { rules: true } });

    assert.deepEqual(
      links.map((tool) => tool.href),
      ["/games/abc", "/games/abc/rules"],
    );
  });

  it("rend au moins la fiche du jeu, même sans aucun fanion", () => {
    assert.deepEqual(
      gameToolLinks({ id: "abc", name: "Nu", slug: "nu" }),
      [{ key: "hub", href: "/games/nu" }],
    );
  });
});
