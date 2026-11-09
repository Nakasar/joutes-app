import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { cleanSetReleases } from "./settings.ts";
import { currentSetPeriod, setPeriods } from "./set-periods.ts";

describe("setPeriods", () => {
  const periods = setPeriods({ OGN: "2025-10-31", SFD: "2026-02-13", UNL: "2026-05-08" }, { SFD: "Spiritforged" });

  it("va d'une sortie à la veille de la suivante, la plus récente d'abord", () => {
    assert.deepEqual(periods, [
      { setCode: "UNL", name: "UNL", from: "2026-05-08" },
      { setCode: "SFD", name: "Spiritforged", from: "2026-02-13", to: "2026-05-07" },
      { setCode: "OGN", name: "OGN", from: "2025-10-31", to: "2026-02-12" },
    ]);
  });

  it("prend la dernière extension sortie au jour dit", () => {
    assert.equal(currentSetPeriod(periods, "2026-11-09")?.setCode, "UNL");
    assert.equal(currentSetPeriod(periods, "2026-03-01")?.setCode, "SFD");
    assert.equal(currentSetPeriod(periods, "2025-01-01"), undefined);
  });

  it("ne garde que des dates de sortie valides", () => {
    assert.deepEqual(cleanSetReleases({ OGN: "2025-10-31", SFD: "2026-02-30", "a b": "2026-01-01", UNL: 3 }), { OGN: "2025-10-31" });
  });
});
