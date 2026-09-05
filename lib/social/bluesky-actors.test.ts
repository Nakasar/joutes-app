import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  blueskyExternalId,
  blueskyPostUrl,
  blueskyProfileUrl,
  readBlueskyActor,
  readBlueskyPostUri,
} from "./bluesky-actors";

/**
 * La lecture d'une adresse de compte Bluesky.
 *
 * Ce que ces cas verrouillent : les formes qu'un éditeur peut coller sur la
 * fiche de son jeu mènent bien au compte, et tout ce qui n'est *pas* un compte
 * — une publication, un flux, un autre site — est refusé plutôt que deviné.
 * Même contrat que `readYouTubeChannelRef`, et pour la même raison : un refus
 * ici vaut mieux qu'un appel d'API sur une valeur inventée.
 *
 * Exécution : `npm run test`.
 */

const DID = "did:plc:z72i7hdynmk6r22z27h6tvur";

describe("readBlueskyActor", () => {
  it("lit un handle, qui est un nom de domaine", () => {
    assert.deepEqual(readBlueskyActor("https://bsky.app/profile/riftbound.bsky.social"), {
      actor: "riftbound.bsky.social",
    });
  });

  it("lit un DID, la seule identité qui ne change jamais", () => {
    assert.deepEqual(readBlueskyActor(`https://bsky.app/profile/${DID}`), { actor: DID });
  });

  it("tolère le `www.` et la barre finale", () => {
    for (const url of [
      "https://www.bsky.app/profile/riftbound.bsky.social",
      "https://bsky.app/profile/riftbound.bsky.social/",
    ]) {
      assert.deepEqual(readBlueskyActor(url), { actor: "riftbound.bsky.social" });
    }
  });

  it("refuse une publication — c'est un compte qu'on sonde, pas un message", () => {
    assert.equal(readBlueskyActor(`https://bsky.app/profile/${DID}/post/3muplmkx56s2k`), null);
  });

  it("refuse ce qui n'est pas un compte", () => {
    for (const url of [
      "https://bsky.app/profile/riftbound.bsky.social/feed/machin",
      "https://bsky.app/profile/pseudonyme", // ni domaine ni DID
      "https://bsky.app/profile/",
      "https://bsky.app/",
      "https://x.com/playriftbound",
      "https://www.youtube.com/@riftbound",
      "javascript:alert(1)",
      "pas une adresse",
      "",
      undefined,
      null,
    ]) {
      assert.equal(readBlueskyActor(url), null, `attendu null pour ${String(url)}`);
    }
  });
});

describe("readBlueskyPostUri", () => {
  it("sépare le compte de la clé d'enregistrement", () => {
    assert.deepEqual(readBlueskyPostUri(`at://${DID}/app.bsky.feed.post/3muplmkx56s2k`), {
      did: DID,
      rkey: "3muplmkx56s2k",
    });
  });

  it("refuse une autre collection que les publications", () => {
    assert.equal(readBlueskyPostUri(`at://${DID}/app.bsky.feed.repost/3muppv5g3h627`), null);
  });

  it("refuse une URI hors forme", () => {
    for (const uri of [
      `at://${DID}/app.bsky.feed.post`,
      `at://${DID}`,
      "https://bsky.app/profile/x/post/y",
      "at://pas-un-did/app.bsky.feed.post/3mup",
      "",
      undefined,
      null,
    ]) {
      assert.equal(readBlueskyPostUri(uri), null, `attendu null pour ${String(uri)}`);
    }
  });
});

describe("les adresses construites", () => {
  /*
   * Le DID et jamais le handle : un handle est un nom de domaine vérifié, donc
   * une chose qui change. Un éditeur qui se renomme casserait tous les liens.
   */
  it("bâtit le profil et le permalien sur le DID", () => {
    assert.equal(blueskyProfileUrl(DID), `https://bsky.app/profile/${DID}`);
    assert.equal(blueskyPostUrl(DID, "3muplmkx56s2k"), `https://bsky.app/profile/${DID}/post/3muplmkx56s2k`);
  });

  it("échappe ce qu'il met dans l'adresse, sauf les deux-points d'un DID", () => {
    assert.equal(blueskyPostUrl("did:plc:a b", "r/k"), "https://bsky.app/profile/did:plc:a%20b/post/r%2Fk");
  });

  /*
   * Le `rkey` seul n'est unique que dans un dépôt. Deux comptes peuvent porter
   * le même, et l'employer seul comme clé ferait se recouvrir deux publications.
   */
  it("compose une identité qui porte le compte", () => {
    assert.equal(blueskyExternalId(DID, "3muplmkx56s2k"), `${DID}/3muplmkx56s2k`);
    assert.notEqual(
      blueskyExternalId(DID, "3mup"),
      blueskyExternalId("did:plc:autrecompte0000000000", "3mup"),
    );
  });
});
