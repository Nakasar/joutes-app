import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityWindow, describeActivityDelta, summarizeActivity } from "./activity";

const NOW = new Date("2026-10-15T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe("activité de l'accueil de l'administration", () => {
  it("range la semaine en sept barres, un jour chacune, de la plus ancienne à la plus récente", () => {
    const window = activityWindow("week", NOW);
    const series = summarizeActivity([daysAgo(6.5), daysAgo(0.5), daysAgo(0.1), NOW], window);

    assert.deepEqual(series.buckets, [1, 0, 0, 0, 0, 0, 3]);
    assert.equal(series.total, 4);
  });

  it("compte à part la période d'avant et ignore ce qui est plus ancien", () => {
    const window = activityWindow("week", NOW);
    const series = summarizeActivity([daysAgo(8), daysAgo(13), daysAgo(15), daysAgo(2)], window);

    assert.equal(series.previous, 2);
    assert.equal(series.total, 1);
  });

  it("découpe trente jours en sept barres égales", () => {
    const window = activityWindow("month", NOW);
    const series = summarizeActivity([daysAgo(29), daysAgo(1)], window);

    assert.equal(series.buckets.length, 7);
    assert.equal(series.buckets[0], 1);
    assert.equal(series.buckets[6], 1);
  });

  it("dit l'écart avec la période d'avant", () => {
    assert.equal(
      describeActivityDelta({ total: 12, previous: 9, buckets: [] }, "week"),
      "+3 par rapport à la semaine d'avant"
    );
    assert.equal(
      describeActivityDelta({ total: 4, previous: 9, buckets: [] }, "month"),
      "−5 par rapport aux 30 jours d'avant"
    );
    assert.equal(describeActivityDelta({ total: 2, previous: 2, buckets: [] }, "week"), "Autant que la semaine d'avant");
  });
});
