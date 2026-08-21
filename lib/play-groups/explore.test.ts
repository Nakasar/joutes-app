import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  distanceKm,
  isFreshLive,
  foldSearchText,
  matchesExploreQuery,
  readActivityRank,
  readExploreOrder,
  readInitials,
  sortExploreGroups,
  type ExploreGroup,
} from "./explore";

/**
 * L'ordre du rôle d'armes.
 *
 * Ce que ces cas verrouillent : un direct passe devant tout, une publication
 * d'hier devant une publication du mois dernier, et un lieu libre — qui n'a pas
 * d'adresse — ne se retrouve jamais en tête du tri par distance sous prétexte
 * qu'il n'a pas de coordonnées.
 *
 * Exécution : `npm run test`.
 */

const NOW = Date.parse("2026-08-21T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function group(overrides: Partial<ExploreGroup> = {}): ExploreGroup {
  return {
    id: "g",
    name: "Groupe",
    initials: "G",
    tagline: null,
    accentColor: null,
    logo: null,
    rhythmLabel: null,
    place: null,
    placeCoordinates: null,
    gameNames: [],
    memberCount: 0,
    followerCount: 0,
    publishedCount: 0,
    lives: [],
    lastDeed: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    activityRank: 0,
    ...overrides,
  };
}

describe("readActivityRank", () => {
  it("met un direct hors d'atteinte de tout le reste", () => {
    const live = readActivityRank({ liveCount: 1, now: NOW });
    const fresh = readActivityRank({ liveCount: 0, lastDeedAt: new Date(NOW).toISOString(), now: NOW });

    assert.ok(live > fresh, `${live} devrait dépasser ${fresh}`);
  });

  it("départage deux groupes en direct par le nombre de diffuseurs", () => {
    assert.ok(readActivityRank({ liveCount: 3, now: NOW }) > readActivityRank({ liveCount: 1, now: NOW }));
  });

  it("fait décroître la valeur d'une publication avec le temps", () => {
    const hier = readActivityRank({ liveCount: 0, lastDeedAt: new Date(NOW - DAY).toISOString(), now: NOW });
    const moisDernier = readActivityRank({ liveCount: 0, lastDeedAt: new Date(NOW - 25 * DAY).toISOString(), now: NOW });

    assert.ok(hier > moisDernier);
    assert.ok(moisDernier > 0);
  });

  it("ignore une publication plus vieille que la fenêtre", () => {
    assert.equal(readActivityRank({ liveCount: 0, lastDeedAt: new Date(NOW - 90 * DAY).toISOString(), now: NOW }), 0);
  });

  it("donne le maximum à une session en cours", () => {
    // La couche base date une session commencée mais non terminée à `now` :
    // l'attente est nulle, donc la valeur est pleine.
    const enCours = readActivityRank({ liveCount: 0, nextSessionAt: new Date(NOW).toISOString(), now: NOW });
    const dansTroisJours = readActivityRank({
      liveCount: 0,
      nextSessionAt: new Date(NOW + 3 * DAY).toISOString(),
      now: NOW,
    });

    assert.ok(enCours > dansTroisJours);
  });

  it("compte une session à venir, jamais une session passée", () => {
    const aVenir = readActivityRank({ liveCount: 0, nextSessionAt: new Date(NOW + 2 * DAY).toISOString(), now: NOW });
    const passee = readActivityRank({ liveCount: 0, nextSessionAt: new Date(NOW - 2 * DAY).toISOString(), now: NOW });

    assert.ok(aVenir > 0);
    assert.equal(passee, 0);
  });

  it("retombe à zéro pour un groupe sans aucun signe de vie", () => {
    assert.equal(readActivityRank({ liveCount: 0, now: NOW }), 0);
  });

  it("ne se laisse pas casser par une date illisible", () => {
    assert.equal(readActivityRank({ liveCount: 0, lastDeedAt: "pas une date", now: NOW }), 0);
  });
});

describe("isFreshLive", () => {
  it("accepte un direct commencé il y a une heure", () => {
    assert.ok(isFreshLive(new Date(NOW - 60 * 60 * 1000).toISOString(), NOW));
  });

  it("laisse passer un marathon de vingt heures", () => {
    assert.ok(isFreshLive(new Date(NOW - 20 * 60 * 60 * 1000).toISOString(), NOW));
  });

  it("écarte un direct déclaré la veille et jamais retiré", () => {
    assert.equal(isFreshLive(new Date(NOW - 30 * 60 * 60 * 1000).toISOString(), NOW), false);
  });

  it("écarte une date absente ou illisible", () => {
    assert.equal(isFreshLive(null, NOW), false);
    assert.equal(isFreshLive("pas une date", NOW), false);
  });
});

describe("sortExploreGroups", () => {
  const vif = group({ id: "vif", name: "Vif", activityRank: 1001 });
  const tiede = group({ id: "tiede", name: "Tiède", activityRank: 300 });
  const dormeur = group({ id: "dormeur", name: "Dormeur", activityRank: 0 });

  it("classe par activité par défaut", () => {
    const sorted = sortExploreGroups([dormeur, vif, tiede], "vifs");

    assert.deepEqual(
      sorted.map((item) => item.id),
      ["vif", "tiede", "dormeur"],
    );
  });

  it("classe les derniers venus par date de création décroissante", () => {
    const ancien = group({ id: "ancien", createdAt: "2024-02-01T00:00:00.000Z" });
    const recent = group({ id: "recent", createdAt: "2026-08-01T00:00:00.000Z" });

    assert.deepEqual(
      sortExploreGroups([ancien, recent], "neufs").map((item) => item.id),
      ["recent", "ancien"],
    );
  });

  it("classe par distance, et renvoie en fin de liste les lieux sans adresse", () => {
    const origin = { longitude: 6.1667, latitude: 49.3667 };
    const proche = group({ id: "proche", placeCoordinates: { longitude: 6.17, latitude: 49.37 } });
    const loin = group({ id: "loin", placeCoordinates: { longitude: 6.1757, latitude: 49.1193 } });
    const sansAdresse = group({ id: "sans-adresse", activityRank: 900 });

    assert.deepEqual(
      sortExploreGroups([loin, sansAdresse, proche], "proches", origin).map((item) => item.id),
      ["proche", "loin", "sans-adresse"],
    );
  });

  it("retombe sur l'activité quand la position est inconnue", () => {
    assert.deepEqual(
      sortExploreGroups([dormeur, vif], "proches", null).map((item) => item.id),
      ["vif", "dormeur"],
    );
  });

  it("ne modifie pas le tableau reçu", () => {
    const input = [dormeur, vif];
    sortExploreGroups(input, "vifs");

    assert.equal(input[0].id, "dormeur");
  });
});

describe("matchesExploreQuery", () => {
  const corbeaux = group({
    name: "Les Corbeaux de Thionville",
    tagline: "On joue sérieusement",
    rhythmLabel: "Tous les mardis à 20h",
    place: { kind: "joutes", label: "La Médiathèque de Florange" },
    gameNames: ["Riftbound", "Altered"],
  });

  it("trouve sans les accents", () => {
    assert.ok(matchesExploreQuery(corbeaux, foldSearchText("mediatheque")));
    assert.ok(matchesExploreQuery(corbeaux, foldSearchText("SÉRIEUSEMENT")));
  });

  it("cherche aussi dans le jour et dans le jeu", () => {
    assert.ok(matchesExploreQuery(corbeaux, foldSearchText("mardi")));
    assert.ok(matchesExploreQuery(corbeaux, foldSearchText("altered")));
  });

  it("laisse tout passer quand la recherche est vide", () => {
    assert.ok(matchesExploreQuery(group(), ""));
  });

  it("écarte ce qui ne correspond pas", () => {
    assert.equal(matchesExploreQuery(corbeaux, foldSearchText("pokemon")), false);
  });
});

describe("readExploreOrder", () => {
  it("accepte les trois ordres connus", () => {
    assert.equal(readExploreOrder("proches"), "proches");
    assert.equal(readExploreOrder("neufs"), "neufs");
  });

  it("retombe sur les plus vifs pour tout le reste", () => {
    assert.equal(readExploreOrder(undefined), "vifs");
    assert.equal(readExploreOrder("n-importe-quoi"), "vifs");
  });
});

describe("readInitials", () => {
  it("saute les articles et les particules", () => {
    assert.equal(readInitials("Les Corbeaux de Thionville"), "CT");
    assert.equal(readInitials("Le Cercle d'Altered"), "CA");
  });

  it("se contente de ce qu'il y a", () => {
    assert.equal(readInitials("Antre"), "A");
    assert.equal(readInitials("   "), "?");
  });

  it("ne rend jamais plus de deux lettres", () => {
    assert.equal(readInitials("Nuit Blanche TCG Grand Est"), "NB");
  });
});

describe("distanceKm", () => {
  it("mesure Thionville — Metz à une trentaine de kilomètres", () => {
    const thionville = { longitude: 6.1667, latitude: 49.3667 };
    const metz = { longitude: 6.1757, latitude: 49.1193 };

    const distance = distanceKm(thionville, metz);

    assert.ok(distance > 26 && distance < 30, `distance inattendue : ${distance}`);
  });

  it("rend zéro pour un point et lui-même", () => {
    const point = { longitude: 6.1667, latitude: 49.3667 };

    assert.equal(distanceKm(point, point), 0);
  });
});
