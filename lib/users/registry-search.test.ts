import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ObjectId } from "mongodb";

import {
  REGISTRY_MAX_COUNT,
  REGISTRY_PAGE_SIZE,
  hasActiveFilters,
  parseRegistrySearch,
  readRegistryFilters,
  readRegistrySort,
  toRegistryParams,
  toRegistryUser,
} from "./registry-search";

/**
 * Ce que le registre comprend de l'URL.
 *
 * Deux points sont défensifs plutôt que fonctionnels et méritent leurs cas :
 * le compteur de pagination vient de l'URL et doit être borné, et la ville ne
 * ressort d'un document que si le compte l'a autorisée.
 *
 * Exécution : `npm run test`.
 */

describe("parseRegistrySearch", () => {
  it("ne cherche rien sur une saisie vide", () => {
    assert.equal(parseRegistrySearch(""), null);
    assert.equal(parseRegistrySearch("   "), null);
    assert.equal(parseRegistrySearch("@"), null);
  });

  it("reconnaît un tag complet", () => {
    assert.deepEqual(parseRegistrySearch("Nakasar#6666"), {
      kind: "tag",
      displayName: "Nakasar",
      discriminator: "6666",
    });
  });

  it("retire le « @ » recopié d'une mention", () => {
    assert.deepEqual(parseRegistrySearch("@nakasar"), { kind: "text", pattern: "nakasar" });
  });

  it("cherche le pseudonyme de gauche quand le tag est incomplet", () => {
    assert.deepEqual(parseRegistrySearch("Alice#abc"), { kind: "text", pattern: "Alice" });
  });

  it("échappe ce qui aurait un sens dans une expression régulière", () => {
    assert.deepEqual(parseRegistrySearch(".*"), { kind: "text", pattern: "\\.\\*" });
    assert.deepEqual(parseRegistrySearch("(test"), { kind: "text", pattern: "\\(test" });
  });

  it("ne reconnaît pas un identifiant — un registre public n'a pas à le confirmer", () => {
    assert.deepEqual(parseRegistrySearch("507f1f77bcf86cd799439011"), {
      kind: "text",
      pattern: "507f1f77bcf86cd799439011",
    });
  });
});

describe("readRegistryFilters", () => {
  it("part sans filtre et sur la première page", () => {
    const filters = readRegistryFilters({});

    assert.equal(filters.q, "");
    assert.equal(filters.query, null);
    assert.equal(filters.sells, false);
    assert.equal(filters.live, false);
    assert.equal(filters.sort, "active");
    assert.equal(filters.count, REGISTRY_PAGE_SIZE);
    assert.equal(hasActiveFilters(filters), false);
  });

  it("cumule les pastilles", () => {
    const filters = readRegistryFilters({
      game: "g1",
      city: "Thionville",
      sells: "1",
      live: "1",
      sort: "name",
    });

    assert.equal(filters.gameId, "g1");
    assert.equal(filters.city, "Thionville");
    assert.equal(filters.sells, true);
    assert.equal(filters.live, true);
    assert.equal(filters.sort, "name");
    assert.equal(hasActiveFilters(filters), true);
  });

  it("borne le compteur de pagination, qui vient de l'URL", () => {
    assert.equal(readRegistryFilters({ count: "100000000" }).count, REGISTRY_MAX_COUNT);
    assert.equal(readRegistryFilters({ count: "-5" }).count, REGISTRY_PAGE_SIZE);
    assert.equal(readRegistryFilters({ count: "pas un nombre" }).count, REGISTRY_PAGE_SIZE);
    // Arrondi au palier supérieur : le bouton n'ajoute que des pages entières.
    assert.equal(readRegistryFilters({ count: "25" }).count, REGISTRY_PAGE_SIZE * 2);
  });

  it("accepte un paramètre répété en prenant le premier", () => {
    assert.equal(readRegistryFilters({ q: ["nakasar", "autre"] }).q, "nakasar");
  });
});

describe("readRegistrySort", () => {
  it("retombe sur le tri par défaut", () => {
    assert.equal(readRegistrySort(undefined), "active");
    assert.equal(readRegistrySort("n'importe quoi"), "active");
  });
});

describe("toRegistryParams", () => {
  it("omet les valeurs par défaut pour que l'adresse nue reste /users", () => {
    assert.deepEqual(toRegistryParams(readRegistryFilters({})), {});
  });

  it("écrit ce qui a été choisi", () => {
    assert.deepEqual(
      toRegistryParams({ q: "naka", sells: true, sort: "name", count: 40 }),
      { q: "naka", sells: "1", sort: "name", count: "40" },
    );
  });

  it("fait un aller-retour fidèle", () => {
    const filters = readRegistryFilters({ q: "naka", game: "g1", live: "1", sort: "followers" });
    const reread = readRegistryFilters(toRegistryParams(filters));

    assert.equal(reread.q, filters.q);
    assert.equal(reread.gameId, filters.gameId);
    assert.equal(reread.live, filters.live);
    assert.equal(reread.sort, filters.sort);
  });
});

describe("toRegistryUser", () => {
  const objectId = new ObjectId("6512aa000000000000000001");

  it("ne rend la ville que si le compte l'a autorisée", () => {
    const base = {
      _id: objectId,
      name: "kevin",
      location: { latitude: 49.3, longitude: 6.1, city: "Thionville" },
    };

    assert.equal(toRegistryUser(base as never).city, undefined);
    assert.equal(
      toRegistryUser({ ...base, showcase: { showCity: true } } as never).city,
      "Thionville",
    );
  });

  it("ne laisse pas ressortir ce que la projection ne demande pas", () => {
    const user = toRegistryUser({
      _id: objectId,
      name: "kevin",
      email: "kevin@example.test",
      discordId: "42",
      friends: ["u2"],
    } as never);

    assert.equal("email" in user, false);
    assert.equal("discordId" in user, false);
    assert.equal("friends" in user, false);
  });

  it("préfère l'image de profil à l'avatar hérité du fournisseur", () => {
    assert.equal(
      toRegistryUser({
        _id: objectId,
        profileImage: "https://exemple.test/p.png",
        image: "https://discord.test/a.png",
      } as never).avatar,
      "https://exemple.test/p.png",
    );
  });
});
