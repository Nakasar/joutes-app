import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lairPosterSettingsSchema } from "./lair-poster.schema.ts";

describe("lairPosterSettingsSchema", () => {
  it("accepte les réglages seuls, sans personnalisation du pied d'affiche", () => {
    const result = lairPosterSettingsSchema.safeParse({ style: "tavern", showAttendance: false });

    assert.equal(result.success, true);
    assert.equal(result.data?.branding, undefined);
  });

  it("ramène les champs vides à « non renseigné », et non à une chaîne vide", () => {
    const result = lairPosterSettingsSchema.safeParse({
      branding: { logo: "", title: "  ", text: "" },
      cta: { title: "", text: "", url: "" },
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.data?.branding, { logo: undefined, title: undefined, text: undefined });
    assert.deepEqual(result.data?.cta, { title: undefined, text: undefined, url: undefined });
  });

  it("vide une URL faite d'espaces, plutôt que de refuser l'enregistrement entier", () => {
    // Deux espaces collés dans le champ sont un champ vidé, comme pour un
    // texte : les refuser faisait échouer la sauvegarde de toute l'affiche.
    const result = lairPosterSettingsSchema.safeParse({ branding: { logo: "  " }, cta: { url: " \t " } });

    assert.equal(result.success, true);
    assert.equal(result.data?.branding?.logo, undefined);
    assert.equal(result.data?.cta?.url, undefined);
  });

  it("garde la signature et l'appel à l'action d'un lieu, espaces rognés", () => {
    const result = lairPosterSettingsSchema.safeParse({
      branding: { logo: "https://exemple.fr/logo.png", title: " La Taverne ", text: "Tout sur taverne.fr" },
      cta: { title: "Réservez", text: "Billetterie en ligne", url: "https://taverne.fr/billets" },
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.branding?.title, "La Taverne");
    assert.equal(result.data?.cta?.url, "https://taverne.fr/billets");
  });

  it("refuse une adresse qui n'est pas en http(s) — un QR code se scanne sans se lire", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,<script>", "taverne.fr/billets"]) {
      assert.equal(lairPosterSettingsSchema.safeParse({ cta: { url } }).success, false, url);
      assert.equal(lairPosterSettingsSchema.safeParse({ branding: { logo: url } }).success, false, url);
    }
  });

  it("refuse un titre plus long que le pied d'affiche ne peut porter", () => {
    assert.equal(lairPosterSettingsSchema.safeParse({ branding: { title: "x".repeat(41) } }).success, false);
    assert.equal(lairPosterSettingsSchema.safeParse({ cta: { title: "x".repeat(61) } }).success, false);
  });
});
