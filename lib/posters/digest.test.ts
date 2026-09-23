import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import { digestWeekKey, escapeDiscordMarkdown, isDigestDue, MAX_DIGEST_POSTERS, sanitizeDigestRefs, toggleDigestRef } from "./digest";

const A = "a".repeat(24);
const B = "b".repeat(24);
const C = "c".repeat(24);

describe("semaine d'envoi", () => {
  it("se lit à l'heure de Paris", () => {
    // Dimanche 27 septembre 2026, 23h30 UTC : déjà lundi 28 à Paris.
    assert.equal(digestWeekKey(DateTime.fromISO("2026-09-27T23:30:00Z")), "2026-W40");
    assert.equal(digestWeekKey(DateTime.fromISO("2026-09-27T20:00:00Z")), "2026-W39");
  });

  it("n'envoie qu'une fois par semaine", () => {
    const monday = DateTime.fromISO("2026-09-28T08:00:00Z");
    assert.equal(isDigestDue(undefined, monday), true);
    assert.equal(isDigestDue("2026-W39", monday), true);
    assert.equal(isDigestDue("2026-W40", monday), false);
  });
});

describe("affiches retenues", () => {
  const available = [
    { kind: "poster" as const, id: A, name: "Ma semaine" },
    { kind: "lair" as const, id: B, name: "Le Donjon" },
  ];

  it("ne garde que les affiches du compte, sans doublon", () => {
    assert.deepEqual(
      sanitizeDigestRefs([`poster:${A}`, `lair:${B}`, `poster:${A}`, `lair:${C}`, "n'importe quoi"], available),
      [`poster:${A}`, `lair:${B}`]
    );
  });

  it("plafonne le nombre d'affiches", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      kind: "poster" as const,
      id: String(i).repeat(24),
      name: `Affiche ${i}`,
    }));
    const refs = many.map((choice) => `poster:${choice.id}`);
    assert.equal(sanitizeDigestRefs(refs, many).length, MAX_DIGEST_POSTERS);
  });
});

describe("bascule depuis une affiche", () => {
  const ref = `poster:${A}`;

  it("ajoute et retire l'affiche", () => {
    assert.deepEqual(toggleDigestRef([], ref, true), [ref]);
    assert.deepEqual(toggleDigestRef([ref, `lair:${B}`], ref, false), [`lair:${B}`]);
  });

  it("ne double pas une affiche déjà retenue", () => {
    assert.deepEqual(toggleDigestRef([ref], ref, true), [ref]);
  });

  it("refuse au-delà du plafond plutôt que d'en retirer une autre", () => {
    const full = Array.from({ length: MAX_DIGEST_POSTERS }, (_, i) => `poster:${String(i).repeat(24)}`);
    assert.equal(toggleDigestRef(full, ref, true), "full");
  });
});

describe("nom dans un lien Discord", () => {
  it("neutralise ce qui fermerait le lien ou le mettrait en forme", () => {
    assert.equal(
      escapeDiscordMarkdown("Ma semaine](https://evil.example) *gras*"),
      "Ma semaine\\]\\(https://evil.example\\) \\*gras\\*"
    );
  });

  it("laisse un nom ordinaire lisible", () => {
    assert.equal(escapeDiscordMarkdown("Le Donjon du Coin"), "Le Donjon du Coin");
  });
});
