import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DUPLICATE_RADIUS_KM,
  distanceKm,
  findDuplicateLair,
  isSameLairName,
  normalizeLairName,
  toLairLocation,
  validateLairCreation,
} from "./creation";
import type { GeoJSONPoint } from "@/lib/types/Lair";

/**
 * Les règles qui décident si un lieu public peut naître.
 *
 * Ce que ces cas verrouillent : deux saisies du même nom ne créent pas deux
 * fiches d'une même boutique, deux enseignes homonymes à l'autre bout du pays
 * restent deux lieux, et l'ordre GeoJSON — longitude d'abord — n'est pas
 * inversé en chemin, ce qui enverrait la comparaison à des milliers de
 * kilomètres du bon endroit.
 *
 * Exécution : `npm run test`.
 */

/** Un point GeoJSON depuis des coordonnées lues dans l'ordre courant. */
function point(latitude: number, longitude: number): GeoJSONPoint {
  return { type: "Point", coordinates: [longitude, latitude] };
}

const LYON = point(45.764, 4.8357);
const VILLEURBANNE = point(45.7719, 4.8902);
const NANTES = point(47.2184, -1.5536);

describe("normalizeLairName", () => {
  it("ignore la casse, les accents, les espaces et la ponctuation", () => {
    assert.equal(normalizeLairName("L'Antre-Temps"), "lantretemps");
    assert.equal(normalizeLairName("L ANTRE TEMPS"), "lantretemps");
    assert.equal(normalizeLairName("Le Répaire"), "lerepaire");
  });

  it("rogne les bords et les espaces multiples", () => {
    assert.equal(normalizeLairName("  Le   Repaire  "), "lerepaire");
  });

  it("garde les chiffres, qui distinguent des enseignes", () => {
    assert.equal(normalizeLairName("Table 42"), "table42");
    assert.notEqual(normalizeLairName("Table 42"), normalizeLairName("Table 43"));
  });

  it("retombe sur la casse seule pour un nom sans lettre latine", () => {
    // Sans ce repli, la réduction rendrait la chaîne vide et ces deux noms
    // deviendraient doublons l'un de l'autre.
    assert.notEqual(normalizeLairName("遊戯堂"), normalizeLairName("カードの城"));
    assert.equal(normalizeLairName("遊戯堂"), "遊戯堂");
  });
});

describe("isSameLairName", () => {
  it("reconnaît la même enseigne écrite autrement", () => {
    assert.equal(isSameLairName("L'Antre-Temps", "lantre temps"), true);
  });

  it("sépare deux enseignes différentes", () => {
    assert.equal(isSameLairName("Le Repaire", "Le Refuge"), false);
  });
});

describe("distanceKm", () => {
  it("mesure quelques kilomètres entre deux communes voisines", () => {
    const distance = distanceKm(LYON, VILLEURBANNE);

    assert.ok(distance > 3 && distance < 6, `distance inattendue : ${distance}`);
  });

  it("mesure des centaines de kilomètres entre deux villes éloignées", () => {
    const distance = distanceKm(LYON, NANTES);

    assert.ok(distance > 500 && distance < 700, `distance inattendue : ${distance}`);
  });

  it("rend zéro pour un point et lui-même", () => {
    assert.equal(distanceKm(LYON, LYON), 0);
  });

  it("lit la longitude avant la latitude, comme GeoJSON l'ordonne", () => {
    // Les coordonnées de Lyon inversées tombent au large de la Somalie : si la
    // lecture prenait la latitude d'abord, cette distance serait nulle.
    const inverted: GeoJSONPoint = { type: "Point", coordinates: [45.764, 4.8357] };

    assert.ok(distanceKm(LYON, inverted) > 4000);
  });
});

describe("toLairLocation", () => {
  it("retourne les coordonnées dans l'ordre GeoJSON", () => {
    assert.deepEqual(toLairLocation({ latitude: 45.764, longitude: 4.8357 }), {
      type: "Point",
      coordinates: [4.8357, 45.764],
    });
  });

  it("rend undefined quand le formulaire n'a pas situé le lieu", () => {
    assert.equal(toLairLocation(undefined), undefined);
  });
});

describe("validateLairCreation", () => {
  const publicInput = {
    name: "L'Antre-Temps",
    visibility: "public" as const,
    address: "12 rue de la Joute, 69001 Lyon",
    location: { latitude: 45.764, longitude: 4.8357 },
  };

  it("accepte un lieu public complet", () => {
    const result = validateLairCreation(publicInput);

    assert.equal(result.success, true);
    assert.equal(result.success && result.data.name, "L'Antre-Temps");
  });

  it("accepte un lieu privé réduit à son nom", () => {
    assert.equal(validateLairCreation({ name: "Chez moi", visibility: "private" }).success, true);
  });

  it("exige du public une adresse et un point sur la carte", () => {
    assert.deepEqual(validateLairCreation({ ...publicInput, address: "  " }), {
      success: false,
      error: "ADDRESS_REQUIRED",
    });
    assert.deepEqual(validateLairCreation({ ...publicInput, location: undefined }), {
      success: false,
      error: "LOCATION_REQUIRED",
    });
  });

  it("distingue un champ absent d'un champ fautif", () => {
    // Le grief de Copilot : « nom requis » sur un nom bien présent mais trop
    // long n'apprend rien à qui vient de le saisir.
    assert.deepEqual(validateLairCreation({ ...publicInput, name: "" }), {
      success: false,
      error: "NAME_REQUIRED",
    });
    assert.deepEqual(validateLairCreation({ ...publicInput, name: "x".repeat(201) }), {
      success: false,
      error: "NAME_TOO_LONG",
    });
    assert.deepEqual(validateLairCreation({ ...publicInput, address: "x".repeat(501) }), {
      success: false,
      error: "ADDRESS_TOO_LONG",
    });
  });

  it("sépare un point absent d'une coordonnée hors du globe", () => {
    assert.deepEqual(
      validateLairCreation({ ...publicInput, location: { latitude: 91, longitude: 4.8357 } }),
      { success: false, error: "LOCATION_INVALID" }
    );
    assert.deepEqual(
      validateLairCreation({ ...publicInput, location: { latitude: 45.764, longitude: 181 } }),
      { success: false, error: "LOCATION_INVALID" }
    );
  });

  it("refuse une URL de site web qui n'en est pas une", () => {
    assert.deepEqual(validateLairCreation({ ...publicInput, website: "pas une url" }), {
      success: false,
      error: "WEBSITE_INVALID",
    });
  });

  it("refuse une visibilité inconnue sans prétendre nommer un champ", () => {
    assert.deepEqual(validateLairCreation({ name: "Ailleurs", visibility: "secret" }), {
      success: false,
      error: "INVALID",
    });
  });

  it("rogne le nom et l'adresse plutôt que de les prendre tels quels", () => {
    const result = validateLairCreation({ ...publicInput, name: "  Le Repaire  " });

    assert.equal(result.success && result.data.name, "Le Repaire");
  });
});

describe("findDuplicateLair", () => {
  const existing = { id: "1", name: "L'Antre-Temps", location: LYON };

  it("reconnaît le même nom au même endroit", () => {
    const duplicate = findDuplicateLair([existing], {
      name: "lantre temps",
      location: VILLEURBANNE,
    });

    assert.equal(duplicate?.id, "1");
  });

  it("laisse passer le même nom à l'autre bout du pays", () => {
    assert.equal(
      findDuplicateLair([existing], { name: "L'Antre-Temps", location: NANTES }),
      null
    );
  });

  it("laisse passer un autre nom au même endroit", () => {
    assert.equal(findDuplicateLair([existing], { name: "Le Refuge", location: LYON }), null);
  });

  it("refuse quand l'un des deux lieux n'a pas de coordonnées", () => {
    const withoutLocation = { id: "2", name: "Le Repaire" };

    assert.equal(
      findDuplicateLair([withoutLocation], { name: "Le Repaire", location: LYON })?.id,
      "2"
    );
    assert.equal(findDuplicateLair([existing], { name: "L'Antre-Temps" })?.id, "1");
  });

  it("tranche au rayon annoncé, et non au-delà", () => {
    // Un degré de latitude vaut environ 111 km : le point posé juste en deçà du
    // rayon est un doublon, celui juste au-delà n'en est pas un.
    const inside = point(45.764 + (DUPLICATE_RADIUS_KM - 2) / 111, 4.8357);
    const outside = point(45.764 + (DUPLICATE_RADIUS_KM + 2) / 111, 4.8357);

    assert.equal(findDuplicateLair([existing], { name: "L'Antre-Temps", location: inside })?.id, "1");
    assert.equal(findDuplicateLair([existing], { name: "L'Antre-Temps", location: outside }), null);
  });

  it("rend le premier doublon quand plusieurs candidats coïncident", () => {
    const others = [
      { id: "3", name: "Le Refuge", location: LYON },
      existing,
      { id: "4", name: "L'Antre Temps", location: LYON },
    ];

    assert.equal(findDuplicateLair(others, { name: "L'Antre-Temps", location: LYON })?.id, "1");
  });

  it("rend null sur une liste vide", () => {
    assert.equal(findDuplicateLair([], { name: "L'Antre-Temps", location: LYON }), null);
  });
});
