import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatUserTag, parseProfileHandle, toLookupKey, userProfilePath } from "./handle";

/**
 * L'interprétation du segment d'URL d'un profil.
 *
 * Le cas qui a motivé ce module est le premier : un identifiant ne doit jamais
 * être redécoupé en tag. La garde précédente ne gardait rien, `substring(-4)`
 * rendant la chaîne entière.
 *
 * Exécution : `npm run test`.
 */

describe("parseProfileHandle", () => {
  it("reconnaît un identifiant et ne le découpe pas en tag", () => {
    assert.deepEqual(parseProfileHandle("507f1f77bcf86cd799439011"), {
      kind: "id",
      id: "507f1f77bcf86cd799439011",
    });
  });

  it("normalise la casse d'un identifiant", () => {
    assert.deepEqual(parseProfileHandle("507F1F77BCF86CD799439011"), {
      kind: "id",
      id: "507f1f77bcf86cd799439011",
    });
  });

  it("reconnaît un tag explicite", () => {
    assert.deepEqual(parseProfileHandle("Nakasar#6666"), {
      kind: "tag",
      displayName: "Nakasar",
      discriminator: "6666",
    });
  });

  it("reconnaît un tag concaténé", () => {
    assert.deepEqual(parseProfileHandle("Nakasar6666"), {
      kind: "tag",
      displayName: "Nakasar",
      discriminator: "6666",
    });
  });

  it("coupe au dernier « # », un pseudonyme pouvant en contenir", () => {
    assert.deepEqual(parseProfileHandle("na#kasar#6666"), {
      kind: "tag",
      displayName: "na#kasar",
      discriminator: "6666",
    });
  });

  it("refuse un « # » sans nombre derrière", () => {
    assert.deepEqual(parseProfileHandle("Nakasar#abc"), { kind: "unknown" });
    assert.deepEqual(parseProfileHandle("Nakasar#"), { kind: "unknown" });
  });

  it("refuse ce qui ne désigne rien", () => {
    assert.deepEqual(parseProfileHandle(""), { kind: "unknown" });
    assert.deepEqual(parseProfileHandle("   "), { kind: "unknown" });
    // Sans « # » ni quatre chiffres finaux, il n'y a pas où couper.
    assert.deepEqual(parseProfileHandle("Nakasar"), { kind: "unknown" });
  });
});

describe("toLookupKey", () => {
  it("recolle le « # » d'un tag", () => {
    assert.equal(toLookupKey(parseProfileHandle("Nakasar6666")), "Nakasar#6666");
  });

  it("rend un identifiant tel quel", () => {
    assert.equal(
      toLookupKey(parseProfileHandle("507f1f77bcf86cd799439011")),
      "507f1f77bcf86cd799439011",
    );
  });

  it("rend null quand rien n'est désigné", () => {
    assert.equal(toLookupKey({ kind: "unknown" }), null);
  });
});

describe("userProfilePath", () => {
  it("concatène le tag sans son « # »", () => {
    assert.equal(
      userProfilePath({ id: "1", displayName: "Nakasar", discriminator: "6666" }),
      "/users/Nakasar6666",
    );
  });

  it("retombe sur l'identifiant sans pseudonyme personnalisé", () => {
    assert.equal(userProfilePath({ id: "507f1f77bcf86cd799439011" }), "/users/507f1f77bcf86cd799439011");
  });

  it("produit une adresse qui se relit", () => {
    const path = userProfilePath({ id: "1", displayName: "Naka sar", discriminator: "6666" });
    const segment = decodeURIComponent(path.slice("/users/".length));

    assert.deepEqual(parseProfileHandle(segment), {
      kind: "tag",
      displayName: "Naka sar",
      discriminator: "6666",
    });
  });
});

describe("formatUserTag", () => {
  it("rend null quand le compte n'a pas de tag", () => {
    assert.equal(formatUserTag(undefined, undefined), null);
    assert.equal(formatUserTag("Nakasar", undefined), null);
  });
});
