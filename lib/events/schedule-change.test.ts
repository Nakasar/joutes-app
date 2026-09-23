import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasScheduleChanged, rescheduleMessage } from "./schedule-change";

describe("changement d'horaire", () => {
  it("compare des instants, pas des chaînes", () => {
    assert.equal(
      hasScheduleChanged(
        { startDateTime: "2026-10-01T17:00:00.000Z", endDateTime: "2026-10-01T21:00:00.000Z" },
        { startDateTime: "2026-10-01T19:00:00.000+02:00", endDateTime: "2026-10-01T23:00:00.000+02:00" }
      ),
      false
    );
  });

  it("repère un début ou une fin déplacés", () => {
    const before = { startDateTime: "2026-10-01T17:00:00Z", endDateTime: "2026-10-01T21:00:00Z" };
    assert.equal(hasScheduleChanged(before, { ...before, startDateTime: "2026-10-02T17:00:00Z" }), true);
    assert.equal(hasScheduleChanged(before, { ...before, endDateTime: "2026-10-01T22:00:00Z" }), true);
  });

  it("ignore un champ que la mise à jour ne touche pas", () => {
    assert.equal(hasScheduleChanged({ startDateTime: "2026-10-01T17:00:00Z" }, {}), false);
  });
});

describe("message de report", () => {
  it("donne l'ancienne et la nouvelle date à l'heure de Paris", () => {
    const { title, description } = rescheduleMessage(
      "Ligue du jeudi",
      { startDateTime: "2026-10-01T17:00:00Z" },
      { startDateTime: "2026-10-08T17:00:00Z" }
    );
    assert.equal(title, "📅 Horaire modifié");
    assert.match(description, /jeudi 8 octobre à 19:00/);
    assert.match(description, /au lieu du jeudi 1 octobre à 19:00/);
  });

  it("dit que seule la fin a changé quand le début ne bouge pas", () => {
    const { description } = rescheduleMessage(
      "Ligue du jeudi",
      { startDateTime: "2026-10-01T17:00:00Z" },
      { startDateTime: "2026-10-01T17:00:00Z" }
    );
    assert.match(description, /horaire de fin/);
  });
});
