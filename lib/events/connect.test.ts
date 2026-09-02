import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import {
  buildManagerSource,
  findManagerSource,
  findPresetForUrl,
  isRefreshDue,
  nextRefreshAt,
  presetAsksVenues,
  summarizeGames,
  unknownGamesFromWarnings,
  venuesMatchingAddress,
} from "./connect";
import { GOBELIN_PRESET, OASIS_PRESET } from "./html-presets";

const PARIS = "Europe/Paris";

describe("reconnaissance d'une page par son domaine", () => {
  it("reconnaît les sites des préréglages, sous-domaine compris", () => {
    assert.equal(findPresetForUrl("https://www.antretemps.com/evenements-boutique-tournois/")?.key, "oasis");
    assert.equal(findPresetForUrl("https://www.lesanimationsdugobelin.com/animations")?.key, "gobelin");
    assert.equal(findPresetForUrl("HTTPS://LESANIMATIONSDUGOBELIN.COM/animations")?.key, "gobelin");
  });

  it("ne reconnaît ni un autre site, ni un domaine qui ressemble, ni une adresse cassée", () => {
    assert.equal(findPresetForUrl("https://www.ma-boutique-de-jeux.fr/agenda"), null);
    assert.equal(findPresetForUrl("https://notantretemps.com/"), null);
    assert.equal(findPresetForUrl("pas une adresse"), null);
  });

  it("dit quels préréglages demandent des villes", () => {
    assert.equal(presetAsksVenues(GOBELIN_PRESET), true);
    assert.equal(presetAsksVenues(OASIS_PRESET), false);
  });
});

describe("la source d'un gérant", () => {
  it("prend le préréglage, ses villes et ses alias, et se marque comme sienne", () => {
    const source = buildManagerSource(
      {
        url: "https://www.lesanimationsdugobelin.com/animations",
        presetKey: "gobelin",
        venues: [" Thionville ", "Metz", ""],
        gameAliases: { "Yu-Gi-Oh": "Yu-Gi-Oh!", " ": "x", "One Piece": " " },
      },
      GOBELIN_PRESET,
    );

    assert.equal(source.type, "HTML");
    assert.equal(source.managedBy, "owner");
    assert.deepEqual(source.htmlConfig?.venues, ["Thionville", "Metz"]);
    assert.equal(source.htmlConfig?.itemSelector, GOBELIN_PRESET.config.itemSelector);
    assert.deepEqual(source.formFields, GOBELIN_PRESET.formFields);
    assert.deepEqual(source.gameAliases, { "Yu-Gi-Oh": "Yu-Gi-Oh!" });
  });

  it("ne porte ni villes ni alias quand il n'y en a pas", () => {
    const source = buildManagerSource({ url: "https://www.antretemps.com/x", presetKey: "oasis" }, OASIS_PRESET);
    assert.equal(source.htmlConfig?.venues, undefined);
    assert.equal(source.gameAliases, undefined);
    assert.equal(source.formFields, undefined);
  });

  it("se retrouve parmi les sources du lieu, sans confondre celles de l'équipe", () => {
    const mine = buildManagerSource({ url: "https://www.antretemps.com/x", presetKey: "oasis" }, OASIS_PRESET);
    const theirs = { url: "https://example.com", type: "IA" as const };
    assert.equal(findManagerSource([theirs, mine]), mine);
    assert.equal(findManagerSource([theirs]), null);
    assert.equal(findManagerSource(undefined), null);
  });
});

describe("les villes cochées d'office", () => {
  it("coche celles que l'adresse du lieu nomme, aux accents et à la casse près", () => {
    assert.deepEqual(
      venuesMatchingAddress(["Thionville", "Metz", "Pont-à-Mousson"], "12 rue de la Gare, 57100 THIONVILLE"),
      ["Thionville"],
    );
    assert.deepEqual(venuesMatchingAddress(["Pont-à-Mousson", "Toul"], "1 place Duroc, Pont-a-Mousson"), [
      "Pont-à-Mousson",
    ]);
  });

  it("ne coche rien sans adresse", () => {
    assert.deepEqual(venuesMatchingAddress(["Thionville"], undefined), []);
  });
});

describe("résumé des jeux d'une lecture", () => {
  const games = [{ name: "Riftbound" }, { name: "Yu-Gi-Oh!" }];

  it("compte par jeu et met les inconnus en tête", () => {
    const summary = summarizeGames(
      [
        { gameName: "Riftbound" },
        { gameName: "Riftbound" },
        { gameName: "Yu-Gi-Oh" },
        { gameName: "Magic" },
        { gameName: "Cyberpunk TCG" },
      ],
      games,
    );

    assert.deepEqual(summary, [
      { name: "Cyberpunk TCG", canonical: null, count: 1 },
      { name: "Magic", canonical: null, count: 1 },
      { name: "Riftbound", canonical: "Riftbound", count: 2 },
      { name: "Yu-Gi-Oh", canonical: "Yu-Gi-Oh!", count: 1 },
    ]);
  });

  it("tient compte des alias du gérant", () => {
    assert.equal(summarizeGames([{ gameName: "YGO" }], games)[0].canonical, null);
    assert.equal(summarizeGames([{ gameName: "YGO" }], games, { YGO: "Yu-Gi-Oh!" })[0].canonical, "Yu-Gi-Oh!");
  });

  it("relit les jeux inconnus dans les avertissements d'un rapport", () => {
    assert.deepEqual(
      unknownGamesFromWarnings([
        "jeu inconnu de la plateforme : « Yu-Gi-Oh »",
        "statut « bientôt » inconnu, lu comme « available »",
        "jeu inconnu de la plateforme : « Yu-Gi-Oh »",
        "jeu inconnu de la plateforme : « Magic »",
      ]),
      ["Yu-Gi-Oh", "Magic"],
    );
  });
});

describe("rythme de lecture", () => {
  const wednesday = DateTime.fromISO("2026-09-02T08:00", { zone: PARIS });
  const thursday = DateTime.fromISO("2026-09-03T08:00", { zone: PARIS });

  it("relit chaque jour un lieu Pro qui l'a demandé", () => {
    assert.equal(isRefreshDue({ frequency: "daily", pro: true, now: thursday }), true);
  });

  it("ramène au mercredi un lieu qui a demandé le quotidien sans être Pro", () => {
    assert.equal(isRefreshDue({ frequency: "daily", pro: false, now: thursday }), false);
    assert.equal(isRefreshDue({ frequency: "daily", pro: false, now: wednesday }), true);
  });

  it("relit le mercredi par défaut", () => {
    assert.equal(isRefreshDue({ frequency: undefined, pro: true, now: wednesday }), true);
    assert.equal(isRefreshDue({ frequency: "weekly", pro: true, now: thursday }), false);
  });

  it("annonce la prochaine lecture : demain matin en quotidien, le prochain mercredi sinon", () => {
    const thursdayNoon = DateTime.fromISO("2026-09-03T12:00", { zone: PARIS });
    assert.equal(
      nextRefreshAt({ frequency: "daily", pro: true, now: thursdayNoon }).toISO(),
      DateTime.fromISO("2026-09-04T08:00", { zone: PARIS }).toISO(),
    );
    assert.equal(
      nextRefreshAt({ frequency: "daily", pro: false, now: thursdayNoon }).toISO(),
      DateTime.fromISO("2026-09-09T08:00", { zone: PARIS }).toISO(),
    );
    // Le mercredi avant 8 h : c'est ce matin.
    const wednesdayDawn = DateTime.fromISO("2026-09-02T06:30", { zone: PARIS });
    assert.equal(
      nextRefreshAt({ frequency: "weekly", pro: false, now: wednesdayDawn }).toISO(),
      DateTime.fromISO("2026-09-02T08:00", { zone: PARIS }).toISO(),
    );
    // Le mercredi après 8 h : dans une semaine.
    assert.equal(
      nextRefreshAt({ frequency: "weekly", pro: false, now: wednesday.plus({ hours: 1 }) }).toISO(),
      DateTime.fromISO("2026-09-09T08:00", { zone: PARIS }).toISO(),
    );
  });
});
