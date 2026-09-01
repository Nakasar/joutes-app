import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DateTime } from "luxon";
import { extractHtmlEvents, parseCompositeTitle } from "./html-source";
import { OASIS_PRESET } from "./html-presets";

const PARIS = "Europe/Paris";
const NOW = DateTime.fromISO("2026-09-01T10:00", { zone: PARIS });
const SOURCE_URL = "https://www.antretemps.com/evenements-boutique-tournois/";

/** Quatre cases de la grille de l'Antre Temps, telles que le site les sert. */
const OASIS_PAGE = readFileSync(path.join(import.meta.dirname, "__fixtures__", "antretemps-oasis.html"), "utf-8");

const GAMES = [
  { name: "Riftbound" },
  { name: "Pokémon" },
  { name: "Magic: The Gathering" },
  { name: "Star Wars: Unlimited" },
];

describe("titre composé", () => {
  it("lit « Jeu - Nom - JJ/MM/AAAA - HHhMM »", () => {
    const title = parseCompositeTitle("Riftbound - Tournois Nexus - 03/09/2026 - 19h30");
    assert.deepEqual(title, {
      game: "Riftbound",
      name: "Tournois Nexus",
      date: { day: 3, month: 9, year: 2026 },
      time: { hour: 19, minute: 30 },
    });
  });

  it("accepte l'heure avant la date et l'année sur deux chiffres", () => {
    assert.deepEqual(parseCompositeTitle("Star Wars Unlimited - Store Showdown set 8 - 10h30 - 26/09/2026"), {
      game: "Star Wars Unlimited",
      name: "Store Showdown set 8",
      date: { day: 26, month: 9, year: 2026 },
      time: { hour: 10, minute: 30 },
    });
    assert.equal(parseCompositeTitle("Avant Premiere MTG Réalité Fracturée - 25/09/26 - 19h30").date?.year, 2026);
  });

  it("lit une heure ronde et un nom à plusieurs segments", () => {
    const title = parseCompositeTitle("MTG - Draft The Hobbit - Édition spéciale - 05/09/2026 - 14h");
    assert.equal(title.time?.hour, 14);
    assert.equal(title.time?.minute, 0);
    assert.equal(title.name, "Draft The Hobbit - Édition spéciale");
  });

  it("lit une date en toutes lettres, avec ou sans année", () => {
    assert.deepEqual(parseCompositeTitle("Soirée Riftbound - samedi 15 mars 2026 - 20h").date, { day: 15, month: 3, year: 2026 });
    assert.deepEqual(parseCompositeTitle("Soirée Riftbound - 1er août - 20h").date, { day: 1, month: 8 });
  });

  it("ne coupe pas un trait d'union dans un mot, et lit un tiret demi-cadratin", () => {
    const title = parseCompositeTitle("Cyberpunk TCG – Beta Event (Avant-Première Lancement) - 19/09/2026 - 14h");
    assert.equal(title.game, "Cyberpunk TCG");
    assert.equal(title.name, "Beta Event (Avant-Première Lancement)");
  });

  it("garde tout le titre comme nom quand rien ne le découpe", () => {
    assert.deepEqual(parseCompositeTitle("Grand tournoi de rentrée"), { name: "Grand tournoi de rentrée", date: undefined, time: undefined });
  });
});

describe("page Oasis — L'Antre Temps", () => {
  const extraction = extractHtmlEvents({
    html: OASIS_PAGE,
    config: OASIS_PRESET.config,
    source: { url: SOURCE_URL, gameAliases: { MTG: "Magic: The Gathering", "Star Wars Unlimited": "Star Wars: Unlimited" } },
    games: GAMES,
    now: NOW,
  });

  it("lit chaque case de la grille", () => {
    assert.equal(extraction.itemCount, 4);
    assert.equal(extraction.events.length, 4);
  });

  it("lit un tournoi Riftbound en entier", () => {
    const nexus = extraction.events.find((event) => event.name === "Tournois Nexus");
    assert.ok(nexus);
    assert.equal(nexus.gameName, "Riftbound");
    assert.equal(nexus.startDateTime, "2026-09-03T19:30:00.000+02:00");
    assert.equal(nexus.endDateTime, "2026-09-03T23:30:00.000+02:00");
    assert.equal(nexus.price, 8);
    assert.equal(nexus.status, "available");
    assert.equal(nexus.url, "https://www.antretemps.com/riftbound-tournois-nexus-03/09/2026-19h30/");
    assert.equal(nexus.externalId, "29531");
    assert.equal(nexus.addedBy, "HTML-SCRAPPING");
    assert.equal(nexus.sourceUrl, SOURCE_URL);
  });

  it("rapproche les jeux par alias et à l'accent près", () => {
    const names = new Set(extraction.events.map((event) => event.gameName));
    assert.ok(names.has("Magic: The Gathering"), "MTG via l'alias");
    assert.ok(names.has("Star Wars: Unlimited"), "Star Wars Unlimited via l'alias");
    assert.ok(names.has("Pokémon"), "Pokemon sans accent");
  });

  it("place l'heure avant la date et l'année sur deux chiffres aux bons endroits", () => {
    const showdown = extraction.events.find((event) => event.name.startsWith("Store Showdown"));
    assert.equal(showdown?.startDateTime, "2026-09-26T10:30:00.000+02:00");

    const prerelease = extraction.events.find((event) => event.name.startsWith("Avant Premiere"));
    assert.equal(prerelease?.startDateTime, "2026-09-25T19:30:00.000+02:00");
  });

  it("ne signale rien quand tout est lu", () => {
    assert.deepEqual(extraction.warnings, []);
  });

  it("trouve le jeu dans le titre quand il n'est pas un segment à part", () => {
    // « Avant Premiere MTG Réalité Fracturée - 25/09/26 - 19h30 » : pas de
    // segment de jeu, mais « MTG » dans le nom, et un alias qui le connaît.
    const prerelease = extraction.events.find((event) => event.name.startsWith("Avant Premiere"));
    assert.equal(prerelease?.gameName, "Magic: The Gathering");
  });

  it("signale un jeu que la plateforme ne connaît pas, sans alias", () => {
    const withoutAliases = extractHtmlEvents({
      html: OASIS_PAGE,
      config: OASIS_PRESET.config,
      source: { url: SOURCE_URL },
      games: GAMES,
      now: NOW,
    });

    // « Star Wars Unlimited » se retrouve tout seul : le nom de la plateforme,
    // « Star Wars: Unlimited », est le même mot à la ponctuation près.
    assert.equal(withoutAliases.events.find((event) => event.name.startsWith("Store Showdown"))?.gameName, "Star Wars: Unlimited");
    // « MTG », lui, ne ressemble à rien sans alias.
    assert.equal(withoutAliases.events.find((event) => event.name.startsWith("Avant Premiere"))?.gameName, "Jeu non spécifié");
    assert.ok(withoutAliases.warnings.some((warning) => warning.includes("jeu absent")));
  });
});

describe("page HTML — cas limites", () => {
  const config = {
    itemSelector: "li.event",
    fields: {
      title: { selector: "h3" },
      status: { selector: ".stock" },
      url: { selector: "a", attribute: "href" },
    },
  };

  it("rend zéro élément quand le sélecteur ne désigne rien", () => {
    const extraction = extractHtmlEvents({ html: "<ul><li>rien</li></ul>", config, source: { url: SOURCE_URL }, games: GAMES, now: NOW });
    assert.equal(extraction.itemCount, 0);
    assert.equal(extraction.events.length, 0);
  });

  it("ignore un événement sans date lisible et le signale", () => {
    const html = `<ul>
      <li class="event"><h3>Riftbound - Soirée sans date</h3></li>
      <li class="event"><h3>Riftbound - Soirée - 10/09/2026 - 19h</h3></li>
    </ul>`;
    const extraction = extractHtmlEvents({ html, config, source: { url: SOURCE_URL }, games: GAMES, now: NOW });

    assert.equal(extraction.itemCount, 2);
    assert.equal(extraction.events.length, 1);
    assert.ok(extraction.warnings.some((warning) => warning.includes("date de début illisible")));
  });

  it("lit le statut dans un texte de stock, et résout un lien relatif", () => {
    const html = `<ul>
      <li class="event"><h3>Riftbound - Complet - 10/09/2026 - 19h</h3><span class="stock">Rupture de stock</span><a href="/e/1">Voir</a></li>
      <li class="event"><h3>Riftbound - Annulée - 11/09/2026 - 19h</h3><span class="stock">Événement annulé</span></li>
    </ul>`;
    const extraction = extractHtmlEvents({ html, config, source: { url: SOURCE_URL }, games: GAMES, now: NOW });

    assert.equal(extraction.events[0].status, "sold-out");
    assert.equal(extraction.events[0].url, "https://www.antretemps.com/e/1");
    assert.equal(extraction.events[1].status, "cancelled");
  });

  it("préfère un champ dédié à ce que le titre en dit", () => {
    const dedicated = {
      itemSelector: "li.event",
      fields: {
        title: { selector: "h3" },
        gameName: { selector: ".game" },
        startDateTime: { selector: "time", attribute: "datetime" },
      },
    };
    const html = `<ul><li class="event"><h3>Vieux titre - Soirée - 01/01/2020 - 10h</h3><span class="game">Pokemon</span><time datetime="2026-09-10T19:00:00+02:00"></time></li></ul>`;
    const extraction = extractHtmlEvents({ html, config: dedicated, source: { url: SOURCE_URL }, games: GAMES, now: NOW });

    assert.equal(extraction.events[0].gameName, "Pokémon");
    assert.equal(extraction.events[0].startDateTime, "2026-09-10T19:00:00.000+02:00");
  });

  it("déduit l'année d'une date de titre qui n'en a pas", () => {
    const december = DateTime.fromISO("2026-12-10T10:00", { zone: PARIS });
    const html = `<ul><li class="event"><h3>Riftbound - Soirée - 15 janvier - 20h</h3></li></ul>`;
    const extraction = extractHtmlEvents({ html, config, source: { url: SOURCE_URL }, games: GAMES, now: december });

    assert.equal(extraction.events[0].startDateTime, "2027-01-15T20:00:00.000+01:00");
  });
});
