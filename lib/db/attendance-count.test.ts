import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";

/**
 * Les règles de comptage du défi de saison, isolées de Mongo.
 *
 * `countUserAttendanceBetween` fait deux choses : une requête qui ratisse
 * large, puis un tri fin en mémoire. C'est le tri qui porte les règles, et
 * c'est lui qu'on vérifie ici — la requête n'étant qu'un pré-filtre dont
 * l'exactitude ne compte pas, seule sa générosité.
 *
 * La fonction testée est une copie fidèle du prédicat de `lib/db/events.ts`.
 * Le duplicata est assumé : l'extraire obligerait à exporter un détail
 * d'implémentation depuis un module qui ouvre une connexion à la base au
 * chargement, ce qu'un test unitaire ne peut pas faire.
 */
type CountedEvent = {
  startDateTime: string;
  participantRegistrations?: Record<string, string>;
};

function retained(
  events: CountedEvent[],
  userId: string,
  from: Date,
  to: Date,
  now: Date
): number {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const nowMs = now.getTime();

  return events.filter((event) => {
    const start = DateTime.fromISO(event.startDateTime);
    if (!start.isValid) return false;

    const startMs = start.toMillis();
    if (startMs < fromMs || startMs > toMs || startMs > nowMs) return false;

    return (event.participantRegistrations?.[userId] ?? "REGISTERED") === "REGISTERED";
  }).length;
}

const ME = "user-1";
// La saison 2026 : du 1er octobre au 31 à 23:59:59.999, heure de Paris.
const FROM = DateTime.fromISO("2026-10-01T00:00", { zone: "Europe/Paris" }).toJSDate();
const TO = DateTime.fromISO("2026-10-31T23:59:59.999", { zone: "Europe/Paris" }).toJSDate();
const AFTER_SEASON = DateTime.fromISO("2026-11-05T12:00", { zone: "Europe/Paris" }).toJSDate();

describe("comptage des présences — formats de date", () => {
  it("retient un événement stocké avec un décalage explicite", () => {
    // Ce que `refresh-events` écrit : `DateTime.toISO()` en Europe/Paris.
    const events = [{ startDateTime: "2026-10-15T20:00:00.000+02:00" }];
    assert.equal(retained(events, ME, FROM, TO, AFTER_SEASON), 1);
  });

  it("retient un événement stocké en UTC", () => {
    // Ce que le schéma de l'API impose : `z.string().datetime()`, forme Z.
    const events = [{ startDateTime: "2026-10-15T18:00:00.000Z" }];
    assert.equal(retained(events, ME, FROM, TO, AFTER_SEASON), 1);
  });

  it("retient le 31 octobre au soir, heure de Paris", () => {
    // Le cas que la comparaison de chaînes écartait : 23 h à Paris, soit
    // 22 h UTC — après la borne « …22:59:59Z » si on compare les textes.
    const events = [{ startDateTime: "2026-10-31T23:00:00.000+01:00" }];
    assert.equal(retained(events, ME, FROM, TO, AFTER_SEASON), 1);
  });

  it("écarte le 30 septembre au soir, heure de Paris", () => {
    // Le symétrique : 23 h le 30 septembre à Paris est hors saison, alors
    // que son texte précède la borne basse écrite en UTC.
    const events = [{ startDateTime: "2026-09-30T23:00:00.000+02:00" }];
    assert.equal(retained(events, ME, FROM, TO, AFTER_SEASON), 0);
  });

  it("ignore une date illisible plutôt que de la compter", () => {
    assert.equal(retained([{ startDateTime: "pas une date" }], ME, FROM, TO, AFTER_SEASON), 0);
  });
});

describe("comptage des présences — statuts", () => {
  const onTheFifteenth = "2026-10-15T20:00:00.000+02:00";

  it("compte un participant sans statut explicite", () => {
    assert.equal(retained([{ startDateTime: onTheFifteenth }], ME, FROM, TO, AFTER_SEASON), 1);
  });

  it("compte un REGISTERED", () => {
    const events = [{ startDateTime: onTheFifteenth, participantRegistrations: { [ME]: "REGISTERED" } }];
    assert.equal(retained(events, ME, FROM, TO, AFTER_SEASON), 1);
  });

  it("ne compte pas un PRE_REGISTERED qui n'a jamais confirmé", () => {
    const events = [{ startDateTime: onTheFifteenth, participantRegistrations: { [ME]: "PRE_REGISTERED" } }];
    assert.equal(retained(events, ME, FROM, TO, AFTER_SEASON), 0);
  });

  it("ne compte pas un EXCLUDED", () => {
    const events = [{ startDateTime: onTheFifteenth, participantRegistrations: { [ME]: "EXCLUDED" } }];
    assert.equal(retained(events, ME, FROM, TO, AFTER_SEASON), 0);
  });

  it("lit le statut de la bonne personne", () => {
    const events = [{
      startDateTime: onTheFifteenth,
      participantRegistrations: { "user-2": "EXCLUDED" },
    }];
    assert.equal(retained(events, ME, FROM, TO, AFTER_SEASON), 1);
  });
});

describe("comptage des présences — événements à venir", () => {
  it("ne porte pas au crédit un événement qui n'a pas encore commencé", () => {
    // Consulté le 15 octobre, un événement du 20 ne compte pas encore.
    const now = DateTime.fromISO("2026-10-15T12:00", { zone: "Europe/Paris" }).toJSDate();
    const events = [{ startDateTime: "2026-10-20T20:00:00.000+02:00" }];
    assert.equal(retained(events, ME, FROM, TO, now), 0);
  });

  it("compte un événement commencé le jour même", () => {
    const now = DateTime.fromISO("2026-10-15T22:00", { zone: "Europe/Paris" }).toJSDate();
    const events = [{ startDateTime: "2026-10-15T20:00:00.000+02:00" }];
    assert.equal(retained(events, ME, FROM, TO, now), 1);
  });
});
