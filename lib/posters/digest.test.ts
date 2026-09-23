import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import { digestWeekKey, isDigestDue, MAX_DIGEST_POSTERS, sanitizeDigestRefs } from "./digest";

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
