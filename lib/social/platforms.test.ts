import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectableSocialPlatforms,
  socialLinkOf,
  socialPlatform,
  socialPlatformLinkExists,
  SOCIAL_PLATFORM_KEYS,
  SOCIAL_PLATFORMS,
} from "./platforms";

/**
 * La table des plateformes.
 *
 * Ce que ces cas verrouillent : chaque plateforme pointe une clé de lien qui
 * existe vraiment sur la fiche d'un jeu — une faute de frappe y ferait sonder
 * un champ vide sans que rien ne le signale — et la liste de celles qu'on
 * collecte reste celle qu'on croit.
 *
 * Exécution : `npm run test`.
 */

describe("SOCIAL_PLATFORMS", () => {
  it("couvre les quatre plateformes du périmètre", () => {
    assert.deepEqual(SOCIAL_PLATFORM_KEYS, ["bluesky", "youtube", "x", "instagram"]);
  });

  it("pointe pour chacune une clé de lien qui existe dans GAME_LINKS", () => {
    for (const platform of SOCIAL_PLATFORM_KEYS) {
      assert.ok(
        socialPlatformLinkExists(platform),
        `${platform} désigne ${socialPlatform(platform).linkKey}, absente de GAME_LINKS`,
      );
    }
  });

  /*
   * `collectable: false` ne dit pas « pas encore écrit », il dit « pas
   * accessible » : X n'a plus d'API de lecture gratuite, Instagram exige une
   * App Review Meta. Voir `docs/GAME_SOCIAL.md`.
   */
  it("ne collecte que ce à quoi on a réellement accès", () => {
    assert.deepEqual(collectableSocialPlatforms(), ["bluesky", "youtube"]);
    assert.equal(SOCIAL_PLATFORMS.x.collectable, false);
    assert.equal(SOCIAL_PLATFORMS.instagram.collectable, false);
  });

  it("donne un nom propre à chacune, qui ne se traduit pas", () => {
    assert.equal(socialPlatform("bluesky").label, "Bluesky");
    assert.equal(socialPlatform("youtube").label, "YouTube");
  });
});

describe("socialLinkOf", () => {
  it("lit le lien de la plateforme sur la fiche", () => {
    const links = {
      bluesky: "https://bsky.app/profile/riftbound.bsky.social",
      youtube: "https://www.youtube.com/@riftbound",
    };

    assert.equal(socialLinkOf(links, "bluesky"), links.bluesky);
    assert.equal(socialLinkOf(links, "youtube"), links.youtube);
  });

  it("traite un champ vide ou blanc comme absent", () => {
    assert.equal(socialLinkOf({ bluesky: "" }, "bluesky"), undefined);
    assert.equal(socialLinkOf({ bluesky: "   " }, "bluesky"), undefined);
    assert.equal(socialLinkOf({}, "bluesky"), undefined);
    assert.equal(socialLinkOf(undefined, "bluesky"), undefined);
  });

  it("rogne les espaces autour d'une adresse recopiée", () => {
    assert.equal(socialLinkOf({ bluesky: "  https://bsky.app/profile/a.b  " }, "bluesky"), "https://bsky.app/profile/a.b");
  });
});
