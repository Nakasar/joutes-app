import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import {
  findOverlappingDay,
  formatOpeningRange,
  formatOpeningRanges,
  readOpeningState,
  weekOf,
} from "./opening-hours";

/**
 * Les horaires d'un lieu, et la pastille « Ouvert » qui en découle.
 *
 * Trois pièges valent d'être verrouillés : un lieu qui ferme après minuit ne
 * doit pas être déclaré fermé toute sa soirée, un lieu sans horaires ne doit
 * jamais être annoncé ouvert — ni fermé — mais rester muet, et un horaire coupé
 * ne doit pas promettre la fermeture du soir pendant la pause de midi.
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
    assert.deepEqual(state.today, []);
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
    assert.deepEqual(state.today, []);
  });

  it("lit le dimanche écrit `0` comme le dimanche", () => {
    // Les horaires les plus anciens numérotent les jours comme `Date#getDay` :
    // le dimanche y vaut 0, non 7. Les lire tels quels effaçait le dimanche.
    const dimanche = jeudi(14).plus({ days: 3 });
    const state = readOpeningState([{ day: 0, open: "10:00", close: "19:00" }], "fr", dimanche);

    assert.equal(state.isOpen, true);
    assert.equal(state.closesAt, "19h");
    assert.equal(weekOf([{ day: 0, open: "10:00", close: "19:00" }])[6].ranges.length, 1);
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

describe("readOpeningState, horaires coupés", () => {
  /** Jeudi 10h — 12h, puis 14h — 19h. */
  const coupe = [
    { day: 4, open: "14:00", close: "19:00" },
    { day: 4, open: "10:00", close: "12:00" },
  ];

  it("range les plages du jour dans l'ordre, quel que soit celui de la base", () => {
    assert.deepEqual(
      readOpeningState(coupe, "fr", jeudi(11)).today.map((hours) => hours.open),
      ["10:00", "14:00"],
    );
  });

  it("ferme le lieu pendant la coupure", () => {
    assert.equal(readOpeningState(coupe, "fr", jeudi(11)).isOpen, true);
    assert.equal(readOpeningState(coupe, "fr", jeudi(13)).isOpen, false);
    assert.equal(readOpeningState(coupe, "fr", jeudi(15)).isOpen, true);
  });

  it("annonce la fermeture de la plage en cours, non celle du soir", () => {
    // Promettre 19h à 11h du matin enverrait le visiteur devant une porte close
    // à midi : c'est la plage qui court qui donne l'heure.
    assert.equal(readOpeningState(coupe, "fr", jeudi(11)).closesAt, "12h");
    assert.equal(readOpeningState(coupe, "fr", jeudi(15)).closesAt, "19h");
    assert.equal(readOpeningState(coupe, "fr", jeudi(13)).closesAt, null);
  });

  it("suit une soirée qui déborde après une coupure", () => {
    const hours = [
      { day: 4, open: "10:00", close: "12:00" },
      { day: 4, open: "20:00", close: "02:00" },
    ];

    assert.equal(readOpeningState(hours, "fr", jeudi(24).plus({ hours: 1 })).isOpen, true);
    assert.equal(readOpeningState(hours, "fr", jeudi(24).plus({ hours: 3 })).isOpen, false);
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

describe("formatOpeningRanges", () => {
  it("écrit les plages d'un jour coupé, dans l'ordre reçu", () => {
    assert.deepEqual(
      formatOpeningRanges(
        [
          { day: 2, open: "10:00", close: "12:00" },
          { day: 2, open: "14:00", close: "19:00" },
        ],
        "fr",
      ),
      ["10h — 12h", "14h — 19h"],
    );
  });

  it("rend une liste vide pour un jour fermé", () => {
    assert.deepEqual(formatOpeningRanges([], "fr"), []);
  });
});

describe("weekOf", () => {
  it("complète la semaine, du lundi au dimanche", () => {
    const week = weekOf([{ day: 6, open: "10:00", close: "23:00" }]);

    assert.deepEqual(
      week.map((day) => day.day),
      [1, 2, 3, 4, 5, 6, 7],
    );
    assert.equal(week[5].ranges[0].open, "10:00");
    assert.deepEqual(week[0].ranges, []);
  });

  it("réunit les plages d'un même jour sur sa ligne", () => {
    const week = weekOf([
      { day: 2, open: "14:00", close: "19:00" },
      { day: 2, open: "10:00", close: "12:00" },
    ]);

    assert.deepEqual(
      week[1].ranges.map((hours) => hours.open),
      ["10:00", "14:00"],
    );
  });
});

describe("findOverlappingDay", () => {
  it("laisse passer une coupure nette", () => {
    assert.equal(
      findOverlappingDay([
        { day: 2, open: "10:00", close: "12:00" },
        { day: 2, open: "14:00", close: "19:00" },
      ]),
      null,
    );
  });

  it("laisse passer deux plages qui se touchent", () => {
    assert.equal(
      findOverlappingDay([
        { day: 2, open: "10:00", close: "12:00" },
        { day: 2, open: "12:00", close: "19:00" },
      ]),
      null,
    );
  });

  it("relève deux plages qui se recouvrent", () => {
    assert.equal(
      findOverlappingDay([
        { day: 2, open: "10:00", close: "14:00" },
        { day: 2, open: "12:00", close: "19:00" },
      ]),
      2,
    );
  });

  it("refuse une plage de nuit suivie d'une autre le même jour", () => {
    // « 20h — 2h » occupe déjà la nuit : ce qui la suit tomberait dedans.
    assert.equal(
      findOverlappingDay([
        { day: 5, open: "20:00", close: "02:00" },
        { day: 5, open: "22:00", close: "23:00" },
      ]),
      5,
    );
  });

  it("ne confond pas deux jours différents", () => {
    assert.equal(
      findOverlappingDay([
        { day: 2, open: "10:00", close: "19:00" },
        { day: 3, open: "10:00", close: "19:00" },
      ]),
      null,
    );
  });
});
