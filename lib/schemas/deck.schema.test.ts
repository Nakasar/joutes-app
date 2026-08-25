import test from "node:test";
import assert from "node:assert/strict";
import { deckUpdateSchema } from "@/lib/schemas/deck.schema";

/**
 * `expectedVersion` arme la concurrence optimiste du `PATCH /decks/{id}` :
 * elle accompagne un enregistrement, elle n'en est pas un.
 */

test("deckUpdateSchema accepte un enregistrement sans version attendue", () => {
  // Les clients qui n'ont pas encore été repris gardent le « dernier gagne ».
  const parsed = deckUpdateSchema.safeParse({ name: "Contrôle Ionia" });

  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.expectedVersion, undefined);
});

test("deckUpdateSchema porte la version attendue jusqu'à la route", () => {
  const parsed = deckUpdateSchema.safeParse({ notes: "À retravailler", expectedVersion: 7 });

  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.expectedVersion, 7);
});

test("deckUpdateSchema refuse un corps qui ne porte que la version attendue", () => {
  // Le décompte des clés seul l'aurait laissé passer : une clé, donc « au moins
  // un champ modifié ». Or il n'y a rien à enregistrer.
  const parsed = deckUpdateSchema.safeParse({ expectedVersion: 3 });

  assert.equal(parsed.success, false);
});

test("deckUpdateSchema refuse toujours un corps vide", () => {
  assert.equal(deckUpdateSchema.safeParse({}).success, false);
});

test("deckUpdateSchema refuse une version attendue qui n'en est pas une", () => {
  // La première version vaut 1 : ni zéro, ni un rang décimal.
  for (const expectedVersion of [0, -1, 1.5, "3"]) {
    const parsed = deckUpdateSchema.safeParse({ name: "Aggro", expectedVersion });
    assert.equal(parsed.success, false, `${JSON.stringify(expectedVersion)} devrait être refusé`);
  }
});

/**
 * `visibility` portait un `.default("private")` que `.partial()` ne retire pas.
 * Tout enregistrement qui ne la mentionnait pas dépubliait donc le deck.
 */

test("deckUpdateSchema ne dépublie plus un deck qu'on renomme", () => {
  const parsed = deckUpdateSchema.safeParse({ name: "Contrôle Ionia" });

  assert.equal(parsed.success, true);
  assert.equal(parsed.success && "visibility" in parsed.data, false);
});

test("deckUpdateSchema ne touche pas à la visibilité d'un enregistrement de contenu", () => {
  const parsed = deckUpdateSchema.safeParse({ notes: "À retravailler", expectedVersion: 4 });

  assert.equal(parsed.success, true);
  assert.equal(parsed.success && "visibility" in parsed.data, false);
});

test("deckUpdateSchema laisse passer une visibilité demandée", () => {
  const parsed = deckUpdateSchema.safeParse({ visibility: "public" });

  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.visibility, "public");
});
