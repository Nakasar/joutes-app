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

/**
 * La couverture d'un deck : une carte qu'on désigne, ou une image qu'on
 * dépose. L'adresse de l'image ne se saisit pas — elle sort de
 * `POST /decks/{deckId}/cover`, et le schéma le vérifie.
 */

test("deckUpdateSchema accepte une carte de couverture", () => {
  const parsed = deckUpdateSchema.safeParse({ coverCardId: "OGN-103" });

  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.coverCardId, "OGN-103");
});

test("deckUpdateSchema accepte la chaîne vide, qui retire la couverture", () => {
  // Un `undefined` ne dirait rien dans un corps partiel, où l'absence signifie
  // « ne touche pas à ça » : le retrait a besoin d'une valeur.
  for (const body of [{ coverCardId: "" }, { coverImageUrl: "" }]) {
    assert.equal(deckUpdateSchema.safeParse(body).success, true, JSON.stringify(body));
  }
});

test("deckUpdateSchema accepte une image déposée sur le stockage de l'application", () => {
  const url = "https://uiez8a3cxaj4q4wl.public.blob.vercel-storage.com/decks/abc/cover-x1.png";
  const parsed = deckUpdateSchema.safeParse({ coverImageUrl: url });

  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.coverImageUrl, url);
});

test("deckUpdateSchema refuse une couverture hébergée ailleurs", () => {
  // Un deck public ferait sinon charger à chacun de ses lecteurs une image
  // servie par un tiers, qui en verrait l'adresse IP.
  for (const coverImageUrl of [
    "https://exemple.test/cover.png",
    "http://x.public.blob.vercel-storage.com/decks/abc/cover.png",
    "javascript:alert(1)",
    "/decks/abc/cover.png",
  ]) {
    const parsed = deckUpdateSchema.safeParse({ coverImageUrl });
    assert.equal(parsed.success, false, `${coverImageUrl} devrait être refusé`);
  }
});
