import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import type { Event } from "@/lib/types/Event";
import {
  makeEventDiscordInfoMessage,
  makeEventsBoardDiscordMessage,
  makeEventsBoardDiscordMessages,
} from "./utils";

/**
 * Tests des messages Discord d'un événement : la fiche postée dans un salon, et
 * le tableau d'affichage d'un lieu.
 *
 * Deux contraintes viennent de Discord et non de nous : un embed n'accepte que
 * 25 champs et une description de 4096 caractères — d'où le découpage du
 * tableau en messages de dix événements — et les identifiants collés sur les
 * boutons (`refresh-events-board-…`, `event-registration-…`) sont ce que
 * l'application relit à l'autre bout, quand quelqu'un clique. Les changer sans
 * changer le lecteur casse les boutons déjà postés.
 *
 * Les heures sont rendues à Paris, quelle que soit la zone de la machine.
 *
 * Exécution : `npm run test`.
 */

const UPDATED_AT = DateTime.fromISO("2026-09-10T08:30:00.000Z", { zone: "utc" });

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "evt-1",
    name: "Tournoi du samedi",
    startDateTime: "2026-09-12T13:00:00.000Z",
    endDateTime: "2026-09-12T18:00:00.000Z",
    gameName: "Riftbound",
    status: "available",
    addedBy: "USER",
    ...overrides,
  };
}

function fieldValue(message: ReturnType<typeof makeEventDiscordInfoMessage>, name: string) {
  return message.embeds[0].fields?.find((field) => field.name === name)?.value;
}

type ButtonPayload = { label?: string; url?: string; custom_id?: string; style?: number };

/**
 * Les boutons sont encore des `ButtonBuilder` dans le message : on les lit sous
 * la forme sérialisée, celle que Discord reçoit.
 */
function buttons(message: { components: unknown[] }): ButtonPayload[] {
  const rows = JSON.parse(JSON.stringify(message.components)) as { components: ButtonPayload[] }[];
  return rows[0].components;
}

describe("makeEventDiscordInfoMessage", () => {
  it("titre l'embed et le lie à la fiche de l'événement", () => {
    const embed = makeEventDiscordInfoMessage(makeEvent()).embeds[0];
    assert.equal(embed.title, "Tournoi du samedi");
    assert.equal(embed.url, "https://joutes.app/events/evt-1");
  });

  it("rend les horaires à l'heure de Paris", () => {
    // 13:00 UTC un 12 septembre, c'est 15:00 à Paris.
    const message = makeEventDiscordInfoMessage(makeEvent());
    assert.match(fieldValue(message, "Début") ?? "", /15:00/);
    assert.match(fieldValue(message, "Fin") ?? "", /20:00/);
    assert.match(fieldValue(message, "Début") ?? "", /septembre 2026/);
  });

  it("affiche la jauge quand il y en a une", () => {
    const message = makeEventDiscordInfoMessage(
      makeEvent({ participants: ["a", "b"], maxParticipants: 16 })
    );
    assert.match(fieldValue(message, "Participants") ?? "", /^2\s*\/\s*16$/);
  });

  it("dit « Aucun » tant que personne n'est inscrit", () => {
    assert.equal(fieldValue(makeEventDiscordInfoMessage(makeEvent()), "Participants"), "Aucun");
  });

  it("ne laisse pas un prix absent passer pour la gratuité annoncée", () => {
    assert.equal(fieldValue(makeEventDiscordInfoMessage(makeEvent()), "Prix"), "Gratuit/Non précisé");
    assert.equal(fieldValue(makeEventDiscordInfoMessage(makeEvent({ price: 5 })), "Prix"), "5 €");
  });

  it("n'ajoute le jeu et le lieu que lorsqu'ils sont connus", () => {
    const bare = makeEventDiscordInfoMessage(makeEvent());
    assert.equal(fieldValue(bare, "Jeu"), undefined);
    assert.equal(fieldValue(bare, "Lieu"), undefined);

    const full = makeEventDiscordInfoMessage(
      makeEvent({
        game: { name: "Riftbound", type: "TCG", slug: "riftbound" },
        lairId: "507f1f77bcf86cd799439011",
        lair: { id: "507f1f77bcf86cd799439011", name: "La Taverne" },
      })
    );
    assert.equal(fieldValue(full, "Jeu"), "Riftbound");
    assert.equal(fieldValue(full, "Lieu"), "La Taverne");
    assert.equal(full.embeds[0].author?.name, "La Taverne");
    assert.equal(full.embeds[0].author?.url, "https://joutes.app/lairs/507f1f77bcf86cd799439011");
  });

  it("retombe sur la bannière de joutes.app quand le jeu n'en a pas", () => {
    const bare = makeEventDiscordInfoMessage(makeEvent());
    assert.equal(bare.embeds[0].image?.url, "https://www.joutes.app/joutes.png");

    const branded = makeEventDiscordInfoMessage(
      makeEvent({ game: { name: "Riftbound", type: "TCG", banner: "https://cdn.test/riftbound.png" } })
    );
    assert.equal(branded.embeds[0].image?.url, "https://cdn.test/riftbound.png");
  });

  it("remplace une description vide par un tiret", () => {
    // Discord refuse un embed dont la description est une chaîne vide.
    assert.equal(makeEventDiscordInfoMessage(makeEvent()).embeds[0].description, "-");
    assert.equal(makeEventDiscordInfoMessage(makeEvent({ description: "" })).embeds[0].description, "-");
    assert.equal(
      makeEventDiscordInfoMessage(makeEvent({ description: "Format : construit" })).embeds[0].description,
      "Format : construit"
    );
  });

  it("envoie le bouton « Voir » sur la billetterie quand l'événement en a une", () => {
    const withUrl = buttons(makeEventDiscordInfoMessage(makeEvent({ url: "https://billetterie.test/1" })));
    assert.equal(withUrl[0].label, "Voir l'évènement");
    assert.equal(withUrl[0].url, "https://billetterie.test/1");

    const withoutUrl = buttons(makeEventDiscordInfoMessage(makeEvent()));
    assert.equal(withoutUrl[0].url, "https://joutes.app/events/evt-1");
  });

  it("porte l'identifiant que relit le bouton d'inscription", () => {
    const inscription = buttons(makeEventDiscordInfoMessage(makeEvent()))[1];
    assert.equal(inscription.label, "S'inscrire");
    assert.equal(inscription.custom_id, "event-registration-evt-1");
  });
});

describe("makeEventsBoardDiscordMessage", () => {
  it("liste chaque événement avec son lien, son heure de Paris et son lieu", () => {
    const description = makeEventsBoardDiscordMessage("board-1", UPDATED_AT, [
      makeEvent({ lair: { id: "l1", name: "La Taverne" } }),
    ]).embeds[0].description;

    assert.match(description ?? "", /\[Tournoi du samedi\]\(https:\/\/joutes\.app\/events\/evt-1\)/);
    assert.match(description ?? "", /15:00/);
    assert.match(description ?? "", /à La Taverne/);
  });

  it("annonce un lieu inconnu plutôt que de laisser un trou", () => {
    const description = makeEventsBoardDiscordMessage("board-1", UPDATED_AT, [makeEvent()]).embeds[0]
      .description;
    assert.match(description ?? "", /à Lieu Inconnu/);
  });

  it("le dit quand il n'y a rien à annoncer", () => {
    const description = makeEventsBoardDiscordMessage("board-1", UPDATED_AT, []).embeds[0].description;
    assert.match(description ?? "", /Aucun évènement à venir\./);
  });

  it("préfixe l'événement de l'émoji de son jeu, quand il en existe un", () => {
    const known = makeEventsBoardDiscordMessage("board-1", UPDATED_AT, [
      makeEvent({ game: { name: "Riftbound", type: "TCG", slug: "riftbound" } }),
    ]).embeds[0].description;
    assert.match(known ?? "", /<:riftbound:\d+>/);

    // Un jeu sans émoji déclaré ne doit pas produire de mention vide, mais
    // c'est bien ce qui arrive aujourd'hui : `<:slug:>` s'affiche brut.
    const unknown = makeEventsBoardDiscordMessage("board-1", UPDATED_AT, [
      makeEvent({ game: { name: "Jeu obscur", type: "TCG", slug: "jeu-obscur" } }),
    ]).embeds[0].description;
    assert.match(unknown ?? "", /<:jeu-obscur:>/);
  });

  it("date le tableau à l'heure de Paris", () => {
    const footer = makeEventsBoardDiscordMessage("board-1", UPDATED_AT, []).embeds[0].footer;
    assert.match(footer?.text ?? "", /^Updated: /);
    assert.match(footer?.text ?? "", /10:30/);
  });

  it("porte les identifiants que relisent ses deux boutons", () => {
    const [actualiser, modifier] = buttons(makeEventsBoardDiscordMessage("board-1", UPDATED_AT, []));
    assert.equal(actualiser.custom_id, "refresh-events-board-board-1");
    assert.equal(modifier.custom_id, "modify-events-board-board-1");
  });
});

describe("makeEventsBoardDiscordMessages", () => {
  const events = (count: number) =>
    Array.from({ length: count }, (_, index) => makeEvent({ id: `evt-${index}`, name: `Event ${index}` }));

  it("tient dix événements dans un seul message", () => {
    assert.equal(makeEventsBoardDiscordMessages("board-1", UPDATED_AT, events(10)).length, 1);
  });

  it("découpe au-delà, sans perdre ni répéter un événement", () => {
    const messages = makeEventsBoardDiscordMessages("board-1", UPDATED_AT, events(23));
    assert.equal(messages.length, 3);

    const listed = messages.flatMap((message) =>
      [...(message.embeds[0].description ?? "").matchAll(/\[Event (\d+)]/g)].map((match) => Number(match[1]))
    );
    assert.deepEqual(listed, Array.from({ length: 23 }, (_, index) => index));
  });

  it("garde les boutons du tableau sur chacun des messages", () => {
    for (const message of makeEventsBoardDiscordMessages("board-1", UPDATED_AT, events(23))) {
      assert.equal(buttons(message)[0].custom_id, "refresh-events-board-board-1");
    }
  });

  it("ne produit aucun message quand il n'y a aucun événement", () => {
    // Le tableau vide est posté par `makeEventsBoardDiscordMessage`, pas ici :
    // l'appelant a un message à mettre à jour, pas une liste à publier.
    assert.deepEqual(makeEventsBoardDiscordMessages("board-1", UPDATED_AT, []), []);
  });
});
