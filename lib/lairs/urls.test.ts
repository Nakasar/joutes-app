import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { embedVideoUrl, externalUrl } from "./urls";

/**
 * Les URLs renseignées par un lieu, avant le DOM.
 *
 * Ce que ces cas verrouillent : aucun protocole autre que http(s) ne ressort
 * pour un `href` — `javascript:` y trouverait une exécution au clic —, et
 * aucune `iframe` ne s'ouvre sur un hôte qui n'est pas une plateforme vidéo.
 *
 * Exécution : `npm run test`.
 */

describe("externalUrl", () => {
  it("laisse passer http et https", () => {
    assert.equal(externalUrl("https://antretemps.com/"), "https://antretemps.com/");
    assert.equal(externalUrl("http://antretemps.com/"), "http://antretemps.com/");
  });

  it("écarte les protocoles exécutables ou embarqués", () => {
    for (const value of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      assert.equal(externalUrl(value), null, value);
    }
  });

  it("écarte le vide et ce qui n'est pas une URL", () => {
    assert.equal(externalUrl(undefined), null);
    assert.equal(externalUrl(null), null);
    assert.equal(externalUrl(""), null);
    assert.equal(externalUrl("   "), null);
    assert.equal(externalUrl("antretemps.com"), null);
  });
});

describe("embedVideoUrl", () => {
  it("traduit les formes publiques de YouTube en URL de lecteur", () => {
    for (const value of [
      "https://www.youtube.com/watch?v=abc123",
      "https://youtu.be/abc123",
      "https://www.youtube.com/live/abc123",
      "https://www.youtube.com/embed/abc123",
    ]) {
      assert.equal(embedVideoUrl(value), "https://www.youtube.com/embed/abc123", value);
    }
  });

  it("accepte les lecteurs des autres plateformes attendues", () => {
    assert.equal(
      embedVideoUrl("https://player.vimeo.com/video/12345"),
      "https://player.vimeo.com/video/12345",
    );
    assert.equal(
      embedVideoUrl("https://player.twitch.tv/?video=12345"),
      "https://player.twitch.tv/?video=12345",
    );
  });

  it("refuse un hôte quelconque, même en https", () => {
    assert.equal(embedVideoUrl("https://exemple.test/piege.html"), null);
    assert.equal(embedVideoUrl("http://player.vimeo.com/video/12345"), null);
  });

  it("refuse les protocoles écartés par `externalUrl`", () => {
    assert.equal(embedVideoUrl("data:text/html,<script>alert(1)</script>"), null);
    assert.equal(embedVideoUrl("javascript:alert(1)"), null);
    assert.equal(embedVideoUrl(undefined), null);
  });
});
