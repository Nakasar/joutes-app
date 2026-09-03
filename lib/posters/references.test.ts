import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findPosterChoiceByName,
  formatPosterRef,
  matchPosterChoices,
  parsePosterRef,
  type PosterChoice,
} from "./references.ts";

const ID = (suffix: string) => `652f00000000000000000${suffix}`;

const CHOICES: PosterChoice[] = [
  { kind: "poster", id: ID("001"), name: "Ma semaine" },
  { kind: "poster", id: ID("002"), name: "Tournois du mois" },
  { kind: "lair", id: ID("003"), name: "Café des Jeux" },
  { kind: "lair", id: ID("004"), name: "La Caverne du Gobelin" },
];

describe("formatPosterRef / parsePosterRef", () => {
  it("fait l'aller-retour", () => {
    const ref = { kind: "poster" as const, id: ID("001") };

    assert.equal(formatPosterRef(ref), `poster:${ID("001")}`);
    assert.deepEqual(parsePosterRef(formatPosterRef(ref)), ref);
  });

  it("rend null sur un nom tapé à la main", () => {
    // Ce n'est pas une erreur : l'appelant retombe sur la recherche par nom,
    // sans quoi il faudrait cliquer une suggestion pour être compris.
    assert.equal(parsePosterRef("Ma semaine"), null);
    assert.equal(parsePosterRef(""), null);
    assert.equal(parsePosterRef(undefined), null);
  });

  it("refuse ce qui n'est ni une nature connue ni un identifiant Mongo", () => {
    assert.equal(parsePosterRef(`event:${ID("001")}`), null);
    assert.equal(parsePosterRef("poster:bonjour"), null);
    assert.equal(parsePosterRef(`poster:${ID("001")}:extra`), null);
  });

  it("normalise la casse de l'identifiant", () => {
    assert.deepEqual(parsePosterRef(`lair:${ID("00A")}`), { kind: "lair", id: ID("00a") });
  });
});

describe("matchPosterChoices", () => {
  it("rend la bibliothèque entière sur une saisie vide, dans son ordre", () => {
    assert.deepEqual(
      matchPosterChoices(CHOICES, "").map((choice) => choice.name),
      ["Ma semaine", "Tournois du mois", "Café des Jeux", "La Caverne du Gobelin"],
    );
  });

  it("cherche sans accents ni casse", () => {
    // « Café des Jeux » se trouve en tapant « cafe » : exiger l'accent, c'est
    // une autocomplétion qu'on n'utilise pas.
    assert.deepEqual(
      matchPosterChoices(CHOICES, "cafe").map((choice) => choice.name),
      ["Café des Jeux"],
    );
  });

  it("place ce qui commence par la saisie avant ce qui la contient", () => {
    const choices: PosterChoice[] = [
      { kind: "poster", id: ID("007"), name: "Ma semaine" },
      { kind: "poster", id: ID("008"), name: "Semaine des tournois" },
    ];

    assert.deepEqual(
      matchPosterChoices(choices, "semaine").map((choice) => choice.name),
      ["Semaine des tournois", "Ma semaine"],
    );
  });

  it("plafonne : Discord n'affiche pas plus de vingt-cinq suggestions", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      kind: "poster" as const,
      id: ID(String(index).padStart(3, "0")),
      name: `Affiche ${index}`,
    }));

    assert.equal(matchPosterChoices(many, "affiche").length, 25);
    assert.equal(matchPosterChoices(many, "", 3).length, 3);
  });

  it("ne rend rien plutôt que n'importe quoi", () => {
    assert.deepEqual(matchPosterChoices(CHOICES, "donjon"), []);
  });
});

describe("findPosterChoiceByName", () => {
  it("préfère le nom exact à ce que la recherche remonterait", () => {
    const choices: PosterChoice[] = [
      { kind: "poster", id: ID("005"), name: "Semaine des tournois" },
      { kind: "poster", id: ID("006"), name: "Semaine" },
    ];

    assert.equal(findPosterChoiceByName(choices, "semaine")?.id, ID("006"));
  });

  it("retombe sur la meilleure correspondance", () => {
    assert.equal(findPosterChoiceByName(CHOICES, "caverne")?.id, ID("004"));
  });

  it("rend null sur un nom inconnu ou vide", () => {
    assert.equal(findPosterChoiceByName(CHOICES, "donjon"), null);
    assert.equal(findPosterChoiceByName(CHOICES, "   "), null);
  });
});
