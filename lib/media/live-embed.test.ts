import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSupportedLiveUrl, readLiveEmbed } from "./live-embed";

/**
 * Le direct d'un lieu ou d'un groupe de jeu.
 *
 * Ce que ces cas verrouillent : le lecteur Twitch ne démarre pas sans le
 * domaine parent, et celui-ci doit arriver sans port — c'est la forme que porte
 * l'en-tête `host` en développement. Et rien d'autre que Twitch ou YouTube ne
 * passe : le champ est collé à la main, un lien Facebook s'y retrouve vite.
 *
 * Exécution : `npm run test`.
 */

describe("readLiveEmbed", () => {
  it("construit le lecteur Twitch avec le domaine parent", () => {
    const embed = readLiveEmbed("https://twitch.tv/antretemps", "www.joutes.app");

    assert.equal(embed?.platform, "twitch");
    assert.equal(
      embed?.embedUrl,
      "https://player.twitch.tv/?channel=antretemps&parent=www.joutes.app",
    );
    assert.equal(embed?.label, "twitch.tv/antretemps");
  });

  it("retire le port du domaine parent", () => {
    const embed = readLiveEmbed("https://twitch.tv/antretemps", "localhost:3000");

    assert.ok(embed?.embedUrl.endsWith("parent=localhost"));
  });

  it("accepte les formes YouTube", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=abc123",
      "https://youtu.be/abc123",
      "https://www.youtube.com/live/abc123",
      "https://www.youtube.com/embed/abc123",
    ]) {
      assert.equal(readLiveEmbed(url, "joutes.app")?.embedUrl, "https://www.youtube.com/embed/abc123", url);
    }
  });

  it("refuse une plateforme inconnue, une chaîne vide ou un lien mal formé", () => {
    assert.equal(readLiveEmbed("https://facebook.com/antretemps/live", "joutes.app"), null);
    assert.equal(readLiveEmbed("https://twitch.tv/", "joutes.app"), null);
    assert.equal(readLiveEmbed("https://www.youtube.com/@antretemps", "joutes.app"), null);
    assert.equal(readLiveEmbed("pas une url", "joutes.app"), null);
    assert.equal(readLiveEmbed("javascript:alert(1)", "joutes.app"), null);
  });
});

describe("isSupportedLiveUrl", () => {
  it("suit les mêmes règles que le lecteur", () => {
    assert.equal(isSupportedLiveUrl("https://twitch.tv/antretemps"), true);
    assert.equal(isSupportedLiveUrl("https://vimeo.com/12345"), false);
  });
});
