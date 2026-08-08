import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dedupePlaces, parsePhotonResponse, toPlace, toPlaceRef } from "@/lib/geo/places";

/**
 * Tests de la normalisation des réponses Photon. L'appel réseau n'est pas
 * couvert — c'est un `fetch` — mais tout ce qu'on en tire l'est, à commencer
 * par l'ordre des coordonnées, que GeoJSON prend à rebours de l'usage.
 *
 * Exécution : `npm run test`.
 */

/** Entité Photon minimale, à compléter au cas par cas. */
function feature(properties: Record<string, unknown>, coordinates: unknown = [4.8357, 45.764]) {
  return { geometry: { coordinates }, properties };
}

describe("toPlace", () => {
  it("lit les coordonnées dans l'ordre GeoJSON : longitude puis latitude", () => {
    const place = toPlace(feature({ name: "Lyon" }, [4.8357, 45.764]));

    assert.equal(place?.latitude, 45.764);
    assert.equal(place?.longitude, 4.8357);
  });

  it("compose un libellé avec le code postal, la région et le pays", () => {
    const place = toPlace(
      feature({
        name: "Lyon",
        postcode: "69000",
        state: "Auvergne-Rhône-Alpes",
        country: "France",
      })
    );

    assert.equal(place?.label, "Lyon (69000), Auvergne-Rhône-Alpes, France");
  });

  it("ne répète pas un nom déjà porté par la région", () => {
    const place = toPlace(feature({ name: "Paris", state: "Paris", country: "France" }));

    assert.equal(place?.label, "Paris, France");
  });

  it("se passe du code postal quand Photon ne le donne pas", () => {
    const place = toPlace(feature({ name: "Lyon", country: "France" }));

    assert.equal(place?.label, "Lyon, France");
    assert.equal(place?.postalCode, null);
  });

  it("retient le nom quand `city` manque, et l'inverse", () => {
    assert.equal(toPlace(feature({ name: "Lyon" }))?.city, "Lyon");
    assert.equal(toPlace(feature({ city: "Lyon" }))?.city, "Lyon");
  });

  it("écarte les adresses et les rues, trop fines pour un rayon en kilomètres", () => {
    assert.equal(toPlace(feature({ name: "12 Rue de la Paix", type: "house" })), null);
    assert.equal(toPlace(feature({ name: "Rue de la Paix", type: "street" })), null);
  });

  it("garde les villes et les quartiers", () => {
    assert.ok(toPlace(feature({ name: "Lyon", type: "city" })));
    assert.ok(toPlace(feature({ name: "La Croix-Rousse", type: "district" })));
  });

  it("écarte une entité sans nom exploitable", () => {
    assert.equal(toPlace(feature({})), null);
    assert.equal(toPlace(feature({ name: "   " })), null);
  });

  it("écarte des coordonnées absentes, incomplètes ou non numériques", () => {
    assert.equal(toPlace({ properties: { name: "Lyon" } }), null);
    assert.equal(toPlace(feature({ name: "Lyon" }, [4.8357])), null);
    assert.equal(toPlace(feature({ name: "Lyon" }, ["4.8357", "45.764"])), null);
  });

  it("écarte des coordonnées hors du domaine terrestre", () => {
    assert.equal(toPlace(feature({ name: "Nulle part" }, [0, 91])), null);
    assert.equal(toPlace(feature({ name: "Nulle part" }, [181, 0])), null);
  });
});

describe("toPlaceRef", () => {
  it("ne garde que ce qui accompagne des coordonnées en base", () => {
    const place = toPlace(feature({ name: "Lyon", postcode: "69000", country: "France" }))!;

    assert.deepEqual(toPlaceRef(place), {
      label: "Lyon (69000), France",
      city: "Lyon",
      postalCode: "69000",
    });
  });

  it("rend `undefined` plutôt que `null` pour ce qui manque", () => {
    // Mongo distingue les deux : un `null` écrirait un champ vide là où on veut
    // n'écrire aucun champ.
    const place = toPlace(feature({ name: "Lyon" }))!;
    const ref = toPlaceRef(place);

    assert.equal(ref.postalCode, undefined);
    assert.ok(Object.values(ref).every((value) => value === undefined || typeof value === "string"));
  });
});

describe("dedupePlaces", () => {
  it("ne garde qu'une entrée par libellé", () => {
    const places = parsePhotonResponse(
      {
        features: [
          feature({ name: "Lyon", country: "France" }, [4.8357, 45.764]),
          feature({ name: "Lyon", country: "France" }, [4.8358, 45.7641]),
        ],
      },
      5
    );

    assert.equal(places.length, 1);
  });

  it("garde deux homonymes que leur pays distingue", () => {
    const places = dedupePlaces([
      { id: "a", label: "Paris, France", city: "Paris", postalCode: null, latitude: 48.85, longitude: 2.35 },
      { id: "b", label: "Paris, Texas, États-Unis", city: "Paris", postalCode: null, latitude: 33.66, longitude: -95.55 },
    ]);

    assert.equal(places.length, 2);
  });
});

describe("parsePhotonResponse", () => {
  it("rend une liste vide sur une réponse inattendue", () => {
    assert.deepEqual(parsePhotonResponse(null, 5), []);
    assert.deepEqual(parsePhotonResponse({}, 5), []);
    assert.deepEqual(parsePhotonResponse({ features: "nope" }, 5), []);
  });

  it("tronque après déduplication, pas avant", () => {
    // Trois entités pour deux lieux : la limite de 2 doit laisser deux lieux
    // distincts, non « Lyon » et son doublon.
    const places = parsePhotonResponse(
      {
        features: [
          feature({ name: "Lyon", country: "France" }, [4.8357, 45.764]),
          feature({ name: "Lyon", country: "France" }, [4.8358, 45.7641]),
          feature({ name: "Villeurbanne", country: "France" }, [4.8795, 45.7719]),
        ],
      },
      2
    );

    assert.deepEqual(
      places.map((place) => place.label),
      ["Lyon, France", "Villeurbanne, France"]
    );
  });
});
