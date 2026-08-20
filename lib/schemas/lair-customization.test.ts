import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  lairCustomizationSchema,
  lairNewsCollectionSchema,
} from "@/lib/schemas/lair-customization.schema";

/**
 * Ce qu'un lieu peut écrire sur sa vitrine.
 *
 * Ce que ces cas verrouillent : aucune URL hors http(s) n'entre en base, le
 * vide vaut « non renseigné » plutôt que chaîne vide, la palette d'accents
 * reste fermée, et deux annonces ne peuvent pas être épinglées à la fois.
 *
 * Exécution : `npm run test`.
 */

const validNews = {
  id: "a1",
  title: "Fermeture exceptionnelle",
  publishedAt: "2026-08-18T10:00:00+02:00",
};

describe("lairCustomizationSchema", () => {
  it("accepte un formulaire vide", () => {
    assert.equal(lairCustomizationSchema.safeParse({}).success, true);
  });

  it("refuse une URL de lien hors http(s)", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,<script>", "file:///etc/passwd"]) {
      const result = lairCustomizationSchema.safeParse({
        links: [{ type: "website", url }],
      });
      assert.equal(result.success, false, url);
    }
  });

  it("accepte une URL http(s)", () => {
    const result = lairCustomizationSchema.safeParse({
      links: [{ type: "instagram", url: "https://instagram.com/antretemps" }],
    });
    assert.equal(result.success, true);
  });

  it("traduit le vide en « non renseigné »", () => {
    const result = lairCustomizationSchema.parse({
      contact: { phone: "  ", email: "" },
      about: { description: "" },
      featuredEventId: "",
    });

    assert.equal(result.contact?.phone, undefined);
    assert.equal(result.contact?.email, undefined);
    assert.equal(result.about?.description, undefined);
    assert.equal(result.featuredEventId, undefined);
  });

  it("n'accepte qu'un accent de la palette", () => {
    assert.equal(
      lairCustomizationSchema.safeParse({ theme: { accentColor: "#D8A150" } }).success,
      true,
    );
    assert.equal(
      lairCustomizationSchema.safeParse({ theme: { accentColor: "#123456" } }).success,
      false,
    );
    // Le vide reste admis : c'est « pas d'accent ».
    assert.equal(lairCustomizationSchema.safeParse({ theme: { accentColor: "" } }).success, true);
  });

  it("refuse une plage horaire à moitié renseignée", () => {
    assert.equal(
      lairCustomizationSchema.safeParse({ openingHours: [{ day: 1, open: "10:00" }] }).success,
      false,
    );
    assert.equal(
      lairCustomizationSchema.safeParse({
        openingHours: [{ day: 1, open: "10:00", close: "19:00" }],
      }).success,
      true,
    );
    // Un jour fermé n'a ni l'une ni l'autre.
    assert.equal(lairCustomizationSchema.safeParse({ openingHours: [{ day: 1 }] }).success, true);
  });

  it("borne les liens, les photos et les équipements", () => {
    const link = { type: "other" as const, url: "https://exemple.test" };
    assert.equal(
      lairCustomizationSchema.safeParse({ links: Array(7).fill(link) }).success,
      false,
    );
    assert.equal(
      lairCustomizationSchema.safeParse({
        about: { photos: Array(5).fill("https://exemple.test/p.jpg") },
      }).success,
      false,
    );
  });

  it("refuse une photo de galerie hors http(s)", () => {
    assert.equal(
      lairCustomizationSchema.safeParse({ about: { photos: ["javascript:alert(1)"] } }).success,
      false,
    );
  });
});

describe("lairNewsCollectionSchema", () => {
  it("accepte une liste vide et une annonce valide", () => {
    assert.equal(lairNewsCollectionSchema.safeParse([]).success, true);
    assert.equal(lairNewsCollectionSchema.safeParse([validNews]).success, true);
  });

  it("refuse deux annonces épinglées", () => {
    const result = lairNewsCollectionSchema.safeParse([
      { ...validNews, id: "a1", pinned: true },
      { ...validNews, id: "a2", pinned: true },
    ]);

    assert.equal(result.success, false);
  });

  it("accepte une seule annonce épinglée", () => {
    const result = lairNewsCollectionSchema.safeParse([
      { ...validNews, id: "a1", pinned: true },
      { ...validNews, id: "a2" },
    ]);

    assert.equal(result.success, true);
  });

  it("refuse un lien d'annonce hors http(s)", () => {
    assert.equal(
      lairNewsCollectionSchema.safeParse([{ ...validNews, link: "javascript:alert(1)" }]).success,
      false,
    );
  });

  it("exige un titre", () => {
    assert.equal(lairNewsCollectionSchema.safeParse([{ ...validNews, title: "  " }]).success, false);
  });
});
