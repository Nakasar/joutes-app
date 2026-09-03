import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";

import type { Event } from "@/lib/types/Event";
import { eventsInRange, groupByDay, groupByWeek, posterRange, readPosterStart } from "./period.ts";

const ZONE = "Europe/Paris";

function event(id: string, start: string, status: Event["status"] = "available"): Event {
  return {
    id,
    name: id,
    startDateTime: DateTime.fromISO(start, { zone: ZONE }).toISO() ?? start,
    endDateTime: DateTime.fromISO(start, { zone: ZONE }).plus({ hours: 3 }).toISO() ?? start,
    gameName: "Riftbound",
    status,
    addedBy: "USER",
  };
}

describe("posterRange", () => {
  it("cadre la semaine du lundi au dimanche, quel que soit le jour donné", () => {
    const range = posterRange("week", DateTime.fromISO("2026-09-10", { zone: ZONE }));

    assert.equal(range.start.toISODate(), "2026-09-07");
    assert.equal(range.end.toISODate(), "2026-09-13");
  });

  it("cadre le mois du premier au dernier jour", () => {
    const range = posterRange("month", DateTime.fromISO("2026-09-10", { zone: ZONE }));

    assert.equal(range.start.toISODate(), "2026-09-01");
    assert.equal(range.end.toISODate(), "2026-09-30");
  });
});

describe("readPosterStart", () => {
  it("retombe sur aujourd'hui quand la date est absente ou illisible", () => {
    const now = DateTime.fromISO("2026-09-02T15:00", { zone: ZONE });

    assert.equal(readPosterStart(undefined, now).toISODate(), "2026-09-02");
    assert.equal(readPosterStart("pas-une-date", now).toISODate(), "2026-09-02");
    assert.equal(readPosterStart("2026-09-20", now).toISODate(), "2026-09-20");
  });
});

describe("eventsInRange", () => {
  it("garde les événements de la période, sans les annulés, dans l'ordre", () => {
    const range = posterRange("week", DateTime.fromISO("2026-09-07", { zone: ZONE }));
    const kept = eventsInRange(
      [
        event("dimanche", "2026-09-13T23:30"),
        event("avant", "2026-09-06T20:00"),
        event("lundi", "2026-09-07T00:15"),
        event("annulé", "2026-09-09T19:00", "cancelled"),
        event("après", "2026-09-14T00:00"),
      ],
      range,
      ZONE,
    );

    assert.deepEqual(kept.map((item) => item.id), ["lundi", "dimanche"]);
  });
});

describe("groupByDay", () => {
  it("rend les sept jours, vides compris", () => {
    const range = posterRange("week", DateTime.fromISO("2026-09-07", { zone: ZONE }));
    const days = groupByDay([event("mer", "2026-09-09T19:30"), event("sam", "2026-09-12T10:00")], range, ZONE);

    assert.equal(days.length, 7);
    assert.deepEqual(days.map((day) => day.events.length), [0, 0, 1, 0, 0, 1, 0]);
    assert.equal(days[2].date.toISODate(), "2026-09-09");
  });
});

describe("groupByWeek", () => {
  it("coupe les semaines aux bornes du mois et tait les semaines vides", () => {
    const range = posterRange("month", DateTime.fromISO("2026-09-01", { zone: ZONE }));
    const weeks = groupByWeek(
      [event("premier", "2026-09-01T19:30"), event("milieu", "2026-09-18T20:00"), event("dernier", "2026-09-29T19:30")],
      range,
      ZONE,
    );

    assert.deepEqual(
      weeks.map((week) => [week.start.toISODate(), week.end.toISODate(), week.isoWeek, week.events.length]),
      [
        ["2026-09-01", "2026-09-06", 36, 1],
        ["2026-09-14", "2026-09-20", 38, 1],
        ["2026-09-28", "2026-09-30", 40, 1],
      ],
    );
  });
});
