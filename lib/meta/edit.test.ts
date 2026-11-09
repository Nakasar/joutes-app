import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { metaDeckDescription, planMetaDeckEdit } from "./edit.ts";

const eventDate = new Date("2026-11-01T00:00:00Z");

describe("planMetaDeckEdit", () => {
  const imported = {
    name: "Rek'Sai · RC Europe 2026",
    description: metaDeckDescription({ source: "RC Europe 2026", placement: "1er" }),
    meta: { imported: true, source: "RC Europe 2026", placement: "1er" },
  };

  it("change le tournoi, la date, le classement, le joueur et le nom d'un deck importé", () => {
    const plan = planMetaDeckEdit(imported, {
      source: " Regional Lyon ",
      eventDate,
      placement: "3-4",
      pilot: "Alice",
      name: "Rek'Sai · Lyon",
    });
    assert.deepEqual(plan.$set, {
      "meta.source": "Regional Lyon",
      "meta.eventDate": eventDate,
      "meta.placement": "3e-4e",
      "meta.pilot": "Alice",
      description: "Liste relevée à Regional Lyon, classée 3e-4e, jouée par Alice.",
      name: "Rek'Sai · Lyon",
    });
    assert.deepEqual(plan.$unset, {});
    assert.equal(plan.rename, "Rek'Sai · Lyon");
  });

  it("efface un classement ou un joueur vidé", () => {
    const plan = planMetaDeckEdit(
      { ...imported, meta: { ...imported.meta, pilot: "Bob" } },
      { source: "RC Europe 2026", eventDate, placement: " ", pilot: "", name: imported.name }
    );
    assert.deepEqual(plan.$unset, { "meta.placement": "", "meta.pilot": "" });
    assert.equal(plan.rename, undefined);
    assert.equal(plan.$set.name, undefined);
  });

  it("garde le classement et le joueur quand ils ne sont pas fournis", () => {
    const meta = { ...imported.meta, pilot: "Bob" };
    const plan = planMetaDeckEdit({ ...imported, description: metaDeckDescription(meta), meta }, { source: "Regional Lyon", eventDate });
    assert.deepEqual(plan.$unset, {});
    assert.equal(plan.$set["meta.placement"], undefined);
    assert.equal(plan.$set["meta.pilot"], undefined);
    assert.equal(plan.$set.description, "Liste relevée à Regional Lyon, classée 1er, jouée par Bob.");
  });

  it("garde une description réécrite à la main", () => {
    const plan = planMetaDeckEdit({ ...imported, description: "Mon analyse du deck." }, { source: "Lyon", eventDate });
    assert.equal(plan.$set.description, undefined);
  });

  it("ne touche ni au nom ni au joueur d'un deck marqué", () => {
    const plan = planMetaDeckEdit(
      { name: "Mon deck", description: "Ma liste.", meta: { imported: false, source: "Lyon" } },
      { source: "Paris", eventDate, placement: "1", pilot: "Alice", name: "Autre nom" }
    );
    assert.deepEqual(plan.$set, { "meta.source": "Paris", "meta.eventDate": eventDate, "meta.placement": "1er" });
    assert.deepEqual(plan.$unset, {});
    assert.equal(plan.rename, undefined);
  });
});
