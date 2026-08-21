import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventIdSchema, eventSchema } from "@/lib/schemas/event.schema";

/**
 * Tests du schéma de validation d'un événement. Ce schéma garde la porte
 * d'entrée : ce qu'il laisse passer finit tel quel en base, et les règles de
 * `lib/events/rules.ts` supposent ensuite des dates ISO et un statut connu.
 *
 * Exécution : `npm run test`.
 */

const VALID = {
  id: "V1StGXR8_Z5j",
  name: "Tournoi du samedi",
  startDateTime: "2026-09-12T13:00:00.000Z",
  endDateTime: "2026-09-12T18:00:00.000Z",
  gameName: "Riftbound",
  status: "available" as const,
  addedBy: "USER",
};

/** Premier message d'erreur, pour vérifier que le refus porte bien sur le champ visé. */
function firstMessage(result: ReturnType<typeof eventSchema.safeParse>): string | undefined {
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("eventSchema", () => {
  it("accepte un événement minimal", () => {
    assert.equal(eventSchema.safeParse(VALID).success, true);
  });

  it("accepte les champs optionnels renseignés", () => {
    const parsed = eventSchema.safeParse({
      ...VALID,
      lairId: "507f1f77bcf86cd799439011",
      url: "https://joutes.app/events/V1StGXR8_Z5j",
      price: 5,
      runningState: "ongoing",
      allowJoin: true,
      participants: ["u1", "u2"],
      maxParticipants: 16,
      favoritedBy: ["u3"],
    });
    assert.equal(parsed.success, true, firstMessage(parsed));
  });

  it("exige un nom", () => {
    const parsed = eventSchema.safeParse({ ...VALID, name: "" });
    assert.equal(firstMessage(parsed), "Le nom de l'événement est requis");
  });

  it("refuse un nom démesuré", () => {
    const parsed = eventSchema.safeParse({ ...VALID, name: "a".repeat(501) });
    assert.equal(firstMessage(parsed), "Le nom est trop long");
    assert.equal(eventSchema.safeParse({ ...VALID, name: "a".repeat(500) }).success, true);
  });

  it("exige des dates ISO 8601", () => {
    for (const startDateTime of ["12/09/2026", "2026-09-12", "2026-09-12T13:00"]) {
      const parsed = eventSchema.safeParse({ ...VALID, startDateTime });
      assert.equal(parsed.success, false, startDateTime);
      assert.equal(firstMessage(parsed), "La date de début doit être au format ISO 8601");
    }
  });

  it("n'accepte les dates qu'en UTC, décalage horaire exclu", () => {
    // `z.string().datetime()` refuse un décalage tant qu'on ne lui passe pas
    // `{ offset: true }` : seul le suffixe `Z` est admis. À savoir avant de
    // brancher ce schéma sur une saisie, car `DateTime.toISO()` rend, lui, un
    // décalage (`…+02:00`) dès que la zone n'est pas UTC.
    const withOffset = eventSchema.safeParse({
      ...VALID,
      startDateTime: "2026-09-12T15:00:00+02:00",
      endDateTime: "2026-09-12T20:00:00+02:00",
    });
    assert.equal(withOffset.success, false);
    assert.equal(firstMessage(withOffset), "La date de début doit être au format ISO 8601");

    assert.equal(eventSchema.safeParse({ ...VALID, startDateTime: "2026-09-12T13:00:00Z" }).success, true);
  });

  it("ne juge pas de l'ordre des dates — c'est l'affaire des règles du domaine", () => {
    // `checkEventSchedule` s'en charge, avec un message destiné au formulaire.
    const parsed = eventSchema.safeParse({
      ...VALID,
      startDateTime: "2026-09-12T18:00:00.000Z",
      endDateTime: "2026-09-12T13:00:00.000Z",
    });
    assert.equal(parsed.success, true);
  });

  it("n'accepte comme lieu qu'un ObjectId MongoDB", () => {
    for (const lairId of ["lair-1", "507f1f77bcf86cd7994390", "507f1f77bcf86cd799439011x"]) {
      const parsed = eventSchema.safeParse({ ...VALID, lairId });
      assert.equal(parsed.success, false, lairId);
      assert.equal(firstMessage(parsed), "L'ID doit être un ObjectId MongoDB valide");
    }
    assert.equal(eventSchema.safeParse({ ...VALID, lairId: "507F1F77BCF86CD799439011" }).success, true);
  });

  it("refuse un statut hors des trois connus", () => {
    assert.equal(eventSchema.safeParse({ ...VALID, status: "draft" }).success, false);
    for (const status of ["available", "sold-out", "cancelled"]) {
      assert.equal(eventSchema.safeParse({ ...VALID, status }).success, true, status);
    }
  });

  it("refuse un état d'avancement inconnu", () => {
    assert.equal(eventSchema.safeParse({ ...VALID, runningState: "paused" }).success, false);
  });

  it("refuse un prix négatif et accepte la gratuité", () => {
    const parsed = eventSchema.safeParse({ ...VALID, price: -1 });
    assert.equal(firstMessage(parsed), "Le prix doit être positif");
    assert.equal(eventSchema.safeParse({ ...VALID, price: 0 }).success, true);
  });

  it("refuse une jauge de zéro place", () => {
    const parsed = eventSchema.safeParse({ ...VALID, maxParticipants: 0 });
    assert.equal(firstMessage(parsed), "Le nombre maximum de participants doit être positif");
  });

  it("refuse une URL qui n'en est pas une", () => {
    const parsed = eventSchema.safeParse({ ...VALID, url: "joutes.app/events/1" });
    assert.equal(firstMessage(parsed), "L'URL doit être valide");
  });

  it("exige de savoir qui a ajouté l'événement", () => {
    const parsed = eventSchema.safeParse({ ...VALID, addedBy: "" });
    assert.equal(firstMessage(parsed), "L'auteur de l'événement est requis");
  });

  it("refuse un événement amputé d'un champ obligatoire", () => {
    for (const field of ["id", "name", "startDateTime", "endDateTime", "gameName", "status", "addedBy"]) {
      const incomplete: Record<string, unknown> = { ...VALID };
      delete incomplete[field];
      assert.equal(eventSchema.safeParse(incomplete).success, false, field);
    }
  });
});

describe("eventIdSchema", () => {
  it("accepte un identifiant nanoid", () => {
    assert.equal(eventIdSchema.safeParse("V1StGXR8_Z5j").success, true);
  });

  it("refuse un identifiant vide", () => {
    const parsed = eventIdSchema.safeParse("");
    assert.equal(parsed.success, false);
    assert.equal(parsed.success === false ? parsed.error.issues[0]?.message : undefined, "L'ID de l'événement est requis");
  });
});
