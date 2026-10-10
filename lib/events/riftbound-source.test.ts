import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DateTime } from "luxon";
import {
  extractRiftboundEvents,
  isRiftboundPageUrl,
  parseRiftboundEventRef,
  readRiftboundOrganizer,
  readRiftboundSearchPage,
  readRiftboundTournamentOrganizer,
  riftboundData,
  riftboundOrganizerFromSourceUrl,
  riftboundRequestBody,
  riftboundSearchVariables,
  riftboundSourceUrl,
} from "./riftbound-source";
import { buildRiftboundManagerSource, managerSiteKey, managerSourceLabel } from "./connect";
import { eventSourceSchema } from "@/lib/schemas/lair.schema";

const PARIS = "Europe/Paris";
const NOW = DateTime.fromISO("2026-10-10T10:00", { zone: PARIS });

/** La Caverne du Gobelin à Thionville, sur playriftbound.com. */
const ORGANIZER_ID = "01a03e92-43e0-7bb9-9e69-d7fd97c2c8d0";

/**
 * Une recherche autour de la Caverne du Gobelin telle que l'API la sert :
 * quatre de ses événements, un événement d'une boutique parisienne — qu'un
 * rayon trop large aurait ramené — et un événement complet et payant.
 */
const SEARCH = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "__fixtures__", "riftbound-search.json"), "utf-8"),
) as unknown;

const GAMES = [{ name: "Riftbound" }, { name: "Star Wars: Unlimited" }];

const SOURCE = { url: riftboundSourceUrl(ORGANIZER_ID) };

function extract(games = GAMES) {
  const data = riftboundData(SEARCH);
  assert.ok(data.ok);
  const page = readRiftboundSearchPage(data.data);
  assert.ok(page);
  return extractRiftboundEvents({ nodes: page.nodes, organizerId: ORGANIZER_ID, source: SOURCE, games, now: NOW });
}

function paris(iso: string) {
  return DateTime.fromISO(iso).setZone(PARIS).toFormat("yyyy-MM-dd HH:mm");
}

describe("riftbound", () => {
  it("ne garde que les événements de l'organisateur", () => {
    const { events } = extract();
    assert.equal(events.length, 5);
    assert.ok(events.every((event) => event.addedBy === "RIFTBOUND" && event.sourceUrl === SOURCE.url));
    assert.ok(!events.some((event) => event.name.includes("Uchronies")));
  });

  it("lit les dates en UTC, et l'heure du lieu en sort", () => {
    const { events } = extract();
    const prerelease = events.find((event) => event.externalId === "117173669452027793");
    assert.ok(prerelease);
    assert.equal(prerelease.name, "Avant-Première - Radiance");
    assert.equal(paris(prerelease.startDateTime), "2026-10-16 19:00");
    assert.equal(prerelease.url, "https://playriftbound.com/fr-FR/events/117173669452027793");
  });

  it("lit le prix et la capacité", () => {
    const { events } = extract();
    const free = events.find((event) => event.externalId === "117173669452027793");
    assert.equal(free?.price, 0);
    assert.equal(free?.status, "available");

    const full = events.find((event) => event.externalId === "117173669452000001");
    assert.equal(full?.price, 5.5);
    assert.equal(full?.status, "sold-out");
  });

  it("nomme le jeu par son nom sur la plateforme, ou par celui qui le contient", () => {
    assert.ok(extract().events.every((event) => event.gameName === "Riftbound"));

    const long = extract([{ name: "Riftbound: League of Legends TCG" }]);
    assert.ok(long.events.every((event) => event.gameName === "Riftbound: League of Legends TCG"));
    assert.deepEqual(long.warnings, []);

    const unknown = extract([{ name: "Magic" }]);
    assert.ok(unknown.warnings.includes("jeu inconnu de la plateforme : « Riftbound »"));
  });

  it("dédoublonne un événement que deux pages rendent", () => {
    const data = riftboundData(SEARCH);
    assert.ok(data.ok);
    const page = readRiftboundSearchPage(data.data);
    assert.ok(page);
    const { events } = extractRiftboundEvents({
      nodes: [...page.nodes, ...page.nodes],
      organizerId: ORGANIZER_ID.toUpperCase(),
      source: SOURCE,
      games: GAMES,
      now: NOW,
    });
    assert.equal(events.length, 5);
  });

  it("lit le curseur de la page suivante", () => {
    assert.deepEqual(
      readRiftboundSearchPage({ competeTournamentSearch: { edges: [], pageInfo: { hasNextPage: true, endCursor: "abc" } } }),
      { nodes: [], next: "abc" },
    );
    assert.equal(readRiftboundSearchPage({ competeTournamentSearch: null }), null);
  });

  it("explique une requête que l'API ne connaît plus, et garde les données d'une réponse partielle", () => {
    const stale = riftboundData({
      errors: [{ message: "Persisted query 'x' not found", extensions: { code: "PERSISTED_QUERY_NOT_IN_LIST" } }],
    });
    assert.equal(stale.ok, false);
    assert.match(!stale.ok ? stale.error : "", /mettre à jour/);

    const missing = riftboundData({
      data: null,
      errors: [{ message: "Organizer not found", extensions: { classification: "NOT_FOUND" } }],
    });
    assert.deepEqual(missing, { ok: false, error: "Riftbound : Organizer not found", code: "NOT_FOUND" });

    assert.equal(riftboundData({ data: { competeTournaments: [] }, errors: [{ message: "x" }] }).ok, true);
  });

  it("lit l'organisateur d'un événement, et son adresse", () => {
    assert.deepEqual(
      readRiftboundTournamentOrganizer({
        competeTournaments: [{ id: "117173669452027793", organizerId: ORGANIZER_ID.toUpperCase(), name: "Avant-Première - Radiance" }],
      }),
      { ok: true, organizerId: ORGANIZER_ID, eventName: "Avant-Première - Radiance" },
    );
    assert.deepEqual(readRiftboundTournamentOrganizer({ competeTournaments: [] }), { ok: false, reason: "NOT_FOUND" });

    assert.deepEqual(
      readRiftboundOrganizer({
        organizerSummary: {
          id: ORGANIZER_ID,
          name: "La Caverne du Gobelin THIONVILLE (Gobcorp)",
          physicalAddress: { formattedAddress: "23 Rue Brûlée, 57100 Thionville, France", latitude: 49.35766, longitude: 6.1656813 },
        },
      }),
      {
        id: ORGANIZER_ID,
        name: "La Caverne du Gobelin THIONVILLE (Gobcorp)",
        address: "23 Rue Brûlée, 57100 Thionville, France",
        latitude: 49.35766,
        longitude: 6.1656813,
      },
    );
    assert.equal(readRiftboundOrganizer({ organizerSummary: { id: ORGANIZER_ID, physicalAddress: null } }), null);
  });

  it("demande la recherche comme le site, par requête enregistrée", () => {
    const body = JSON.parse(
      riftboundRequestBody("search", riftboundSearchVariables({ latitude: 49.3, longitude: 6.1, startDate: "2026-10-09T22:00:00.000Z" })),
    );
    assert.equal(body.operationName, "CompeteTournamentSearch");
    assert.equal(body.extensions.persistedQuery.version, 1);
    assert.match(body.extensions.persistedQuery.sha256Hash, /^[0-9a-f]{64}$/);
    assert.equal(body.variables.sport, "rb");
    assert.deepEqual(body.variables.filter.rb.coords, { latitude: 49.3, longitude: 6.1 });
    assert.equal(body.variables.after, undefined);
  });

  it("reconnaît un lien d'événement, et rien d'autre", () => {
    assert.equal(parseRiftboundEventRef("https://playriftbound.com/fr-FR/events/117173669452027793"), "117173669452027793");
    assert.equal(parseRiftboundEventRef("https://playriftbound.com/en-US/events/117173669452027793/"), "117173669452027793");
    assert.equal(parseRiftboundEventRef("117173669452027793"), "117173669452027793");
    assert.equal(parseRiftboundEventRef("https://playriftbound.com/fr-FR/events/"), null);

    assert.ok(isRiftboundPageUrl("https://playriftbound.com/fr-FR/events/"));
    assert.ok(isRiftboundPageUrl("https://events.playriftbound.com/fr-FR/events/1"));
    assert.ok(!isRiftboundPageUrl("https://notplayriftbound.com/events/1"));
  });

  it("relit l'organisateur sur l'URL d'une source, et la source du gérant", () => {
    assert.equal(riftboundOrganizerFromSourceUrl(riftboundSourceUrl(ORGANIZER_ID)), ORGANIZER_ID);
    assert.equal(riftboundOrganizerFromSourceUrl("https://playriftbound.com/api/gql?organizer=abc"), null);

    const source = buildRiftboundManagerSource({ organizerId: ORGANIZER_ID.toUpperCase(), gameAliases: { " ": "x" } });
    assert.deepEqual(source, {
      url: riftboundSourceUrl(ORGANIZER_ID),
      type: "RIFTBOUND",
      riftboundConfig: { organizerId: ORGANIZER_ID },
      managedBy: "owner",
    });
    assert.equal(managerSiteKey(source), "riftbound");
    assert.equal(managerSourceLabel(source), "Riftbound");
  });

  it("valide une source Riftbound dont l'URL suit l'identifiant", () => {
    assert.ok(
      eventSourceSchema.safeParse({ type: "RIFTBOUND", url: riftboundSourceUrl(ORGANIZER_ID), riftboundConfig: { organizerId: ORGANIZER_ID } }).success,
    );
    assert.ok(
      !eventSourceSchema.safeParse({ type: "RIFTBOUND", url: riftboundSourceUrl(ORGANIZER_ID), riftboundConfig: { organizerId: "0" } }).success,
    );
    assert.ok(!eventSourceSchema.safeParse({ type: "RIFTBOUND", url: riftboundSourceUrl(ORGANIZER_ID) }).success);
    assert.ok(
      !eventSourceSchema.safeParse({
        type: "RIFTBOUND",
        url: "https://playriftbound.com/api/gql?organizer=01a03e92-43e0-7bb9-9e69-d7fd97c2c8d1",
        riftboundConfig: { organizerId: ORGANIZER_ID },
      }).success,
    );
  });
});
