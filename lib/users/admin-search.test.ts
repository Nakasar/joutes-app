import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminUserProfilePath,
  adminUserTag,
  parseAdminUserSearch,
  type AdminUserSummary,
} from "@/lib/users/admin-search";

/**
 * Tests de l'interprétation d'une recherche d'utilisateur.
 *
 * Deux choses s'y jouent qui ne se voient pas à l'écran : une saisie vide ne
 * doit rien chercher (une recherche à blanc listerait la base), et un
 * pseudonyme peut contenir des caractères qui ont un sens dans une expression
 * régulière — non échappés, ils font échouer la requête ou la font balayer
 * toute la collection.
 *
 * Exécution : `npm run test`.
 */

describe("recherche d'utilisateurs (administration)", () => {
  it("ne cherche rien sur une saisie vide", () => {
    assert.equal(parseAdminUserSearch(""), null);
    assert.equal(parseAdminUserSearch("   "), null);
    // Un « @ » seul n'est pas un pseudonyme : c'est le préfixe d'une mention.
    assert.equal(parseAdminUserSearch("@"), null);
  });

  it("reconnaît un identifiant recopié", () => {
    assert.deepEqual(parseAdminUserSearch("507f1f77bcf86cd799439011"), {
      kind: "id",
      id: "507f1f77bcf86cd799439011",
    });
    // La casse d'un hexadécimal ne change rien à l'identifiant désigné.
    assert.deepEqual(parseAdminUserSearch("507F1F77BCF86CD799439011"), {
      kind: "id",
      id: "507f1f77bcf86cd799439011",
    });
    // Vingt-trois caractères : ce n'est pas un identifiant, c'est un pseudonyme
    // qui y ressemble.
    assert.equal(parseAdminUserSearch("507f1f77bcf86cd79943901")?.kind, "text");
  });

  it("reconnaît un tag complet", () => {
    assert.deepEqual(parseAdminUserSearch("Alice#1234"), {
      kind: "tag",
      displayName: "Alice",
      discriminator: "1234",
    });
    // Un pseudonyme peut contenir un « # » : c'est le dernier qui sépare.
    assert.deepEqual(parseAdminUserSearch("Mister#1#4242"), {
      kind: "tag",
      displayName: "Mister#1",
      discriminator: "4242",
    });
  });

  it("retombe sur le pseudonyme quand le tag est incomplet", () => {
    // Sans nombre derrière le « # », il n'y a pas de tag à résoudre. Chercher la
    // saisie entière ne trouverait rien non plus — aucun pseudonyme ne contient
    // « Alice# » : c'est bien « Alice » qu'on cherche.
    assert.deepEqual(parseAdminUserSearch("Alice#"), { kind: "text", pattern: "Alice" });
    assert.deepEqual(parseAdminUserSearch("Alice#abc"), { kind: "text", pattern: "Alice" });
    // Rien devant le « # » : il ne reste que la saisie elle-même.
    assert.deepEqual(parseAdminUserSearch("#1234"), { kind: "text", pattern: "#1234" });
  });

  it("n'accepte qu'un nombre comme discriminateur", () => {
    // La plateforme en génère quatre chiffres ; la longueur n'est pas imposée,
    // un compte importé peut en porter moins et son tag doit rester cherchable.
    assert.deepEqual(parseAdminUserSearch("Alice#42"), {
      kind: "tag",
      displayName: "Alice",
      discriminator: "42",
    });
    // Ce qui n'est pas un nombre ne désigne aucun tag.
    assert.equal(parseAdminUserSearch("Alice#12a4")?.kind, "text");
    assert.equal(parseAdminUserSearch("Alice#12 34")?.kind, "text");
  });

  it("retire le « @ » d'une mention recopiée", () => {
    assert.deepEqual(parseAdminUserSearch("@Alice#1234"), {
      kind: "tag",
      displayName: "Alice",
      discriminator: "1234",
    });
  });

  it("échappe ce qui aurait un sens dans une expression régulière", () => {
    // Sans échappement, « (test » ferait échouer la requête et « .* »
    // balaierait toute la collection.
    assert.deepEqual(parseAdminUserSearch("(test"), { kind: "text", pattern: "\\(test" });
    assert.deepEqual(parseAdminUserSearch(".*"), { kind: "text", pattern: "\\.\\*" });
  });

  describe("adminUserTag", () => {
    const base: AdminUserSummary = { id: "1", username: "alice", isPublicProfile: false };

    it("préfère le pseudonyme personnalisé et son nombre", () => {
      assert.equal(
        adminUserTag({ ...base, displayName: "Alice", discriminator: "1234" }),
        "Alice#1234"
      );
    });

    it("retombe sur le nom de compte", () => {
      assert.equal(adminUserTag(base), "alice");
      // Un pseudonyme sans nombre ne fait pas un tag : il ne désignerait
      // personne de façon unique.
      assert.equal(adminUserTag({ ...base, displayName: "Alice" }), "alice");
    });

    it("retombe sur l'identifiant quand le compte n'a aucun nom", () => {
      // Une ligne vide serait indistinguable d'une autre, et son avatar
      // n'aurait même pas d'initiale.
      assert.equal(adminUserTag({ ...base, username: "" }), "1");
    });
  });

  describe("adminUserProfilePath", () => {
    const base: AdminUserSummary = { id: "507f1f77bcf86cd799439011", username: "alice", isPublicProfile: false };

    it("concatène le tag sans son « # »", () => {
      // C'est la forme que la page de profil sait résoudre : elle recolle le
      // « # » en découpant les quatre derniers caractères.
      assert.equal(
        adminUserProfilePath({ ...base, displayName: "Nakasar", discriminator: "6666" }),
        "/users/Nakasar6666"
      );
    });

    it("encode ce qui ne traverserait pas une URL", () => {
      assert.equal(
        adminUserProfilePath({ ...base, displayName: "Jean Luc", discriminator: "0001" }),
        "/users/Jean%20Luc0001"
      );
      assert.equal(
        adminUserProfilePath({ ...base, displayName: "a/b", discriminator: "0001" }),
        "/users/a%2Fb0001"
      );
    });

    it("retombe sur l'identifiant sans pseudonyme personnalisé", () => {
      // L'autre forme que la page reconnaît : un compte sans tag n'a pas
      // d'autre adresse.
      assert.equal(adminUserProfilePath(base), "/users/507f1f77bcf86cd799439011");
      assert.equal(
        adminUserProfilePath({ ...base, displayName: "Alice" }),
        "/users/507f1f77bcf86cd799439011"
      );
    });
  });
});
