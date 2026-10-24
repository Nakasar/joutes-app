import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bracketedKeywords,
  cardTranslationState,
  glossaryLookup,
  prefillTranslatedText,
  publishedTranslation,
  readCardTranslations,
  sharesTranslationWith,
  translateAttributeValue,
  type CardGlossaryEntry,
} from "./translations";

/**
 * Traductions de cartes saisies depuis l'administration. Les textes sont ceux
 * de vraies cartes Riftbound (galerie officielle, octobre 2026).
 *
 * Exécution : `npm run test`.
 */

const glossary: CardGlossaryEntry[] = [
  { field: "keyword", en: "Reaction", value: "Réaction", reminder: "Jouable à tout moment, même avant la résolution des sorts et des capacités." },
  { field: "keyword", en: "Predict", value: "Prédiction" },
  { field: "keyword", en: "Assault", value: "Assaut" },
  { field: "keyword", en: "Equip", value: "Équiper" },
  { field: "keyword", en: "Hidden", value: "Caché", reminder: "Cachez-moi maintenant pour :rb_rune_rainbow:." },
  { field: "type", en: "Unit", value: "Unité" },
  { field: "tags", en: "Bandle City", value: "Bandle" },
  { field: "tags", en: "Zaun", value: "" },
];

describe("prefillTranslatedText", () => {
  it("traduit le mot-clé et son rappel, garde le reste du texte", () => {
    const { text, keywords } = prefillTranslatedText(
      "[Reaction] (Play any time, even before spells and abilities resolve.)\nCounter a spell.\n[Predict]. (Look at the top card of your Main Deck. You may recycle it.)",
      glossary
    );
    assert.equal(
      text,
      "[Réaction] (Jouable à tout moment, même avant la résolution des sorts et des capacités.)\nCounter a spell.\n[Prédiction]. (Look at the top card of your Main Deck. You may recycle it.)"
    );
    assert.equal(keywords, 2);
  });

  it("conserve les valeurs et les symboles des mots-clés", () => {
    assert.equal(prefillTranslatedText("[Assault 2]", glossary).text, "[Assaut 2]");
    assert.equal(prefillTranslatedText("[Equip [1]:rb_rune_body:]", glossary).text, "[Équiper [1]:rb_rune_body:]");
  });

  it("traduit un mot-clé cité au milieu d'une phrase sans y coller de rappel", () => {
    assert.equal(
      prefillTranslatedText("When I'm played from [Hidden], deal 1.", glossary).text,
      "When I'm played from [Caché], deal 1."
    );
  });

  it("laisse les crochets inconnus tels quels", () => {
    const { text, keywords } = prefillTranslatedText("[Ganking] (I can move.)", glossary);
    assert.equal(text, "[Ganking] (I can move.)");
    assert.equal(keywords, 0);
  });
});

describe("cardTranslationState", () => {
  const card = { name: "Teemo, Strategist", text: "Deal 1 for each card with [Hidden]." };

  it("distingue à traduire, brouillon, traduite et à revoir", () => {
    assert.equal(cardTranslationState(card, undefined), "todo");
    assert.equal(cardTranslationState(card, { status: "draft", source: card }), "draft");
    assert.equal(cardTranslationState(card, { status: "done", source: card }), "done");
    assert.equal(
      cardTranslationState(card, { status: "done", source: { name: card.name, text: "Deal 1 for each [Hidden] card." } }),
      "stale"
    );
  });

  it("ne voit pas de changement entre un texte absent et un texte vide", () => {
    assert.equal(cardTranslationState({ name: "Rune" }, { status: "done", source: { name: "Rune", text: "" } }), "done");
  });
});

describe("publishedTranslation", () => {
  const source = { name: "Jinx, Rebel" };

  it("ne montre pas un brouillon", () => {
    assert.equal(publishedTranslation({ fr: { status: "draft", name: "Jinx, Rebelle", source, updatedAt: "" } }, "fr"), undefined);
  });

  it("montre une traduction publiée, même si l'anglais a changé depuis", () => {
    assert.deepEqual(
      publishedTranslation({ fr: { status: "done", name: "Jinx, Rebelle", source: { name: "Jinx" }, updatedAt: "" } }, "fr"),
      { name: "Jinx, Rebelle", text: undefined }
    );
  });
});

describe("readCardTranslations", () => {
  it("ignore une entrée mal formée et date les autres", () => {
    const at = new Date("2026-10-24T12:00:00Z");
    assert.deepEqual(
      readCardTranslations({ fr: { status: "done", name: "Abandon", source: { name: "Abandon" }, updatedAt: at }, de: { name: "x" } }),
      { fr: { status: "done", name: "Abandon", text: undefined, source: { name: "Abandon", text: undefined }, updatedAt: at.toISOString(), updatedBy: undefined } }
    );
    assert.equal(readCardTranslations({ de: { name: "x" } }), undefined);
  });
});

describe("translateAttributeValue", () => {
  const lookup = glossaryLookup(glossary);

  it("traduit terme à terme et garde un terme laissé vide", () => {
    assert.deepEqual(translateAttributeValue(lookup, "tags", ["Teemo", "Bandle City", "Zaun"]), ["Teemo", "Bandle", "Zaun"]);
    assert.equal(translateAttributeValue(lookup, "type", "Unit"), "Unité");
    assert.equal(translateAttributeValue(lookup, "type", "Spell"), "Spell");
  });

  it("reprend la traduction d'un même terme rangé sous un autre attribut", () => {
    assert.deepEqual(translateAttributeValue(lookup, "types", ["Unit"]), ["Unité"]);
    // Un terme laissé vide exprès dans sa catégorie n'est pas traduit par une autre.
    assert.deepEqual(translateAttributeValue(glossaryLookup([...glossary, { field: "domain", en: "Zaun", value: "Zone" }]), "tags", ["Zaun"]), ["Zaun"]);
  });
});

describe("bracketedKeywords", () => {
  it("relève les mots-clés et pas les marqueurs", () => {
    assert.deepEqual(bracketedKeywords("[Accelerate]\n[Assault 2]\n[Level 3][>] [Equip [1]:rb_rune_body:]"), ["Accelerate", "Assault", "Level", "Equip"]);
  });
});

describe("sharesTranslationWith", () => {
  const source = { text: "Deal 3 to a unit." };

  it("traduit une réimpression au même texte, même déjà traduite", () => {
    assert.equal(sharesTranslationWith(source, { text: "Deal 3 to a unit.", translation: { source: { name: "Vi", text: "Old" } } }), true);
  });

  it("traduit une carte du même nom au texte différent tant qu'elle n'a pas sa propre traduction", () => {
    assert.equal(sharesTranslationWith(source, { text: "Deal 4 to a unit." }), true);
    assert.equal(sharesTranslationWith(source, { text: "Deal 4 to a unit.", translation: { source: { name: "Vi", text: "Deal 3 to a unit." } } }), true);
    assert.equal(sharesTranslationWith(source, { text: "Deal 4 to a unit.", translation: { source: { name: "Vi", text: "Deal 4 to a unit." } } }), false);
  });
});
