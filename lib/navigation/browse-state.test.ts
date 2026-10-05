import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readPage, toURLSearchParams } from "@/lib/navigation/url-query";
import {
  productCollectionQuery,
  readProductBrowseState,
  writeProductBrowseState,
} from "@/lib/products/browse-state";
import { readCollectionBrowseState, writeCollectionBrowseState } from "@/lib/collection/browse-state";
import { readLairsBrowseState, writeLairsBrowseState } from "@/lib/lairs/browse-state";
import { readLeaguesBrowseState, writeLeaguesBrowseState } from "@/lib/leagues/browse-state";
import type { CardFilterFacet } from "@/lib/cards/search-filters";

/**
 * L'état des recherches vit dans l'adresse : ce qu'on y écrit doit se relire à
 * l'identique, et l'écran par défaut doit garder une adresse nue.
 *
 * Exécution : `npm run test`.
 */

const FACETS: CardFilterFacet[] = [
  { key: "faction", type: "value", values: ["Rebelles", "Empire"] },
];

describe("url-query", () => {
  it("relit la page et retombe sur 1 pour tout le reste", () => {
    assert.equal(readPage(new URLSearchParams("page=3")), 3);
    assert.equal(readPage(new URLSearchParams("page=0")), 1);
    assert.equal(readPage(new URLSearchParams("page=abc")), 1);
    assert.equal(readPage(new URLSearchParams("")), 1);
  });

  it("convertit les paramètres d'une page Next, valeurs multiples comprises", () => {
    const params = toURLSearchParams({ a: "1", domain: ["x", "y"], none: undefined });
    assert.equal(params.toString(), "a=1&domain=x&domain=y");
  });
});

describe("catalogue de produits", () => {
  it("garde une adresse nue pour l'écran par défaut", () => {
    const state = readProductBrowseState(new URLSearchParams(), { currentEdition: "2e", facets: FACETS });
    assert.equal(state.filters.edition, "2e");
    assert.equal(writeProductBrowseState(state, "2e").toString(), "");
  });

  it("relit à l'identique ce qu'il écrit", () => {
    const params = new URLSearchParams(
      "search=commando&setCode=LEG&kind=box&edition=all&shape=units&owned=unowned&page=2"
    );
    const state = readProductBrowseState(params, { currentEdition: "2e", facets: FACETS });
    const written = writeProductBrowseState(state, "2e");
    assert.deepEqual(readProductBrowseState(written, { currentEdition: "2e", facets: FACETS }), state);
    assert.equal(written.get("edition"), "all");
    assert.equal(state.page, 2);
  });

  it("écarte ce qui n'est pas un choix permis", () => {
    const state = readProductBrowseState(new URLSearchParams("kind=nope&shape=round&owned=maybe"), {
      facets: FACETS,
    });
    assert.equal(state.filters.kind, "all");
    assert.equal(state.filters.shape, "all");
    assert.equal(state.filters.ownership, "all");
  });

  it("traduit « toutes les éditions » en absence de filtre côté base", () => {
    const state = readProductBrowseState(new URLSearchParams("edition=all&owned=owned&shape=containers"), {
      currentEdition: "2e",
      facets: FACETS,
    });
    const query = productCollectionQuery(state);
    assert.equal(query.edition, undefined);
    assert.equal(query.owned, true);
    assert.equal(query.containers, true);
  });
});

describe("collection de cartes", () => {
  it("relit à l'identique ce qu'elle écrit, et reste nue par défaut", () => {
    assert.equal(writeCollectionBrowseState(readCollectionBrowseState(new URLSearchParams())).toString(), "");

    const params = new URLSearchParams("search=jinx&setCode=OGN&type=Unit&owned=owned&page=4");
    const state = readCollectionBrowseState(params);
    assert.deepEqual(readCollectionBrowseState(writeCollectionBrowseState(state)), state);
  });
});

describe("lieux", () => {
  it("garde la position et le rayon, sans redemander la géolocalisation", () => {
    const state = readLairsBrowseState(new URLSearchParams("search=caverne&near=48.85661,2.35222&km=20&page=2"));
    assert.deepEqual(state.filters.nearLocation, { latitude: 48.85661, longitude: 2.35222, maxDistanceKm: 20 });
    assert.deepEqual(readLairsBrowseState(writeLairsBrowseState(state)), state);
  });

  it("ignore une position illisible ou hors du globe", () => {
    assert.equal(readLairsBrowseState(new URLSearchParams("near=abc")).filters.nearLocation, undefined);
    assert.equal(readLairsBrowseState(new URLSearchParams("near=95,10")).filters.nearLocation, undefined);
  });
});

describe("ligues", () => {
  it("relit à l'identique ce qu'elle écrit, et écarte un statut inconnu", () => {
    const state = readLeaguesBrowseState(new URLSearchParams("format=KILLER&status=OPEN&page=3"));
    assert.deepEqual(readLeaguesBrowseState(writeLeaguesBrowseState(state)), state);
    assert.equal(readLeaguesBrowseState(new URLSearchParams("status=WHATEVER")).filters.status, "all");
  });
});
