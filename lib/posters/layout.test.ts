import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planPosterBody, posterBodyHeight, type PosterGroup } from "./layout.ts";
import type { PosterEvent } from "./format.ts";

const EVENT = { id: "e", name: "Tournoi", time: "19:00", timeFr: "19h00", dateShort: "mar. 1", game: { name: "Riftbound", short: "Riftbound", color: "#000" }, full: false } as PosterEvent;

const group = (count: number, titled = false): PosterGroup => ({
  titled,
  events: Array.from({ length: count }, (_, index) => ({ ...EVENT, id: `e${index}` })),
});

const shown = (plan: { kept: PosterEvent[][] }) => plan.kept.reduce((total, kept) => total + kept.length, 0);

describe("posterBodyHeight", () => {
  it("laisse moins de place à un nom qui se replie", () => {
    const short = posterBodyHeight({ name: "Le Repaire" });
    const long = posterBodyHeight({ name: "La Caverne du Gobelin et des Dés Enchantés de Bretagne" });

    assert.ok(long < short, "un nom sur deux lignes prend la place du corps");
  });

  it("compte l'adresse quand il y en a une", () => {
    assert.ok(posterBodyHeight({ name: "Le Repaire", address: "12 rue des Dés" }) < posterBodyHeight({ name: "Le Repaire" }));
  });
});

describe("planPosterBody", () => {
  it("ne rétrécit rien quand la semaine tient", () => {
    const plan = planPosterBody([group(2), group(1)], 700);

    assert.equal(plan.scale, 1);
    assert.equal(plan.hidden, 0);
    assert.equal(shown(plan), 3);
  });

  it("rétrécit avant de couper", () => {
    const plan = planPosterBody([group(6), group(6)], 520);

    assert.ok(plan.scale < 1);
    assert.equal(plan.hidden, 0, "tout tient encore, en plus petit");
    assert.equal(shown(plan), 12);
  });

  it("cesse de rétrécir et compte ce qu'elle ne montre pas", () => {
    // Passé le seuil de lisibilité, une affiche qui continuerait de réduire ne
    // dirait plus rien à personne : elle écrit ce qu'elle peut, et annonce le
    // reste.
    const plan = planPosterBody([group(40)], 300);

    assert.ok(plan.scale > 0.5, "l'échelle a un plancher");
    assert.ok(plan.hidden > 0);
    assert.equal(shown(plan) + plan.hidden, 40);
  });

  it("laisse la carte suivante essayer quand la précédente a tout pris", () => {
    // Une semaine chargée ne doit pas faire disparaître la fin du mois : ce qui
    // suit s'écrit si la place le permet encore.
    const plan = planPosterBody([group(40, true), group(1, true)], 400);

    assert.ok(plan.hidden > 0);
    assert.ok(shown(plan) > 0);
  });

  it("tient une affiche sans le moindre événement", () => {
    const plan = planPosterBody([], 700);

    assert.equal(plan.scale, 1);
    assert.equal(plan.hidden, 0);
    assert.deepEqual(plan.kept, []);
  });
});
