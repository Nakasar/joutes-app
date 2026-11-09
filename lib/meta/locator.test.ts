import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { DeckCardInfo } from "../decks/contents.ts";
import { getDeckZones } from "../decks/zones.ts";
import {
  inferLegendAndChampion,
  legendsByRegistration,
  locatorDeckToParsed,
  parseLocatorEventId,
  toLocatorEvent,
  toLocatorMatches,
  toLocatorStandings,
} from "./locator.ts";

const zones = getDeckZones({ slug: "riftbound" });

describe("parseLocatorEventId", () => {
  it("lit un lien, avec ou sans langue, ou le numéro seul", () => {
    assert.equal(parseLocatorEventId("https://locator.riftbound.uvsgames.com/events/1227032"), 1227032);
    assert.equal(parseLocatorEventId("locator.riftbound.uvsgames.com/fr/events/1227032?tab=standings"), 1227032);
    assert.equal(parseLocatorEventId(" 1227032 "), 1227032);
  });

  it("refuse un autre site", () => {
    assert.equal(parseLocatorEventId("https://piltoverarchive.com/events/1227032"), null);
    assert.equal(parseLocatorEventId("https://locator.riftbound.uvsgames.com/stores/12"), null);
  });
});

describe("toLocatorEvent", () => {
  it("prend le jour au fuseau de l'évènement et la dernière ronde classée de chaque phase", () => {
    const event = toLocatorEvent(
      {
        name: "Riftbound Regional Championship: Europe",
        start_datetime: "2026-11-05T23:30:00+00:00",
        timezone: "Europe/Berlin",
        full_address: "Messepiazza 1, 70629 Stuttgart, Germany",
        starting_player_count: 315,
        display_status: "complete",
        settings: { decklist_status: "PUBLISHED" },
        gameplay_format: { name: "Constructed" },
        tournament_phases: [
          { order_in_phases: 1, rounds: [{ id: 1, standings_status: "GENERATED" }, { id: 2, standings_status: "GENERATED" }] },
          { order_in_phases: 2, rounds: [{ id: 3, standings_status: "GENERATED" }, { id: 4, standings_status: "PENDING" }] },
        ],
      },
      1227032
    );
    assert.equal(event.date, "2026-11-06");
    assert.equal(event.finished, true);
    assert.equal(event.decklistsPublished, true);
    assert.equal(event.format, "Constructed");
    assert.deepEqual(event.standingRoundIds, [3, 2]);
    assert.equal(event.url, "https://locator.riftbound.uvsgames.com/events/1227032");
  });
});

describe("toLocatorStandings", () => {
  it("range par place finale, met les non classés à la fin et rattache la légende", () => {
    const legends = legendsByRegistration([
      { user_event_status: { id: 10, deck_defining_card: { name: "Riven, The Exile" } } },
      { user_event_status: { id: 11, deck_defining_card: null } },
    ]);
    const standings = toLocatorStandings(
      [
        { id: 11, best_identifier: "Lift", matches_won: 1, matches_lost: 4, final_place_in_standings: 253, deck_id: "b" },
        { id: 12, best_identifier: "Zed", final_place_in_standings: null },
        { id: 10, best_identifier: "DiamondHat", matches_won: 11, matches_lost: 3, matches_drawn: 0, final_place_in_standings: 1, deck_id: "a" },
      ],
      legends
    );
    assert.deepEqual(
      standings.map((standing) => [standing.place, standing.player, standing.record, standing.legend]),
      [
        [1, "DiamondHat", "11-3-0", "Riven, The Exile"],
        [253, "Lift", "1-4-0", undefined],
        [undefined, "Zed", "0-0-0", undefined],
      ]
    );
  });
});

describe("locatorDeckToParsed", () => {
  it("range les sections et ajoute la légende du classement", () => {
    const parsed = locatorDeckToParsed(
      {
        sections: [
          { section_type: "main", cards: [{ quantity: 3, card: { name: "Stupefy" } }] },
          { section_type: "rune_pool", cards: [{ quantity: 7, card: { name: "Order Rune" } }] },
          { section_type: "sideboard", cards: [{ quantity: 2, card: { name: "Salvage" } }] },
          { section_type: "legend", cards: [] },
          { section_type: "Neeko Board", cards: [{ quantity: 1, card: { name: "Neeko" } }] },
        ],
      },
      zones,
      "Riven, The Exile"
    );
    assert.deepEqual(parsed.lines, [
      { zone: "legend", name: "Riven, The Exile", quantity: 1 },
      { zone: "maindeck", name: "Stupefy", quantity: 3 },
      { zone: "runes", name: "Order Rune", quantity: 7 },
      { zone: "sideboard", name: "Salvage", quantity: 2 },
    ]);
    assert.deepEqual(parsed.ignored, ["1 Neeko"]);
  });
});

describe("inferLegendAndChampion", () => {
  const card = (id: string, name: string, extra: Partial<DeckCardInfo> = {}): DeckCardInfo => ({ id, name, ...extra });
  const catalog = new Map(
    [
      card("viktor-leader", "Viktor, Leader", { type: "Unit", superType: "Champion", domain: ["Mind"] }),
      card("viktor-other", "Viktor, Innovator", { type: "Unit", superType: "Champion", domain: ["Order"] }),
      card("jinx-unit", "Jinx, Rebel", { type: "Unit", superType: "Champion", domain: ["Fury"] }),
      card("mind-rune", "Mind Rune", { type: "Rune", domain: ["Mind"] }),
      card("order-rune", "Order Rune", { type: "Rune", domain: ["Order"] }),
      card("stupefy", "Stupefy", { type: "Spell", domain: ["Mind"] }),
    ].map((info) => [info.name.toLowerCase(), info])
  );
  const cardOf = (name: string) => catalog.get(name.toLowerCase());
  const legends = [
    card("viktor-legend", "Viktor, Herald of the Arcane", { type: "Legend", domain: ["Mind", "Order"] }),
    card("jinx-legend", "Jinx, Loose Cannon", { type: "Legend", domain: ["Fury", "Chaos"] }),
  ];
  const lines = (extra: { zone: "legend" | "maindeck" | "runes"; name: string; quantity: number }[]) => ({
    lines: [
      { zone: "runes" as const, name: "Mind Rune", quantity: 6 },
      { zone: "runes" as const, name: "Order Rune", quantity: 6 },
      { zone: "maindeck" as const, name: "Stupefy", quantity: 3 },
      ...extra,
    ],
    sections: [],
    ignored: [],
  });

  it("garde la légende donnée et prend la seule version du champion restée dans le deck", () => {
    const result = inferLegendAndChampion(
      lines([
        { zone: "legend", name: "Viktor, Herald of the Arcane", quantity: 1 },
        { zone: "maindeck", name: "Viktor, Leader", quantity: 2 },
      ]),
      cardOf,
      legends
    );
    assert.equal(result.legend, undefined);
    assert.equal(result.champion?.id, "viktor-leader");
    assert.deepEqual(result.notes, []);
  });

  it("ne devine pas entre deux versions, ni pour une version déjà à trois exemplaires, ni sans exemplaire", () => {
    const legend = { zone: "legend" as const, name: "Viktor, Herald of the Arcane", quantity: 1 };
    const two = inferLegendAndChampion(
      lines([legend, { zone: "maindeck", name: "Viktor, Leader", quantity: 2 }, { zone: "maindeck", name: "Viktor, Innovator", quantity: 1 }]),
      cardOf,
      legends
    );
    const full = inferLegendAndChampion(lines([legend, { zone: "maindeck", name: "Viktor, Leader", quantity: 3 }]), cardOf, legends);
    const none = inferLegendAndChampion(lines([legend]), cardOf, legends);
    assert.equal(two.champion, undefined);
    assert.equal(full.champion, undefined);
    assert.equal(none.champion, undefined);
    assert.deepEqual([...two.notes, ...full.notes, ...none.notes], []);
  });

  it("déduit la légende des champions et des runes quand le classement ne la donne pas", () => {
    const result = inferLegendAndChampion(
      lines([
        { zone: "maindeck", name: "Viktor, Leader", quantity: 2 },
        // Jinx n'est pas dans les domaines des runes : sa légende ne convient pas.
        { zone: "maindeck", name: "Jinx, Rebel", quantity: 2 },
      ]),
      cardOf,
      legends
    );
    assert.equal(result.legend?.id, "viktor-legend");
    assert.equal(result.champion?.id, "viktor-leader");
  });

  it("le signale quand rien ne désigne la légende", () => {
    const result = inferLegendAndChampion(lines([]), cardOf, legends);
    assert.equal(result.legend, undefined);
    assert.match(result.notes[0], /Légende introuvable/);
  });
});

describe("rondes et matchs", () => {
  it("numérote les rondes à la suite, phase après phase, et marque le top", () => {
    const event = toLocatorEvent(
      {
        tournament_phases: [
          { order_in_phases: 2, round_type: "RANKED_SINGLE_ELIMINATION", rounds: [{ id: 30, round_number: 1 }] },
          { order_in_phases: 1, round_type: "SWISS", rounds: [{ id: 11, round_number: 2 }, { id: 10, round_number: 1 }] },
        ],
      },
      1
    );
    assert.deepEqual(event.rounds, [
      { id: 10, phase: "swiss", number: 1 },
      { id: 11, phase: "swiss", number: 2 },
      { id: 30, phase: "top", number: 3 },
    ]);
  });

  const side = (order: number, player: number, registration: number, legend?: string) => ({
    player_order: order,
    player: { id: player },
    user_event_status: { id: registration, deck_defining_card: legend ? { name: legend } : null },
  });

  it("lit le gagnant, les manches dans l'ordre des joueurs, les nuls et les byes", () => {
    const matches = toLocatorMatches(
      [
        {
          status: "COMPLETE",
          winning_player: 902,
          games_won_by_winner: 2,
          games_won_by_loser: 1,
          player_match_relationships: [side(2, 902, 12, "Kennen, Heart of the Tempest"), side(1, 901, 11, "Riven, The Exile")],
        },
        { status: "COMPLETE", match_is_intentional_draw: true, player_match_relationships: [side(1, 903, 13), side(2, 904, 14)] },
        { status: "COMPLETE", match_is_bye: true, player_match_relationships: [side(1, 905, 15)] },
        { status: "IN_PROGRESS", player_match_relationships: [side(1, 906, 16), side(2, 907, 17)] },
      ],
      { id: 10, number: 4, phase: "swiss" }
    );
    assert.deepEqual(matches, [
      { round: 4, phase: "swiss", a: 11, b: 12, winner: "b", games: [1, 2], legends: ["Riven, The Exile", "Kennen, Heart of the Tempest"] },
      { round: 4, phase: "swiss", a: 13, b: 14, winner: null, games: [0, 0], legends: [undefined, undefined] },
      { round: 4, phase: "swiss", a: 15, winner: "a", games: [0, 0], legends: [undefined, undefined] },
    ]);
  });
});
