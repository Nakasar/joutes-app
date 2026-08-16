import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TRADE_HISTORY_SORT,
  TRADE_HISTORY_MAX_PAGE_SIZE,
  TRADE_HISTORY_PAGE_SIZE,
  TRADE_HISTORY_WINDOW_DAYS,
  hasActiveHistoryFilters,
  historyWindowStart,
  isTradeHistorySort,
  parseHistoryDate,
  partnerMatches,
  resolveHistoryQuery,
} from "./history";

const NOW = new Date("2026-08-16T12:00:00.000Z");
const JOUR = 24 * 60 * 60 * 1000;

describe("fenêtre d'historique", () => {
  it("remonte à sept jours", () => {
    assert.equal(
      historyWindowStart(NOW).getTime(),
      NOW.getTime() - TRADE_HISTORY_WINDOW_DAYS * JOUR
    );
  });

  it("dure autant à toute date de l'année", () => {
    // Sept jours de calendrier n'en font pas toujours sept fois vingt-quatre :
    // dans un fuseau à heure d'été, la fenêtre vaudrait 167 ou 169 heures selon
    // la saison. Elle se compte donc en durée absolue.
    //
    // Réserve honnête : sur une machine réglée en UTC — les tests d'intégration
    // continue, notamment — les deux calculs coïncident et ce test ne les
    // distingue pas. Il mord sur un poste réglé à l'heure de Paris.
    const dates = [
      "2026-01-15T12:00:00.000Z",
      "2026-03-29T12:00:00.000Z", // passage à l'heure d'été en Europe
      "2026-06-15T12:00:00.000Z",
      "2026-10-25T12:00:00.000Z", // retour à l'heure d'hiver
      "2026-12-31T23:30:00.000Z",
    ].map((iso) => new Date(iso));

    const durees = new Set(
      dates.map((date) => date.getTime() - historyWindowStart(date).getTime())
    );

    assert.deepEqual([...durees], [TRADE_HISTORY_WINDOW_DAYS * JOUR]);
  });
});

describe("bornes de date", () => {
  it("étend une date seule au jour entier, en UTC", () => {
    assert.equal(parseHistoryDate("2026-08-10", "start")?.toISOString(), "2026-08-10T00:00:00.000Z");
    assert.equal(parseHistoryDate("2026-08-10", "end")?.toISOString(), "2026-08-10T23:59:59.999Z");
  });

  it("reprend tel quel un horodatage complet", () => {
    // Un client qui tient à ses propres minuits envoie le décalage : le serveur
    // n'a alors rien à deviner, et surtout rien à arrondir.
    assert.equal(
      parseHistoryDate("2026-08-10T22:00:00.000+02:00", "end")?.toISOString(),
      "2026-08-10T20:00:00.000Z"
    );
  });

  it("ignore ce qui n'est pas une date", () => {
    assert.equal(parseHistoryDate("hier", "start"), null);
    assert.equal(parseHistoryDate("2026-13-45", "start"), null);
    assert.equal(parseHistoryDate("", "start"), null);
    assert.equal(parseHistoryDate(null, "start"), null);
    assert.equal(parseHistoryDate(undefined, "end"), null);
  });
});

describe("historique sans abonnement", () => {
  it("impose la fenêtre de sept jours", () => {
    const query = resolveHistoryQuery({}, { fullHistory: false, now: NOW });

    assert.equal(query.windowed, true);
    assert.equal(query.from?.getTime(), historyWindowStart(NOW).getTime());
    assert.equal(query.to, null);
  });

  it("n'élargit pas la fenêtre par une date envoyée à la main", () => {
    // Le test qui justifie ce module. Les filtres sont masqués dans l'écran,
    // mais l'API reste appelable : sans cette règle, un `from` lointain rendrait
    // tout l'historique à qui ne l'a pas payé.
    const query = resolveHistoryQuery(
      { from: "2020-01-01", to: "2026-12-31" },
      { fullHistory: false, now: NOW }
    );

    assert.equal(query.from?.getTime(), historyWindowStart(NOW).getTime());
    assert.equal(query.to, null);
    assert.deepEqual(query.dropped, ["from", "to"]);
  });

  it("écarte la recherche de carte et de partenaire", () => {
    const query = resolveHistoryQuery(
      { card: "Île", partner: "Alice", sort: "oldest" },
      { fullHistory: false, now: NOW }
    );

    assert.equal(query.card, null);
    assert.equal(query.partner, null);
    assert.equal(query.sort, DEFAULT_TRADE_HISTORY_SORT);
    assert.deepEqual(query.dropped, ["card", "partner", "sort"]);
  });

  it("ne signale un refus que si quelque chose a été demandé", () => {
    // Sans quoi tout écran d'échange afficherait « vos filtres ont été
    // ignorés » à quelqu'un qui n'a rien filtré.
    assert.deepEqual(resolveHistoryQuery({}, { fullHistory: false, now: NOW }).dropped, []);
    assert.deepEqual(
      resolveHistoryQuery({ card: "   ", sort: "recent" }, { fullHistory: false, now: NOW }).dropped,
      []
    );
  });

  it("laisse la pagination ouverte", () => {
    // Paginer ne montre rien de plus : cela parcourt ce qui est déjà visible.
    const query = resolveHistoryQuery({ page: 3 }, { fullHistory: false, now: NOW });

    assert.equal(query.page, 3);
  });
});

describe("historique complet", () => {
  it("retient les filtres demandés", () => {
    const query = resolveHistoryQuery(
      { card: "  Contresort  ", partner: "Alice", from: "2026-01-01", to: "2026-06-30", sort: "oldest" },
      { fullHistory: true, now: NOW }
    );

    assert.equal(query.card, "Contresort");
    assert.equal(query.partner, "Alice");
    assert.equal(query.from?.toISOString(), "2026-01-01T00:00:00.000Z");
    assert.equal(query.to?.toISOString(), "2026-06-30T23:59:59.999Z");
    assert.equal(query.sort, "oldest");
    assert.equal(query.windowed, false);
    assert.deepEqual(query.dropped, []);
  });

  it("n'impose aucune borne quand aucune n'est demandée", () => {
    const query = resolveHistoryQuery({}, { fullHistory: true, now: NOW });

    assert.equal(query.from, null);
    assert.equal(query.to, null);
  });

  it("remet dans l'ordre un intervalle saisi à l'envers", () => {
    const query = resolveHistoryQuery(
      { from: "2026-06-30", to: "2026-01-01" },
      { fullHistory: true, now: NOW }
    );

    assert.equal(query.from?.toISOString(), "2026-01-01T00:00:00.000Z");
    assert.equal(query.to?.toISOString(), "2026-06-30T23:59:59.999Z");
  });

  it("retombe sur le tri par défaut quand il est inconnu", () => {
    assert.equal(
      resolveHistoryQuery({ sort: "prix" }, { fullHistory: true, now: NOW }).sort,
      DEFAULT_TRADE_HISTORY_SORT
    );
  });
});

describe("bornes de pagination", () => {
  it("ramène une page absurde à la première", () => {
    for (const page of [0, -3, Number.NaN]) {
      assert.equal(resolveHistoryQuery({ page }, { fullHistory: true, now: NOW }).page, 1);
    }
  });

  it("plafonne la taille de page", () => {
    assert.equal(
      resolveHistoryQuery({ limit: 5000 }, { fullHistory: true, now: NOW }).limit,
      TRADE_HISTORY_MAX_PAGE_SIZE
    );
    assert.equal(
      resolveHistoryQuery({ limit: 0 }, { fullHistory: true, now: NOW }).limit,
      TRADE_HISTORY_PAGE_SIZE
    );
  });
});

describe("filtres actifs", () => {
  it("distingue une demande d'un formulaire vide", () => {
    assert.equal(hasActiveHistoryFilters({}), false);
    assert.equal(hasActiveHistoryFilters({ card: "  ", partner: "", sort: "recent" }), false);
    assert.equal(hasActiveHistoryFilters({ card: "Île" }), true);
    assert.equal(hasActiveHistoryFilters({ sort: "oldest" }), true);
    assert.equal(hasActiveHistoryFilters({ from: "2026-01-01" }), true);
  });
});

describe("rapprochement d'un partenaire", () => {
  const alice = { username: "alice", displayName: "Amélie", discriminator: "4271" };

  it("ignore la casse et les accents", () => {
    assert.equal(partnerMatches(alice, "amelie"), true);
    assert.equal(partnerMatches(alice, "AMÉLIE"), true);
    assert.equal(partnerMatches(alice, "méli"), true);
  });

  it("reconnaît le nom d'utilisateur et le tag complet", () => {
    assert.equal(partnerMatches(alice, "alice"), true);
    assert.equal(partnerMatches(alice, "Amélie#4271"), true);
  });

  it("refuse ce qui ne correspond à rien", () => {
    assert.equal(partnerMatches(alice, "bob"), false);
    assert.equal(partnerMatches({ username: "bob" }, "amelie"), false);
  });

  it("laisse tout passer sur un terme vide", () => {
    assert.equal(partnerMatches(alice, "   "), true);
  });
});

describe("garde-type du tri", () => {
  it("ne reconnaît que les tris déclarés", () => {
    assert.equal(isTradeHistorySort("recent"), true);
    assert.equal(isTradeHistorySort("oldest"), true);
    assert.equal(isTradeHistorySort("toString"), false);
  });
});
