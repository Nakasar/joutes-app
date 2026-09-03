import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readPosterOptions, resolvePosterStyle, type LairPosterSettings } from "./styles.ts";

const CUSTOM: LairPosterSettings = {
  branding: { logo: "https://exemple.fr/logo.png", title: "La Taverne", text: "Toute la programmation sur taverne.fr" },
  cta: { title: "Réservez", text: "Sur notre billetterie", url: "https://taverne.fr/billets" },
};

describe("resolvePosterStyle", () => {
  it("retombe sur le style par défaut quand le style Pro n'est plus payé", () => {
    assert.equal(resolvePosterStyle("tavern", true), "tavern");
    assert.equal(resolvePosterStyle("tavern", false), "joutes");
    assert.equal(resolvePosterStyle("board", false), "board");
    assert.equal(resolvePosterStyle("inconnu", true), "joutes");
  });
});

describe("readPosterOptions", () => {
  it("rend la signature et l'appel à l'action d'un lieu Pro", () => {
    const options = readPosterOptions(CUSTOM, true);

    assert.deepEqual(options.branding, CUSTOM.branding);
    assert.deepEqual(options.cta, CUSTOM.cta);
  });

  it("rend la signature de Joutes à un lieu qui n'est pas — ou plus — Pro", () => {
    const options = readPosterOptions(CUSTOM, false);

    assert.deepEqual(options.branding, {});
    assert.deepEqual(options.cta, {});
  });

  it("ne garde d'un champ vide que le vide : c'est le style qui écrit alors", () => {
    const options = readPosterOptions({ branding: { title: "  ", text: "" }, cta: { url: "" } }, true);

    assert.equal(options.branding.title, undefined);
    assert.equal(options.branding.text, undefined);
    assert.equal(options.cta.url, undefined);
  });

  it("laisse l'aperçu passer par-dessus les réglages enregistrés", () => {
    const options = readPosterOptions(CUSTOM, true, {
      branding: { title: "Autre nom" },
      cta: { url: "https://autre.fr" },
    });

    assert.equal(options.branding.title, "Autre nom");
    // Ce que l'aperçu ne demande pas reste ce qui est enregistré.
    assert.equal(options.branding.text, CUSTOM.branding?.text);
    assert.equal(options.cta.url, "https://autre.fr");
  });

  it("laisse l'aperçu vider un champ que la base porte encore", () => {
    // Le champ que le gérant vient d'effacer est envoyé vide, et non omis :
    // sans quoi l'aperçu ressortirait la valeur enregistrée jusqu'à la
    // sauvegarde.
    const options = readPosterOptions(CUSTOM, true, { branding: { title: "" }, cta: { url: "" } });

    assert.equal(options.branding.title, undefined);
    assert.equal(options.cta.url, undefined);
  });

  it("ignore la personnalisation demandée par l'aperçu d'un lieu non Pro", () => {
    const options = readPosterOptions({}, false, { branding: { title: "Mon lieu" } });

    assert.deepEqual(options.branding, {});
  });

  it("garde les réglages ouverts à tous, Pro ou non", () => {
    const options = readPosterOptions({ showAttendance: false, gameLogos: false }, false);

    assert.equal(options.showAttendance, false);
    assert.equal(options.gameLogos, false);
    assert.equal(options.style, "joutes");
  });
});
