import test from "node:test";
import assert from "node:assert/strict";
import {
  availableNewsLangs,
  localizeNews,
  newsOriginalLang,
  parseLocale,
  resolveNewsLang,
} from "@/lib/news/localize";
import type { News } from "@/lib/types/News";

const CONTENT_UPDATED_AT = new Date("2026-08-10T00:00:00Z");

function newsWith(translations: News["translations"]): Pick<
  News,
  "title" | "summary" | "content" | "originalLang" | "contentUpdatedAt" | "translations"
> {
  return {
    title: "FAQ Vendetta",
    summary: "Réponses aux questions fréquentes.",
    content: "Le corps de la FAQ.",
    originalLang: "fr",
    contentUpdatedAt: CONTENT_UPDATED_AT,
    translations,
  };
}

const FULL_EN = {
  lang: "en" as const,
  title: "Vendetta FAQ",
  summary: "Answers to frequent questions.",
  content: "The body of the FAQ.",
  updatedAt: new Date("2026-08-11T00:00:00Z"),
};

test("availableNewsLangs met la VO en tête", () => {
  assert.deepEqual(availableNewsLangs(newsWith([FULL_EN])), ["fr", "en"]);
});

test("availableNewsLangs suit l'ordre des langues de l'application", () => {
  const news = newsWith([
    { ...FULL_EN, lang: "de" },
    { ...FULL_EN, lang: "en" },
    { ...FULL_EN, lang: "it" },
  ]);

  // L'ordre de saisie ne doit pas déplacer le sélecteur d'une actualité à
  // l'autre : c'est celui de `locales` qui fait foi.
  assert.deepEqual(availableNewsLangs(news), ["fr", "en", "it", "de"]);
});

test("availableNewsLangs ignore une traduction entièrement vide", () => {
  const news = newsWith([{ lang: "en", title: "", summary: "  ", content: "", updatedAt: new Date() }]);

  assert.deepEqual(availableNewsLangs(news), ["fr"]);
});

test("availableNewsLangs garde une traduction seulement commencée", () => {
  const news = newsWith([{ lang: "en", title: "Vendetta FAQ", summary: "", content: "", updatedAt: new Date() }]);

  assert.deepEqual(availableNewsLangs(news), ["fr", "en"]);
});

test("localizeNews rend la traduction demandée", () => {
  const localized = localizeNews(newsWith([FULL_EN]), "en");

  assert.equal(localized.lang, "en");
  assert.equal(localized.isTranslation, true);
  assert.equal(localized.title.text, "Vendetta FAQ");
  assert.equal(localized.content.text, "The body of the FAQ.");
});

test("localizeNews replie champ par champ sur la VO", () => {
  // Un résumé pas encore écrit ne doit pas emporter le corps avec lui.
  const news = newsWith([{ ...FULL_EN, summary: "   " }]);
  const localized = localizeNews(news, "en");

  assert.equal(localized.title.text, "Vendetta FAQ");
  assert.equal(localized.summary.text, "Réponses aux questions fréquentes.");
  assert.equal(localized.content.text, "The body of the FAQ.");
});

test("localizeNews dit la langue de chaque texte, pas seulement celle de la page", () => {
  // Le repli étant champ par champ, une étiquette unique en mentirait sur au
  // moins un : la synthèse vocale lirait le résumé français à l'anglaise.
  const localized = localizeNews(newsWith([{ ...FULL_EN, summary: "   " }]), "en");

  assert.equal(localized.lang, "en");
  assert.equal(localized.title.lang, "en");
  assert.equal(localized.summary.lang, "fr");
  assert.equal(localized.content.lang, "en");
});

test("localizeNews retombe sur la VO pour une langue non traduite", () => {
  const localized = localizeNews(newsWith([FULL_EN]), "de");

  assert.equal(localized.lang, "fr");
  assert.equal(localized.isTranslation, false);
  assert.equal(localized.title.text, "FAQ Vendetta");
  assert.equal(localized.title.lang, "fr");
});

test("localizeNews demandée dans la VO ne cherche pas de traduction", () => {
  const localized = localizeNews(newsWith([FULL_EN]), "fr");

  assert.equal(localized.isTranslation, false);
  assert.equal(localized.isStale, false);
});

test("localizeNews signale une traduction antérieure à la dernière retouche du texte", () => {
  const stale = newsWith([{ ...FULL_EN, updatedAt: new Date("2026-08-01T00:00:00Z") }]);

  assert.equal(localizeNews(stale, "en").isStale, true);
  assert.equal(localizeNews(newsWith([FULL_EN]), "en").isStale, false);
});

test("resolveNewsLang sert la langue de l'interface quand elle existe", () => {
  assert.equal(resolveNewsLang(newsWith([FULL_EN]), "en"), "en");
});

test("resolveNewsLang retombe sur la VO", () => {
  assert.equal(resolveNewsLang(newsWith([FULL_EN]), "it"), "fr");
  assert.equal(resolveNewsLang(newsWith([FULL_EN]), undefined), "fr");
});

test("newsOriginalLang tient les actualités écrites avant que la langue soit notée", () => {
  // @ts-expect-error — l'ancien document n'a pas de `originalLang`.
  assert.equal(newsOriginalLang({}), "fr");
});

test("parseLocale n'accepte que les langues de l'application", () => {
  assert.equal(parseLocale("en"), "en");
  assert.equal(parseLocale("fr"), "fr");
  assert.equal(parseLocale("es"), undefined);
  assert.equal(parseLocale("edit"), undefined);
  assert.equal(parseLocale("EN"), undefined);
});
