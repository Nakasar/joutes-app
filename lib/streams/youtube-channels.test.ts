import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readYouTubeChannelRef, youtubeFeedUrl } from "./youtube-channels";

/**
 * La lecture d'une adresse de chaîne.
 *
 * Ce que ces cas verrouillent : les quatre formes qu'un éditeur peut coller sur
 * la fiche de son jeu mènent bien à la même chaîne, et tout ce qui n'est *pas*
 * une chaîne — une vidéo, une playlist, un autre site — est refusé plutôt que
 * deviné. Un refus ici vaut mieux qu'un appel d'API sur une valeur inventée.
 *
 * Exécution : `npm run test`.
 */

describe("readYouTubeChannelRef", () => {
  it("lit un handle, `@` compris — c'est la forme que `forHandle` attend", () => {
    assert.deepEqual(readYouTubeChannelRef("https://www.youtube.com/@riftbound"), {
      kind: "handle",
      value: "@riftbound",
    });
  });

  it("accepte le handle sans `www`, avec une barre finale ou un onglet", () => {
    for (const url of [
      "https://youtube.com/@riftbound",
      "https://www.youtube.com/@riftbound/",
      "https://m.youtube.com/@riftbound/streams",
    ]) {
      assert.deepEqual(readYouTubeChannelRef(url), { kind: "handle", value: "@riftbound" });
    }
  });

  it("lit un identifiant de chaîne, qui n'a rien à résoudre", () => {
    assert.deepEqual(
      readYouTubeChannelRef("https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw"),
      { kind: "id", value: "UCuAXFkgsw1L7xaCfnd5JJOw" },
    );
  });

  it("refuse un `/channel/` dont la valeur n'a pas la forme d'un identifiant", () => {
    assert.equal(readYouTubeChannelRef("https://www.youtube.com/channel/riftbound"), null);
  });

  it("lit l'ancien nom de compte, que `forUsername` sait encore retrouver", () => {
    assert.deepEqual(readYouTubeChannelRef("https://www.youtube.com/user/riftbound"), {
      kind: "user",
      value: "riftbound",
    });
  });

  it("traite `/c/nom` comme un handle, faute de mieux du côté de l'API", () => {
    assert.deepEqual(readYouTubeChannelRef("https://www.youtube.com/c/riftbound"), {
      kind: "handle",
      value: "@riftbound",
    });
  });

  it("refuse ce qui n'est pas une chaîne", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/playlist?list=PL1234",
      "https://www.youtube.com/",
      "https://x.com/playriftbound",
      "javascript:alert(1)",
      "pas une adresse",
      "",
      undefined,
      null,
    ]) {
      assert.equal(readYouTubeChannelRef(url), null, `attendu null pour ${String(url)}`);
    }
  });
});

describe("youtubeFeedUrl", () => {
  it("échappe l'identifiant plutôt que de le concaténer tel quel", () => {
    assert.equal(
      youtubeFeedUrl("UC a&b"),
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC%20a%26b",
    );
  });
});
