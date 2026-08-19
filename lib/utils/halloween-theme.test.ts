import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";

import { decorLevelAt, isInSeason, seasonBounds } from "@/lib/utils/halloween-theme.ts";

const at = (iso: string) => DateTime.fromISO(iso, { zone: "Europe/Paris" });

describe("isInSeason", () => {
  it("couvre tout octobre, bornes comprises", () => {
    assert.equal(isInSeason(at("2026-10-01T00:00")), true);
    assert.equal(isInSeason(at("2026-10-31T23:59")), true);
  });

  it("exclut septembre et novembre", () => {
    assert.equal(isInSeason(at("2026-09-30T23:59")), false);
    assert.equal(isInSeason(at("2026-11-01T00:00")), false);
  });

  it("situe l'instant dans le fuseau de la plateforme, pas en UTC", () => {
    // 30 septembre 23h30 UTC, soit le 1er octobre 1h30 à Paris : la saison a
    // commencé pour le visiteur, c'est son calendrier qui fait foi.
    assert.equal(isInSeason(DateTime.fromISO("2026-09-30T23:30", { zone: "utc" })), true);
  });
});

describe("decorLevelAt", () => {
  it("ne sort rien hors saison", () => {
    assert.equal(decorLevelAt(at("2026-08-15T12:00")), "aucun");
  });

  it("reste discret le début du mois", () => {
    assert.equal(decorLevelAt(at("2026-10-02T12:00")), "discret");
    assert.equal(decorLevelAt(at("2026-10-23T23:59")), "discret");
  });

  it("passe au décor complet la dernière semaine", () => {
    assert.equal(decorLevelAt(at("2026-10-24T00:00")), "complet");
    assert.equal(decorLevelAt(at("2026-10-31T20:00")), "complet");
  });
});

describe("seasonBounds", () => {
  it("borne le mois entier, dernier instant du 31 compris", () => {
    const { start, end } = seasonBounds(at("2026-10-15T12:00"));
    assert.equal(start.toISO(), at("2026-10-01T00:00:00.000").toISO());
    assert.equal(end.year, 2026);
    assert.equal(end.month, 10);
    assert.equal(end.day, 31);
    assert.equal(end.hour, 23);
  });

  it("renvoie la saison de l'année en cours, même consultée en novembre", () => {
    // Le bilan qui intéresse quelqu'un le 2 novembre est celui d'octobre qui
    // vient de s'achever, pas une saison vide.
    const { start, end } = seasonBounds(at("2026-11-02T09:00"));
    assert.equal(start.month, 10);
    assert.equal(start.year, 2026);
    assert.equal(end.day, 31);
  });
});
