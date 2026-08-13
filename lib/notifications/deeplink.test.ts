import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notificationLink } from "./deeplink";

/**
 * Tests de la destination d'une notification.
 *
 * Deux choses s'y jouent : l'ordre de priorité — l'émetteur sait mieux que la
 * dérivation — et le refus de tout ce qui sortirait de Joutes.
 *
 * Exécution : `npm run test`.
 */

describe("notificationLink", () => {
  it("le lien explicite passe avant tout", () => {
    assert.equal(
      notificationLink({ type: "lair", lairId: "l1", link: "/trades/t1" }),
      "/trades/t1"
    );
  });

  it("une notification de ligue vise sa ligue", () => {
    // Elle est de type `user` : sans cette branche, elle n'aurait aucune
    // destination, alors que la page en affiche une depuis toujours.
    assert.equal(
      notificationLink({ type: "user", template: "league-match-assigned", leagueId: "lg1" }),
      "/leagues/lg1"
    );
  });

  it("dérive le lair et l'événement", () => {
    assert.equal(notificationLink({ type: "lair", lair: { id: "l1" } }), "/lairs/l1");
    assert.equal(notificationLink({ type: "event", event: { id: "e1" } }), "/events/e1");
  });

  it("se contente du document brut, sans jointure", () => {
    // C'est tout ce dont dispose le fan-out : le document tel qu'il vient
    // d'être inséré, sans les `$lookup` du pipeline de lecture.
    assert.equal(notificationLink({ type: "lair", lairId: "l1" }), "/lairs/l1");
    assert.equal(notificationLink({ type: "event", eventId: "e1" }), "/events/e1");
  });

  it("refuse une adresse qui sortirait de Joutes", () => {
    // Un lien absolu glissé dans une notification en ferait une porte
    // d'hameçonnage. On retombe sur la dérivation, ou sur rien.
    assert.equal(notificationLink({ type: "user", link: "https://exemple.test/piege" }), null);
    assert.equal(notificationLink({ type: "user", link: "//exemple.test/piege" }), null);
    assert.equal(notificationLink({ type: "lair", lairId: "l1", link: "javascript:alert(1)" }), "/lairs/l1");
  });

  it("ne rend rien quand la notification ne mène nulle part", () => {
    // L'appelant retombe sur la liste des notifications.
    assert.equal(notificationLink({ type: "user" }), null);
    assert.equal(notificationLink({ type: "lair" }), null);
    assert.equal(notificationLink({ type: "user", template: "league-match-assigned" }), null);
  });
});
