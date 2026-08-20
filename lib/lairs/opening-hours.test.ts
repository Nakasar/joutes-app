import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import { formatOpeningRange, readOpeningState, weekOf } from "./opening-hours";

/**
 * Les horaires d'un lieu, et la pastille « Ouvert » qui en découle.
 *
 * Deux pièges valent d'être verrouillés : un lieu qui ferme après minuit ne
 * doit pas être déclaré fermé toute sa soirée, et un lieu sans horaires ne doit
 * jamais être annoncé ouvert — ni fermé — mais rester muet.
 *
 * Exécution : `npm run test`.
 */

/** Un jeudi, à l'heure demandée, en heure locale. */
const jeudi = (heure: number, minute = 0) =>
  DateTime.fromObject({ year: 2026, month: 8, day: 20, hour: heure, minute });

describe("readOpeningState", () => {
  it("reste muet sans horaires enregistrés", () => {
    const state = readOpeningState(undefined, "fr", jeudi(14));

    assert.equal(state.isOpen, null);
    assert.equal(state.today, null);
    assert.equal(state.closesAt, null);
  });

  it("déclare le lieu ouvert dans sa plage du jour", () => {
    const state = readOpeningState([{ day: 4, open: "10:00", close: "19:00" }], "fr", jeudi(14));

    assert.equal(state.isOpen, true);
    assert.equal(state.closesAt, "19h");
  });

  it("déclare le lieu fermé avant l'ouverture et après la fermeture", () => {
    const hours = [{ day: 4, open: "10:00", close: "19:00" }];

    assert.equal(readOpeningState(hours, "fr", jeudi(9, 59)).isOpen, false);
    assert.equal(readOpeningState(hours, "fr", jeudi(19)).isOpen, false);
  });

  it("déclare le lieu fermé un jour absent de la liste", () => {
    const state = readOpeningState([{ day: 6, open: "10:00", close: "23:00" }], "fr", jeudi(14));

    assert.equal(state.isOpen, false);
    assert.equal(state.today, null);
  });

  it("suit une plage qui déborde sur le lendemain", () => {
    // Ouvert le jeudi de 20h à 2h du matin : à 1h du matin le vendredi, c'est
    // encore la soirée du jeudi qui court.
    const hours = [{ day: 4, open: "20:00", close: "02:00" }];

    assert.equal(readOpeningState(hours, "fr", jeudi(23)).isOpen, true);
    assert.equal(readOpeningState(hours, "fr", jeudi(24).plus({ hours: 1 })).isOpen, true);
    assert.equal(readOpeningState(hours, "fr", jeudi(24).plus({ hours: 3 })).isOpen, false);
  });

  it("ignore une plage sans heure d'ouverture", () => {
    const state = readOpeningState([{ day: 4 }], "fr", jeudi(14));

    assert.equal(state.isOpen, false);
    assert.equal(state.closesAt, null);
  });
});

describe("formatOpeningRange", () => {
  it("écrit les heures rondes sans minutes en français", () => {
    assert.equal(formatOpeningRange({ day: 1, open: "10:00", close: "19:00" }, "fr"), "10h — 19h");
  });

  it("garde les minutes quand il y en a", () => {
    assert.equal(formatOpeningRange({ day: 1, open: "09:30", close: "19:00" }, "fr"), "9h30 — 19h");
  });

  it("rend `null` pour un jour fermé", () => {
    assert.equal(formatOpeningRange({ day: 1 }, "fr"), null);
    assert.equal(formatOpeningRange(undefined, "fr"), null);
  });
});

describe("weekOf", () => {
  it("complète la semaine, du lundi au dimanche", () => {
    const week = weekOf([{ day: 6, open: "10:00", close: "23:00" }]);

    assert.deepEqual(
      week.map((hours) => hours.day),
      [1, 2, 3, 4, 5, 6, 7],
    );
    assert.equal(week[5].open, "10:00");
    assert.equal(week[0].open, undefined);
  });
});
