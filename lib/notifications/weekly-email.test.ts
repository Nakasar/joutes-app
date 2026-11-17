import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PlayGroupSession } from "@/lib/types/PlayGroupSession";

import {
  emptyWeeklyEmailContent,
  friendNames,
  isWeeklyEmailEmpty,
  metaTrends,
  parseWeeklyEmailSections,
  playGroupAgenda,
  readWeeklyEmailSettings,
  registrationOf,
  remainingAgenda,
  selectLairNews,
  selectLairPicks,
  WEEKLY_EMAIL_SECTIONS,
  weeklyEmailIntro,
  weeklyEmailSubject,
} from "./weekly-email";

/**
 * Tests de l'email hebdomadaire : les réglages, le choix de ce qui s'y trouve,
 * et les phrases qui le présentent.
 */

const NOW = "2026-11-23T07:00:00.000Z"; // lundi 23 novembre, 8 h à Paris

describe("réglages de l'email hebdomadaire", () => {
  it("coche toutes les sections tant que rien n'est enregistré", () => {
    assert.deepEqual(readWeeklyEmailSettings(undefined), { sections: [...WEEKLY_EMAIL_SECTIONS], skipEmpty: true });
    assert.deepEqual(readWeeklyEmailSettings({ enabled: true }).sections, [...WEEKLY_EMAIL_SECTIONS]);
  });

  it("garde un choix vide : le joueur a tout décoché", () => {
    assert.deepEqual(readWeeklyEmailSettings({ enabled: true, sections: [] }).sections, []);
  });

  it("n'envoie une semaine vide que si on l'a demandé", () => {
    assert.equal(readWeeklyEmailSettings({ enabled: true, skipEmpty: false }).skipEmpty, false);
  });

  it("écarte les sections inconnues et remet l'ordre de référence", () => {
    assert.deepEqual(parseWeeklyEmailSections(["meta", "toString", "friends", "meta"]), ["friends", "meta"]);
    assert.equal(parseWeeklyEmailSections("friends"), null);
  });
});

describe("choix des lieux", () => {
  it("garde les événements mis en avant, 3 par lieu au plus, 4 en tout, du plus proche au plus lointain", () => {
    const events = [
      { id: "a4", lairId: "a", featured: true, startDateTime: "2026-11-29T10:00:00Z" },
      { id: "a1", lairId: "a", featured: true, startDateTime: "2026-11-24T10:00:00Z" },
      { id: "a2", lairId: "a", featured: true, startDateTime: "2026-11-25T10:00:00Z" },
      { id: "a3", lairId: "a", featured: true, startDateTime: "2026-11-26T10:00:00Z" },
      { id: "b1", lairId: "b", featured: true, startDateTime: "2026-11-30T10:00:00Z" },
      { id: "b2", lairId: "b", featured: true, startDateTime: "2026-12-01T10:00:00Z" },
      { id: "x", lairId: "b", startDateTime: "2026-11-23T10:00:00Z" },
    ];
    assert.deepEqual(
      selectLairPicks(events).map((event) => event.id),
      ["a1", "a2", "a3", "b1"],
    );
  });
});

describe("annonces des lieux", () => {
  const lairs = [
    {
      id: "antre",
      name: "L'Antre du Temps",
      news: [
        { id: "n1", title: "Boosters", publishedAt: "2026-11-19T10:00:00Z", category: "Nouveauté" },
        { id: "old", title: "Ancienne", publishedAt: "2026-11-10T10:00:00Z" },
        { id: "later", title: "Programmée", publishedAt: "2026-11-30T10:00:00Z" },
      ],
    },
    { id: "caverne", name: "La Caverne", news: [{ id: "n2", title: "Fermeture", publishedAt: "2026-11-21T10:00:00Z" }] },
    { id: "muet", name: "Lieu muet", news: [{ id: "n3", title: "Rien", publishedAt: "2026-11-21T10:00:00Z" }] },
  ];

  it("ne prend que les annonces publiées depuis le dernier email, les plus récentes d'abord", () => {
    const news = selectLairNews(lairs, [{ lairId: "muet", level: "none" }], "2026-11-16T07:00:00Z", NOW);
    assert.deepEqual(news.map((item) => item.id), ["n2", "n1"]);
    assert.equal(news[1].lairName, "L'Antre du Temps");
    assert.equal(news[1].category, "Nouveauté");
  });

  it("compare des instants, pas des chaînes au décalage différent", () => {
    // 08:30Z s'écrit « 09:30+01:00 » : avant le dernier envoi de 09:00Z, donc déjà annoncée.
    const lair = { id: "l", name: "Lieu", news: [{ id: "x", title: "X", publishedAt: "2026-11-16T09:30:00.000+01:00" }] };
    assert.deepEqual(selectLairNews([lair], undefined, "2026-11-16T09:00:00.000Z", NOW), []);
  });

  it("respecte un lieu réglé sans annonces", () => {
    const news = selectLairNews(
      lairs,
      [{ lairId: "caverne", level: "custom", categories: ["live"] }],
      "2026-11-16T07:00:00Z",
      NOW,
    );
    assert.deepEqual(news.map((item) => item.id), ["n3", "n1"]);
  });
});

describe("inscriptions", () => {
  it("distingue inscrit, pré-inscrit et exclu", () => {
    const event = {
      participants: ["me", "pre", "out"],
      participantRegistrations: { pre: "PRE_REGISTERED", out: "EXCLUDED" },
    };
    assert.deepEqual(registrationOf(event, "me", NOW), { status: "registered" });
    assert.deepEqual(registrationOf(event, "pre", NOW), { status: "pre-registered" });
    assert.equal(registrationOf(event, "out", NOW), null);
    assert.equal(registrationOf(event, "nobody", NOW), null);
  });

  it("donne le rang en liste d'attente, ou la place offerte encore valable", () => {
    const event = {
      participants: [],
      waitlist: [
        { userId: "second", joinedAt: "2026-11-20T10:00:00Z" },
        { userId: "first", joinedAt: "2026-11-19T10:00:00Z", offeredAt: "2026-11-22T10:00:00Z", offerExpiresAt: "2026-11-24T10:00:00Z" },
        { userId: "expired", joinedAt: "2026-11-21T10:00:00Z", offeredAt: "2026-11-20T10:00:00Z", offerExpiresAt: "2026-11-21T10:00:00Z" },
      ],
    };
    assert.deepEqual(registrationOf(event, "second", NOW), { status: "waitlist", position: 2 });
    assert.deepEqual(registrationOf(event, "first", NOW), { status: "offer", offerExpiresAt: "2026-11-24T10:00:00Z" });
    assert.deepEqual(registrationOf(event, "expired", NOW), { status: "waitlist", position: 3 });
  });
});

describe("groupes de jeu", () => {
  const session = (partial: Partial<PlayGroupSession>): PlayGroupSession => ({
    id: "s",
    playGroupId: "g",
    title: "Session",
    status: "poll",
    rsvps: [],
    createdById: "x",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...partial,
  });

  it("garde les sondages ouverts sans vote du joueur et les sessions confirmées de la semaine", () => {
    const sessions = [
      session({
        id: "unanswered",
        slots: [
          { id: "1", startsAt: "2026-12-01T18:00:00Z", voterIds: ["a", "b"] },
          { id: "2", startsAt: "2026-12-02T18:00:00Z", voterIds: ["b", "c"] },
        ],
      }),
      session({ id: "answered", slots: [{ id: "1", startsAt: "2026-12-01T18:00:00Z", voterIds: ["me"] }] }),
      session({ id: "closed", pollClosesAt: "2026-11-20T00:00:00Z", slots: [] }),
      session({ id: "soon", status: "confirmed", startsAt: "2026-11-28T17:00:00Z", place: { kind: "free", label: "Chez Théo" } }),
      session({ id: "far", status: "confirmed", startsAt: "2026-12-10T17:00:00Z" }),
    ];
    const agenda = playGroupAgenda(sessions, "me", { from: NOW, to: "2026-11-29T23:00:00Z" });
    assert.deepEqual(agenda.polls, [{ id: "unanswered", title: "Session", respondents: 3 }]);
    assert.deepEqual(agenda.sessions, [{ id: "soon", title: "Session", startsAt: "2026-11-28T17:00:00Z", place: "Chez Théo" }]);
  });
});

describe("méta", () => {
  const decks = (legend: string, count: number, eventDate: string) =>
    Array.from({ length: count }, () => ({ legend, eventDate }));

  it("compare les 14 derniers jours aux 28 d'avant", () => {
    const sample = [
      ...decks("Kai'Sa", 5, "2026-11-20T00:00:00Z"),
      ...decks("Jinx", 3, "2026-11-20T00:00:00Z"),
      ...decks("Viktor", 2, "2026-11-20T00:00:00Z"),
      ...decks("Kai'Sa", 2, "2026-11-01T00:00:00Z"),
      ...decks("Jinx", 3, "2026-11-01T00:00:00Z"),
      ...decks("Master Yi", 5, "2026-11-01T00:00:00Z"),
    ];
    const trends = metaTrends(sample, NOW);
    assert.equal(trends?.decks, 10);
    assert.deepEqual(trends?.legends, [
      { name: "Kai'Sa", share: 0.5, trend: "up" },
      { name: "Jinx", share: 0.3, trend: "stable" },
      { name: "Viktor", share: 0.2, trend: "new" },
    ]);
  });

  it("se tait quand l'échantillon récent est trop petit", () => {
    assert.equal(metaTrends(decks("Jinx", 7, "2026-11-20T00:00:00Z"), NOW), null);
  });
});

describe("agenda", () => {
  it("retire ce qui est déjà montré plus haut", () => {
    const events = [
      { id: "b", startDateTime: "2026-11-25T10:00:00Z" },
      { id: "a", startDateTime: "2026-11-24T10:00:00Z" },
      { id: "pick", startDateTime: "2026-11-23T10:00:00Z" },
    ];
    assert.deepEqual(remainingAgenda(events, ["pick"]).map((event) => event.id), ["a", "b"]);
  });
});

describe("les mots de l'email", () => {
  const base = emptyWeeklyEmailContent("Camille", "2026-11-23T00:00:00+01:00");
  const event = { id: "e", name: "Avant-première Spiritforged", startDateTime: "2026-11-28T13:00:00Z" };

  it("nomme les amis sans en aligner dix", () => {
    assert.equal(friendNames([{ displayName: "Léa" }]), "Léa");
    assert.equal(friendNames([{ displayName: "Léa" }, { displayName: "Théo" }]), "Léa et Théo");
    assert.equal(
      friendNames([{ displayName: "Léa" }, { displayName: "Théo" }, { displayName: "Max" }, { displayName: "Inès" }]),
      "Léa, Théo et 2 autres",
    );
  });

  it("annonce le contenu en une phrase", () => {
    assert.equal(
      weeklyEmailIntro({ ...base, lairPicks: [event, event], lairNews: [{} as never], agenda: [event] }),
      "Cette semaine : 2 choix de tes lieux, 1 annonce et 1 autre évènement.",
    );
    assert.equal(weeklyEmailIntro({ ...base, agenda: [event, event] }), "Cette semaine : 2 évènements.");
  });

  it("met le meilleur dans l'objet", () => {
    assert.equal(
      weeklyEmailSubject({ ...base, lairPicks: [event] }, NOW),
      "Avant-première Spiritforged samedi, et ta semaine Joutes",
    );
    assert.equal(
      weeklyEmailSubject(
        { ...base, friends: [{ ...event, name: "Ligue Lorcana", startDateTime: "2026-12-05T10:00:00Z", friends: [{ id: "1", displayName: "Léa" }, { id: "2", displayName: "Théo" }] }] },
        NOW,
      ),
      "Léa et Théo : Ligue Lorcana, et ta semaine Joutes",
    );
    assert.equal(weeklyEmailSubject(base, NOW), "Ta semaine Joutes du 23 au 29 novembre");
  });

  it("dit vide une semaine sans rien", () => {
    assert.equal(isWeeklyEmailEmpty(base), true);
    assert.equal(isWeeklyEmailEmpty({ ...base, followsNothing: true }), true);
    assert.equal(isWeeklyEmailEmpty({ ...base, agenda: [event] }), false);
  });
});
