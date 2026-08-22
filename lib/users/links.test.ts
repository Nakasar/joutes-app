import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_USER_LINKS, readLinkHost, readLinkKind, readUserLinks, stripProtocol } from "./links";

/**
 * Les liens d'un profil.
 *
 * Le cas qui compte le plus est celui de l'adresse malformée : la page de
 * profil appelait `new URL()` sans garde et tombait entière pour une seule
 * valeur invalide en base. Rien de ce qui sort d'ici ne peut lever.
 *
 * Exécution : `npm run test`.
 */

describe("readLinkKind", () => {
  it("reconnaît les plateformes, sous-domaines compris", () => {
    assert.equal(readLinkKind("https://twitch.tv/nakasar"), "twitch");
    assert.equal(readLinkKind("https://www.youtube.com/@nakasar"), "youtube");
    assert.equal(readLinkKind("https://youtu.be/abc"), "youtube");
    assert.equal(readLinkKind("https://discord.gg/abc"), "discord");
    assert.equal(readLinkKind("https://bsky.app/profile/x"), "bluesky");
    assert.equal(readLinkKind("https://x.com/nakasar"), "x");
  });

  it("ne prend pas un domaine voisin pour la plateforme", () => {
    assert.equal(readLinkKind("https://notyoutube.com/x"), "website");
    assert.equal(readLinkKind("https://twitch.tv.example.test/x"), "website");
  });

  it("retombe sur le globe plutôt que de deviner", () => {
    assert.equal(readLinkKind("https://exemple.test"), "website");
    assert.equal(readLinkKind("pas une adresse"), "website");
  });
});

describe("readLinkHost", () => {
  it("retire le www", () => {
    assert.equal(readLinkHost("https://www.exemple.test/x"), "exemple.test");
  });

  it("rend null sans lever pour une adresse malformée", () => {
    assert.equal(readLinkHost("javascript:alert(1)"), null);
    assert.equal(readLinkHost("exemple.test"), null);
    assert.equal(readLinkHost(""), null);
  });
});

describe("readUserLinks", () => {
  it("fond la vitrine, le site et les réseaux, la vitrine d'abord", () => {
    const links = readUserLinks({
      website: "https://site.test",
      socialLinks: ["https://twitch.tv/a"],
      showcase: { links: [{ url: "https://youtube.com/@a", label: "Ma chaîne" }] },
    });

    assert.deepEqual(
      links.map((link) => link.url),
      ["https://youtube.com/@a", "https://site.test/", "https://twitch.tv/a"],
    );
    assert.equal(links[0].label, "Ma chaîne");
    assert.equal(links[2].kind, "twitch");
  });

  it("écarte ce qui n'est pas une adresse http(s), sans lever", () => {
    const links = readUserLinks({
      website: "javascript:alert(1)",
      socialLinks: ["", "exemple.test", "data:text/html,x", "https://ok.test"],
    });

    assert.deepEqual(
      links.map((link) => link.url),
      ["https://ok.test/"],
    );
  });

  it("déduplique", () => {
    const links = readUserLinks({
      website: "https://site.test",
      socialLinks: ["https://site.test"],
    });

    assert.equal(links.length, 1);
  });

  it("borne à dix", () => {
    const links = readUserLinks({
      socialLinks: Array.from({ length: 15 }, (_, index) => `https://exemple.test/${index}`),
    });

    assert.equal(links.length, MAX_USER_LINKS);
  });

  it("rend une liste vide plutôt que de se plaindre", () => {
    assert.deepEqual(readUserLinks({}), []);
  });
});

describe("stripProtocol", () => {
  it("retire le protocole et la barre finale", () => {
    assert.equal(stripProtocol("https://twitch.tv/nakasar/"), "twitch.tv/nakasar");
    assert.equal(stripProtocol("http://exemple.test"), "exemple.test");
  });
});
