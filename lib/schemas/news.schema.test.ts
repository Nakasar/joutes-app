import test from "node:test";
import assert from "node:assert/strict";
import { createNewsSchema, updateNewsSchema } from "@/lib/schemas/news.schema";

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
