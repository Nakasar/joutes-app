import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveDisplayName, randomDiscriminator, randomDisplayName, sanitizeDisplayName } from "./tag";
import { displayNameSchema, discriminatorSchema } from "@/lib/schemas/user.schema";

/**
 * Tests du tag posé aux comptes qui n'en ont pas (Discord, code e-mail).
 *
 * Exécution : `npm run test`.
 */

describe("sanitizeDisplayName", () => {
  it("garde un nom déjà valide", () => {
    assert.equal(sanitizeDisplayName("Nakasar"), "Nakasar");
    assert.equal(sanitizeDisplayName("le_joueur-42"), "le_joueur-42");
  });

  it("retire accents et caractères refusés, remplace les espaces", () => {
    assert.equal(sanitizeDisplayName("Éloïse"), "Eloise");
    assert.equal(sanitizeDisplayName("Jean Luc"), "Jean_Luc");
    assert.equal(sanitizeDisplayName("  ✨ Kev.in ✨ "), "Kevin");
  });

  it("coupe à vingt caractères sans finir sur un séparateur", () => {
    const name = sanitizeDisplayName("abcdefghijklmnopqrs uvwxyz");
    assert.equal(name, "abcdefghijklmnopqrs");
    assert.ok(displayNameSchema.safeParse(name).success);
  });

  it("refuse ce qui ne laisse pas trois caractères", () => {
    assert.equal(sanitizeDisplayName("✨✨"), null);
    assert.equal(sanitizeDisplayName("Al"), null);
    assert.equal(sanitizeDisplayName("李小龙"), null);
    assert.equal(sanitizeDisplayName(""), null);
    assert.equal(sanitizeDisplayName(undefined), null);
  });
});

describe("deriveDisplayName", () => {
  it("prend le nom du compte (Discord) d'abord", () => {
    assert.equal(deriveDisplayName({ name: "Nakasar", email: "kevin@example.com" }), "Nakasar");
  });

  it("retombe sur la partie locale de l'adresse", () => {
    assert.equal(deriveDisplayName({ name: "", email: "jean.dupont@example.com" }), "jeandupont");
  });

  it("ignore l'adresse de repli d'un compte Discord sans e-mail", () => {
    const name = deriveDisplayName({ name: "✨", email: "123456789@discord.placeholder.local" }, () => 0);
    assert.equal(name, "SombreDragon");
  });

  it("rend toujours un pseudonyme valide", () => {
    for (let i = 0; i < 100; i++) {
      assert.ok(displayNameSchema.safeParse(randomDisplayName()).success);
      assert.ok(displayNameSchema.safeParse(deriveDisplayName({ name: "😀", email: "" })).success);
    }
  });
});

describe("randomDiscriminator", () => {
  it("rend quatre chiffres, zéros de tête compris", () => {
    assert.equal(randomDiscriminator(() => 0), "0000");
    assert.equal(randomDiscriminator(() => 0.0042), "0042");
    assert.equal(randomDiscriminator(() => 0.99999), "9999");
    for (let i = 0; i < 100; i++) assert.ok(discriminatorSchema.safeParse(randomDiscriminator()).success);
  });
});
