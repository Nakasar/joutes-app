import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEventIcs } from "./ics.ts";

describe("buildEventIcs", () => {
  const ics = buildEventIcs(
    {
      id: "F3JO9YDx5iBN",
      name: "Braderie, édition d'automne",
      startDateTime: "2026-10-24T11:00:00+02:00",
      endDateTime: "2026-10-24T12:00:00Z",
      location: "L'Antre-Temps; Thionville",
      url: "https://www.joutes.app/events/F3JO9YDx5iBN",
    },
    new Date("2026-10-01T00:00:00Z")
  );

  it("écrit les heures en UTC", () => {
    assert.match(ics, /DTSTART:20261024T090000Z\r\n/);
    assert.match(ics, /DTEND:20261024T120000Z\r\n/);
  });

  it("échappe les virgules et points-virgules", () => {
    assert.match(ics, /SUMMARY:Braderie\\, édition d'automne\r\n/);
    assert.match(ics, /LOCATION:L'Antre-Temps\\; Thionville\r\n/);
  });

  it("donne un identifiant stable", () => {
    assert.match(ics, /UID:F3JO9YDx5iBN@joutes\.app/);
  });
});
