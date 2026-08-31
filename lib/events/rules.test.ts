import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Event, RegistrationStatus } from "@/lib/types/Event";
import {
  canAddParticipant,
  canAddStaffMember,
  canCancelEvent,
  canCompleteEvent,
  canDeleteEvent,
  canJoinEvent,
  canManageStaff,
  canRegisterParticipant,
  canStartEvent,
  canUpdateEventDetails,
  canUpdateRegistrationStatus,
  canViewEvent,
  checkEventSchedule,
  countRegisteredParticipants,
  isEventFull,
  isEventOrganizer,
  isEventParticipant,
  isEventStaff,
  remainingSeats,
  resolveJoinRegistrationStatus,
  type RuleResult,
} from "./rules";

/**
 * Tests des règles de la gestion des événements.
 *
 * Trois choses s'y jouent qui ne se lisent pas dans les signatures : le
 * remplissage, qui ne compte pas les pré-inscrits ; l'ordre des refus, qui
 * décide du message que l'utilisateur lit quand deux règles s'opposent en même
 * temps ; et le cycle de vie, où chaque étape ferme des portes.
 *
 * Exécution : `npm run test`.
 */

const CREATOR = "creator-1";
const JUDGE = "judge-1";
const ORGANIZER = "organizer-1";
const PLAYER = "player-1";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "evt-1",
    lairId: "507f1f77bcf86cd799439011",
    name: "Tournoi du samedi",
    startDateTime: "2026-09-12T13:00:00.000Z",
    endDateTime: "2026-09-12T18:00:00.000Z",
    gameName: "Riftbound",
    status: "available",
    addedBy: "USER",
    creatorId: CREATOR,
    runningState: "not-started",
    allowJoin: true,
    participants: [],
    participantRegistrations: {},
    staff: [],
    ...overrides,
  };
}

/** Un événement rempli de `count` inscrits, tous au statut `REGISTERED`. */
function withRegistered(count: number, overrides: Partial<Event> = {}): Event {
  const participants = Array.from({ length: count }, (_, index) => `p${index}`);
  const participantRegistrations = Object.fromEntries(
    participants.map((id) => [id, "REGISTERED" as RegistrationStatus])
  );
  return makeEvent({ participants, participantRegistrations, ...overrides });
}

function assertRefused(result: RuleResult, error: string) {
  assert.equal(result.ok, false);
  assert.equal(result.ok === false ? result.error : undefined, error);
}

function assertAllowed(result: RuleResult) {
  assert.equal(result.ok, true, result.ok === false ? result.error : undefined);
}

describe("isEventOrganizer", () => {
  it("reconnaît le créateur, même sans équipe constituée", () => {
    const event = makeEvent({ staff: undefined });
    assert.equal(isEventOrganizer(event, CREATOR), true);
  });

  it("reconnaît un membre du staff au rôle d'organisateur", () => {
    const event = makeEvent({ staff: [{ userId: ORGANIZER, role: "organizer" }] });
    assert.equal(isEventOrganizer(event, ORGANIZER), true);
  });

  it("ne prend pas un juge pour un organisateur", () => {
    const event = makeEvent({ staff: [{ userId: JUDGE, role: "judge" }] });
    assert.equal(isEventOrganizer(event, JUDGE), false);
  });

  it("refuse un inconnu, et un visiteur non connecté", () => {
    const event = makeEvent({ staff: [{ userId: ORGANIZER, role: "organizer" }] });
    assert.equal(isEventOrganizer(event, PLAYER), false);
    assert.equal(isEventOrganizer(event, undefined), false);
  });

  it("ne confond pas un identifiant vide avec celui du créateur absent", () => {
    const event = makeEvent({ creatorId: undefined });
    assert.equal(isEventOrganizer(event, undefined), false);
    assert.equal(isEventOrganizer(event, ""), false);
  });
});

describe("isEventStaff", () => {
  it("compte les juges comme les organisateurs", () => {
    const event = makeEvent({
      staff: [
        { userId: JUDGE, role: "judge" },
        { userId: ORGANIZER, role: "organizer" },
      ],
    });
    assert.equal(isEventStaff(event, JUDGE), true);
    assert.equal(isEventStaff(event, ORGANIZER), true);
  });

  it("ne range pas le créateur dans l'équipe", () => {
    assert.equal(isEventStaff(makeEvent(), CREATOR), false);
  });
});

describe("isEventParticipant", () => {
  it("distingue un inscrit d'un simple visiteur", () => {
    const event = makeEvent({ participants: [PLAYER] });
    assert.equal(isEventParticipant(event, PLAYER), true);
    assert.equal(isEventParticipant(event, "autre"), false);
    assert.equal(isEventParticipant(makeEvent({ participants: undefined }), PLAYER), false);
  });
});

describe("countRegisteredParticipants", () => {
  it("ne compte que les inscrits confirmés", () => {
    const event = makeEvent({
      participants: ["a", "b", "c", "d"],
      participantRegistrations: {
        a: "REGISTERED",
        b: "PRE_REGISTERED",
        c: "EXCLUDED",
        d: "NOT_REGISTERED",
      },
    });
    assert.equal(countRegisteredParticipants(event), 1);
  });

  it("tient un participant sans statut pour un inscrit", () => {
    // Les événements antérieurs à la pré-inscription n'ont pas de table de
    // statuts : sans ce défaut, ils apparaîtraient tous vides.
    const event = makeEvent({ participants: ["a", "b"], participantRegistrations: undefined });
    assert.equal(countRegisteredParticipants(event), 2);
  });

  it("ignore un statut portant sur quelqu'un qui n'est plus dans la liste", () => {
    const event = makeEvent({
      participants: ["a"],
      participantRegistrations: { a: "REGISTERED", parti: "REGISTERED" },
    });
    assert.equal(countRegisteredParticipants(event), 1);
  });

  it("rend zéro sur un événement sans participants", () => {
    assert.equal(countRegisteredParticipants(makeEvent({ participants: undefined })), 0);
  });
});

describe("isEventFull", () => {
  it("n'est jamais complet sans jauge", () => {
    assert.equal(isEventFull(withRegistered(50, { maxParticipants: undefined })), false);
  });

  it("est complet dès que la jauge est atteinte", () => {
    assert.equal(isEventFull(withRegistered(7, { maxParticipants: 8 })), false);
    assert.equal(isEventFull(withRegistered(8, { maxParticipants: 8 })), true);
  });

  it("reste complet si la jauge a été dépassée", () => {
    assert.equal(isEventFull(withRegistered(9, { maxParticipants: 8 })), true);
  });

  it("laisse les pré-inscrits en dehors de la jauge", () => {
    const event = makeEvent({
      maxParticipants: 2,
      participants: ["a", "b", "c"],
      participantRegistrations: { a: "REGISTERED", b: "PRE_REGISTERED", c: "PRE_REGISTERED" },
    });
    assert.equal(isEventFull(event), false);
  });

  it("préfère le décompte déjà calculé à la lecture", () => {
    // `getEventById` pose `registeredParticipantsCount` ; une liste ne le porte
    // pas toujours, et la règle doit alors le retrouver seule.
    const counted = makeEvent({ maxParticipants: 1, registeredParticipantsCount: 1, participants: [] });
    assert.equal(isEventFull(counted), true);

    const uncounted = makeEvent({ maxParticipants: 1, participants: ["a"] });
    assert.equal(isEventFull(uncounted), true);
  });
});

describe("remainingSeats", () => {
  it("ne rend rien quand l'événement n'a pas de jauge", () => {
    assert.equal(remainingSeats(makeEvent()), undefined);
  });

  it("compte les places qui restent", () => {
    assert.equal(remainingSeats(withRegistered(3, { maxParticipants: 8 })), 5);
  });

  it("ne descend pas sous zéro quand la jauge a été dépassée", () => {
    assert.equal(remainingSeats(withRegistered(10, { maxParticipants: 8 })), 0);
  });
});

describe("resolveJoinRegistrationStatus", () => {
  it("inscrit directement quand la pré-inscription est désactivée", () => {
    assert.equal(resolveJoinRegistrationStatus(makeEvent()), "REGISTERED");
    assert.equal(resolveJoinRegistrationStatus(makeEvent({ preRegistration: false })), "REGISTERED");
  });

  it("met en attente quand la pré-inscription est activée", () => {
    assert.equal(resolveJoinRegistrationStatus(makeEvent({ preRegistration: true })), "PRE_REGISTERED");
  });
});

describe("canJoinEvent", () => {
  it("laisse entrer un joueur sur un événement ouvert et à venir", () => {
    assertAllowed(canJoinEvent(makeEvent(), PLAYER));
  });

  it("refuse quand les inscriptions sont fermées", () => {
    assertRefused(
      canJoinEvent(makeEvent({ allowJoin: false }), PLAYER),
      "Les inscriptions à cet événement sont fermées"
    );
  });

  it("refuse un événement commencé ou terminé", () => {
    for (const runningState of ["ongoing", "completed"] as const) {
      assertRefused(
        canJoinEvent(makeEvent({ runningState }), PLAYER),
        "Impossible de rejoindre un événement déjà commencé ou terminé"
      );
    }
  });

  it("refuse un événement complet", () => {
    assertRefused(
      canJoinEvent(withRegistered(8, { maxParticipants: 8 }), PLAYER),
      "Cet événement est complet"
    );
  });

  it("refuse une seconde inscription du même joueur", () => {
    assertRefused(
      canJoinEvent(makeEvent({ participants: [PLAYER] }), PLAYER),
      "Vous êtes déjà inscrit à cet événement"
    );
  });

  it("annonce le remplissage avant la double inscription", () => {
    // L'ordre des refus est celui de l'action : un pré-inscrit qui retente sa
    // chance sur un événement complet lit « complet », et non « déjà inscrit ».
    const event = withRegistered(8, { maxParticipants: 8 });
    event.participants = [...(event.participants ?? []), PLAYER];
    event.participantRegistrations = { ...event.participantRegistrations, [PLAYER]: "PRE_REGISTERED" };
    assertRefused(canJoinEvent(event, PLAYER), "Cet événement est complet");
  });

  it("annonce d'abord la fermeture des inscriptions, avant l'état de l'événement", () => {
    assertRefused(
      canJoinEvent(makeEvent({ allowJoin: false, runningState: "completed" }), PLAYER),
      "Les inscriptions à cet événement sont fermées"
    );
  });

  it("laisse entrer un pré-inscrit supplémentaire sur un événement dont la jauge n'est pas prise", () => {
    const event = makeEvent({
      maxParticipants: 2,
      participants: ["a", "b"],
      participantRegistrations: { a: "PRE_REGISTERED", b: "PRE_REGISTERED" },
    });
    assertAllowed(canJoinEvent(event, PLAYER));
  });
});

describe("canAddParticipant", () => {
  it("autorise le créateur et les organisateurs", () => {
    assertAllowed(canAddParticipant(makeEvent(), CREATOR));
    assertAllowed(
      canAddParticipant(makeEvent({ staff: [{ userId: ORGANIZER, role: "organizer" }] }), ORGANIZER)
    );
  });

  it("refuse un juge, et un joueur", () => {
    const event = makeEvent({ staff: [{ userId: JUDGE, role: "judge" }] });
    const message = "Seuls les organisateurs de l'événement peuvent ajouter des participants";
    assertRefused(canAddParticipant(event, JUDGE), message);
    assertRefused(canAddParticipant(event, PLAYER), message);
  });

  it("refuse d'ajouter quelqu'un à un événement commencé", () => {
    assertRefused(
      canAddParticipant(makeEvent({ runningState: "ongoing" }), CREATOR),
      "Impossible d'ajouter des participants à un événement déjà commencé ou terminé"
    );
  });

  it("ignore la fermeture des inscriptions publiques", () => {
    // `allowJoin` ferme le formulaire des joueurs, pas la table de l'organisateur.
    assertAllowed(canAddParticipant(makeEvent({ allowJoin: false }), CREATOR));
  });
});

describe("canRegisterParticipant", () => {
  it("accepte un nouveau venu tant qu'il reste de la place", () => {
    assertAllowed(canRegisterParticipant(withRegistered(3, { maxParticipants: 8 }), PLAYER));
  });

  it("refuse un événement complet", () => {
    assertRefused(
      canRegisterParticipant(withRegistered(8, { maxParticipants: 8 }), PLAYER),
      "Cet événement est complet"
    );
  });

  it("refuse quelqu'un qui est déjà dans la liste", () => {
    assertRefused(
      canRegisterParticipant(makeEvent({ participants: [PLAYER] }), PLAYER),
      "Cet utilisateur est déjà inscrit à l'événement"
    );
  });
});

describe("canUpdateRegistrationStatus", () => {
  const base = () =>
    makeEvent({
      maxParticipants: 2,
      participants: [PLAYER, "autre"],
      participantRegistrations: { [PLAYER]: "PRE_REGISTERED", autre: "REGISTERED" },
    });

  it("laisse un organisateur confirmer une pré-inscription", () => {
    assertAllowed(canUpdateRegistrationStatus(base(), CREATOR, PLAYER, "REGISTERED"));
  });

  it("refuse à un joueur de modifier un statut", () => {
    assertRefused(
      canUpdateRegistrationStatus(base(), PLAYER, PLAYER, "REGISTERED"),
      "Seuls les organisateurs de l'événement peuvent modifier le statut d'inscription"
    );
  });

  it("refuse de statuer sur quelqu'un qui n'est pas dans la liste", () => {
    assertRefused(
      canUpdateRegistrationStatus(base(), CREATOR, "inconnu", "REGISTERED"),
      "Cet utilisateur n'est pas participant à l'événement"
    );
  });

  it("refuse de confirmer une place de plus quand la jauge est prise", () => {
    const event = makeEvent({
      maxParticipants: 1,
      participants: [PLAYER, "autre"],
      participantRegistrations: { [PLAYER]: "PRE_REGISTERED", autre: "REGISTERED" },
    });
    assertRefused(
      canUpdateRegistrationStatus(event, CREATOR, PLAYER, "REGISTERED"),
      "Le nombre maximum de participants inscrits est atteint"
    );
  });

  it("laisse re-confirmer quelqu'un qui occupe déjà sa place", () => {
    // Sinon la moindre correction serait bloquée dès la dernière place prise.
    const event = makeEvent({
      maxParticipants: 1,
      participants: [PLAYER],
      participantRegistrations: { [PLAYER]: "REGISTERED" },
    });
    assertAllowed(canUpdateRegistrationStatus(event, CREATOR, PLAYER, "REGISTERED"));
  });

  it("laisse toujours libérer une place, même sur un événement complet", () => {
    const event = makeEvent({
      maxParticipants: 1,
      participants: [PLAYER],
      participantRegistrations: { [PLAYER]: "REGISTERED" },
    });
    for (const status of ["PRE_REGISTERED", "EXCLUDED", "NOT_REGISTERED"] as const) {
      assertAllowed(canUpdateRegistrationStatus(event, CREATOR, PLAYER, status));
    }
  });
});

describe("checkEventSchedule", () => {
  it("accepte un créneau qui avance dans le temps", () => {
    assertAllowed(checkEventSchedule("2026-09-12T13:00:00.000Z", "2026-09-12T18:00:00.000Z"));
  });

  it("accepte la forme rendue par un champ datetime-local", () => {
    assertAllowed(checkEventSchedule("2026-09-12T13:00", "2026-09-12T18:00"));
  });

  it("refuse une fin antérieure au début", () => {
    assertRefused(
      checkEventSchedule("2026-09-12T18:00:00.000Z", "2026-09-12T13:00:00.000Z"),
      "La date de fin doit être après la date de début"
    );
  });

  it("refuse un événement de durée nulle", () => {
    assertRefused(
      checkEventSchedule("2026-09-12T13:00:00.000Z", "2026-09-12T13:00:00.000Z"),
      "La date de fin doit être après la date de début"
    );
  });

  it("refuse ce qui n'est pas une date", () => {
    const message = "Les dates saisies ne sont pas valides";
    assertRefused(checkEventSchedule("samedi prochain", "2026-09-12T18:00:00.000Z"), message);
    assertRefused(checkEventSchedule("2026-09-12T13:00:00.000Z", ""), message);
    assertRefused(checkEventSchedule("2026-02-30T13:00:00.000Z", "2026-09-12T18:00:00.000Z"), message);
  });

  it("compare des instants, pas des chaînes, entre deux fuseaux", () => {
    // 15:00 à Paris (UTC+2 en septembre) précède 14:00 UTC.
    assertAllowed(checkEventSchedule("2026-09-12T15:00:00+02:00", "2026-09-12T14:00:00Z"));
  });
});

describe("canUpdateEventDetails", () => {
  const input = {
    startDateTime: "2026-09-12T13:00:00.000Z",
    endDateTime: "2026-09-12T18:00:00.000Z",
  };

  it("laisse un organisateur corriger son événement", () => {
    assertAllowed(canUpdateEventDetails(makeEvent(), CREATOR, input));
  });

  it("refuse à un participant de modifier l'événement", () => {
    assertRefused(
      canUpdateEventDetails(makeEvent({ participants: [PLAYER] }), PLAYER, input),
      "Seuls les organisateurs de l'événement peuvent modifier ces informations"
    );
  });

  it("vérifie les droits avant les dates", () => {
    assertRefused(
      canUpdateEventDetails(makeEvent(), PLAYER, { startDateTime: "n'importe quoi", endDateTime: "" }),
      "Seuls les organisateurs de l'événement peuvent modifier ces informations"
    );
  });

  it("remonte le refus du créneau", () => {
    assertRefused(
      canUpdateEventDetails(makeEvent(), CREATOR, {
        startDateTime: "2026-09-12T18:00:00.000Z",
        endDateTime: "2026-09-12T13:00:00.000Z",
      }),
      "La date de fin doit être après la date de début"
    );
  });

  it("refuse un prix négatif, accepte la gratuité", () => {
    assertRefused(
      canUpdateEventDetails(makeEvent(), CREATOR, { ...input, price: -1 }),
      "Le prix doit être supérieur ou égal à 0"
    );
    assertAllowed(canUpdateEventDetails(makeEvent(), CREATOR, { ...input, price: 0 }));
  });

  it("refuse une jauge inférieure à une place", () => {
    assertRefused(
      canUpdateEventDetails(makeEvent(), CREATOR, { ...input, maxParticipants: 0 }),
      "Le nombre de participants doit être supérieur ou égal à 1"
    );
  });

  it("refuse d'abaisser la jauge en dessous des inscrits", () => {
    assertRefused(
      canUpdateEventDetails(withRegistered(6, { maxParticipants: 8 }), CREATOR, {
        ...input,
        maxParticipants: 5,
      }),
      "Le nombre max ne peut pas être inférieur au nombre de participants déjà inscrits"
    );
  });

  it("accepte de ramener la jauge pile au nombre d'inscrits", () => {
    assertAllowed(
      canUpdateEventDetails(withRegistered(6, { maxParticipants: 8 }), CREATOR, {
        ...input,
        maxParticipants: 6,
      })
    );
  });

  it("ne compte pas les pré-inscrits comme un obstacle à la baisse de la jauge", () => {
    const event = makeEvent({
      maxParticipants: 8,
      participants: ["a", "b", "c"],
      participantRegistrations: { a: "REGISTERED", b: "PRE_REGISTERED", c: "PRE_REGISTERED" },
    });
    assertAllowed(canUpdateEventDetails(event, CREATOR, { ...input, maxParticipants: 1 }));
  });

  it("laisse retirer la jauge d'un événement déjà bien rempli", () => {
    assertAllowed(canUpdateEventDetails(withRegistered(30, { maxParticipants: 8 }), CREATOR, input));
  });
});

describe("canStartEvent", () => {
  it("démarre un événement qui n'a pas commencé", () => {
    assertAllowed(canStartEvent(makeEvent(), CREATOR));
    assertAllowed(canStartEvent(makeEvent({ runningState: undefined }), CREATOR));
  });

  it("refuse à un joueur de démarrer l'événement", () => {
    assertRefused(
      canStartEvent(makeEvent(), PLAYER),
      "Seuls les organisateurs de l'événement peuvent démarrer l'événement"
    );
  });

  it("ne redémarre pas un événement en cours ni terminé", () => {
    assertRefused(canStartEvent(makeEvent({ runningState: "ongoing" }), CREATOR), "L'événement est déjà en cours");
    assertRefused(
      canStartEvent(makeEvent({ runningState: "completed" }), CREATOR),
      "L'événement est déjà terminé"
    );
  });
});

describe("canCompleteEvent", () => {
  it("termine un événement en cours", () => {
    assertAllowed(canCompleteEvent(makeEvent({ runningState: "ongoing" }), CREATOR));
  });

  it("termine aussi un événement qui n'a jamais été démarré", () => {
    // Un organisateur qui oublie de cliquer sur « démarrer » doit pouvoir clore.
    assertAllowed(canCompleteEvent(makeEvent(), CREATOR));
  });

  it("ne termine pas deux fois", () => {
    assertRefused(
      canCompleteEvent(makeEvent({ runningState: "completed" }), CREATOR),
      "L'événement est déjà terminé"
    );
  });

  it("refuse à un juge de terminer l'événement", () => {
    assertRefused(
      canCompleteEvent(makeEvent({ staff: [{ userId: JUDGE, role: "judge" }] }), JUDGE),
      "Seuls les organisateurs de l'événement peuvent terminer l'événement"
    );
  });
});

describe("canCancelEvent", () => {
  it("annule un événement à venir, et un événement en cours", () => {
    assertAllowed(canCancelEvent(makeEvent(), CREATOR));
    assertAllowed(canCancelEvent(makeEvent({ runningState: "ongoing" }), CREATOR));
  });

  it("n'annule pas deux fois", () => {
    assertRefused(canCancelEvent(makeEvent({ status: "cancelled" }), CREATOR), "L'événement est déjà annulé");
  });

  it("n'annule pas un événement terminé", () => {
    assertRefused(
      canCancelEvent(makeEvent({ runningState: "completed" }), CREATOR),
      "Impossible d'annuler un événement terminé"
    );
  });

  it("signale l'annulation avant la clôture quand les deux sont vraies", () => {
    assertRefused(
      canCancelEvent(makeEvent({ status: "cancelled", runningState: "completed" }), CREATOR),
      "L'événement est déjà annulé"
    );
  });

  it("refuse à un inconnu d'annuler l'événement", () => {
    assertRefused(
      canCancelEvent(makeEvent(), PLAYER),
      "Seuls les organisateurs de l'événement peuvent annuler l'événement"
    );
  });
});

describe("canDeleteEvent", () => {
  it("laisse un organisateur supprimer l'événement, à n'importe quelle étape", () => {
    assertAllowed(canDeleteEvent(makeEvent({ runningState: "completed" }), CREATOR));
    assertAllowed(
      canDeleteEvent(makeEvent({ staff: [{ userId: ORGANIZER, role: "organizer" }] }), ORGANIZER)
    );
  });

  it("refuse à tout autre de supprimer l'événement", () => {
    assertRefused(
      canDeleteEvent(makeEvent({ participants: [PLAYER] }), PLAYER),
      "Seuls les organisateurs de l'événement peuvent supprimer l'événement"
    );
  });
});

describe("canAddStaffMember", () => {
  it("accepte un nouveau membre", () => {
    assertAllowed(canAddStaffMember(makeEvent(), PLAYER));
  });

  it("refuse d'inscrire le créateur dans sa propre équipe", () => {
    // Il serait alors possible de lui retirer un rôle qu'il tient de l'événement.
    assertRefused(canAddStaffMember(makeEvent(), CREATOR), "Le créateur ne peut pas être ajouté comme staff");
  });

  it("refuse un membre déjà présent, quel que soit son rôle", () => {
    const event = makeEvent({ staff: [{ userId: JUDGE, role: "judge" }] });
    assertRefused(canAddStaffMember(event, JUDGE), "Cet utilisateur fait déjà partie de l'équipe");
  });
});

describe("canManageStaff", () => {
  it("réserve l'équipe aux organisateurs", () => {
    assertAllowed(canManageStaff(makeEvent(), CREATOR));
    assertRefused(
      canManageStaff(makeEvent({ staff: [{ userId: JUDGE, role: "judge" }] }), JUDGE),
      "Seuls les organisateurs de l'événement peuvent gérer l'équipe"
    );
  });
});

describe("canViewEvent", () => {
  it("ouvre à tous un événement rattaché à un lieu", () => {
    assert.equal(canViewEvent(makeEvent(), undefined), true);
  });

  it("réserve un événement privé à son créateur et à ses participants", () => {
    const event = makeEvent({ lairId: undefined, participants: [PLAYER] });
    assert.equal(canViewEvent(event, CREATOR), true);
    assert.equal(canViewEvent(event, PLAYER), true);
    assert.equal(canViewEvent(event, "curieux"), false);
    assert.equal(canViewEvent(event, undefined), false);
  });

  it("n'ouvre pas un événement privé à son staff par la seule appartenance à l'équipe", () => {
    const event = makeEvent({ lairId: undefined, staff: [{ userId: JUDGE, role: "judge" }] });
    assert.equal(canViewEvent(event, JUDGE), false);
  });
});
