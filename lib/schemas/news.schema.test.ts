import test from "node:test";
import assert from "node:assert/strict";
import { createNewsSchema, newsTranslationSchema, updateNewsSchema } from "@/lib/schemas/news.schema";

const VALID = {
  title: "FAQ Vendetta",
  summary: "Réponses à des questions fréquentes.",
  content: "Le corps de l'actualité.",
};

test("createNewsSchema accepte une source en http(s)", () => {
  const parsed = createNewsSchema.safeParse({
    ...VALID,
    source: { name: "Riftbound", url: "https://playriftbound.com/fr-fr/news/faq/" },
  });

  assert.equal(parsed.success, true);
});

test("createNewsSchema refuse une source dont le lien n'est pas une page", () => {
  // `z.string().url()` laisse passer ces deux-là : le lien de la source
  // atterrit dans un `href`, il ne doit désigner qu'une page à lire.
  for (const url of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "ftp://x.test/a"]) {
    const parsed = createNewsSchema.safeParse({ ...VALID, source: { name: "X", url } });
    assert.equal(parsed.success, false, url);
  }
});

test("createNewsSchema refuse une source sans nom", () => {
  const parsed = createNewsSchema.safeParse({
    ...VALID,
    source: { name: "", url: "https://x.test/a" },
  });

  assert.equal(parsed.success, false);
});

test("createNewsSchema se passe de source", () => {
  assert.equal(createNewsSchema.safeParse(VALID).success, true);
  assert.equal(createNewsSchema.safeParse({ ...VALID, source: null }).success, true);
});

test("updateNewsSchema accepte `null` pour retirer l'attribution", () => {
  const parsed = updateNewsSchema.safeParse({ source: null });

  assert.equal(parsed.success, true);
});

test("updateNewsSchema applique la même exigence au lien de la source", () => {
  const parsed = updateNewsSchema.safeParse({ source: { name: "X", url: "javascript:alert(1)" } });

  assert.equal(parsed.success, false);
});

test("createNewsSchema relit en français une actualité qui ne dit pas sa langue", () => {
  const parsed = createNewsSchema.safeParse(VALID);

  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.originalLang, "fr");
});

test("createNewsSchema n'accepte que les langues de l'application", () => {
  assert.equal(createNewsSchema.safeParse({ ...VALID, originalLang: "en" }).success, true);
  assert.equal(createNewsSchema.safeParse({ ...VALID, originalLang: "es" }).success, false);
});

test("newsTranslationSchema accepte une traduction seulement commencée", () => {
  // Une traduction se saisit en plusieurs fois : un champ vide affiche la VO
  // plutôt que de bloquer l'enregistrement du reste.
  const parsed = newsTranslationSchema.safeParse({ title: "Vendetta FAQ", summary: "", content: "" });

  assert.equal(parsed.success, true);
});

test("newsTranslationSchema borne les textes comme la VO", () => {
  assert.equal(newsTranslationSchema.safeParse({ title: "x".repeat(201) }).success, false);
  assert.equal(newsTranslationSchema.safeParse({ summary: "x".repeat(501) }).success, false);
});

test("newsTranslationSchema part de trois champs vides", () => {
  const parsed = newsTranslationSchema.safeParse({});

  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.success && parsed.data, { title: "", summary: "", content: "" });
});
