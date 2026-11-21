import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DateTime } from "luxon";
import { parse } from "node-html-parser";
import {
  extractHtmlEvents,
  formFieldsForVenue,
  hasVenuePlaceholder,
  htmlDetailUrls,
  parseCompositeTitle,
  parseDateText,
  parseTimeRange,
  readVenueOptions,
} from "./html-source";
import { GOBELIN_PRESET, OASIS_PRESET, withPresetDetail } from "./html-presets";

const PARIS = "Europe/Paris";
const NOW = DateTime.fromISO("2026-09-01T10:00", { zone: PARIS });
const SOURCE_URL = "https://www.antretemps.com/evenements-boutique-tournois/";

/** Quatre cases de la grille de l'Antre Temps, telles que le site les sert. */
const OASIS_PAGE = readFileSync(path.join(import.meta.dirname, "__fixtures__", "antretemps-oasis.html"), "utf-8");

/**
 * La page de novembre 2026 : le calendrier en JavaScript, et la grille masquée
 * qui le nourrit — une soirée jeux, une Nexus Night, une initiation Kill Team
 * et la nuit du jeu des 5 ans.
 */
const CALENDAR_PAGE = readFileSync(path.join(import.meta.dirname, "__fixtures__", "antretemps-calendrier.html"), "utf-8");

/** Les fiches de ces quatre événements, par adresse : ce que le calendrier lit pour chacun. */
const CALENDAR_DETAILS: Record<string, string> = Object.fromEntries(
  parse(readFileSync(path.join(import.meta.dirname, "__fixtures__", "antretemps-fiches.html"), "utf-8"))
    .querySelectorAll("article")
    .map((article) => [article.getAttribute("data-url") ?? "", article.innerHTML]),
);

/** Cinq cartes de la page du Gobelin, filtrée sur Thionville, telles que le site les sert. */
const GOBELIN_PAGE = readFileSync(path.join(import.meta.dirname, "__fixtures__", "gobelin-thionville.html"), "utf-8");

const GAMES = [
  { name: "Riftbound" },
  { name: "Pokémon" },
  { name: "Magic: The Gathering" },
  { name: "Star Wars: Unlimited" },
  { name: "Yu-Gi-Oh!" },
  { name: "One Piece Card Game" },
  { name: "Lorcana" },
];

describe("titre composé", () => {
  it("lit une date ISO, comme en porte un attribut", () => {
    assert.deepEqual(parseDateText("2026-11-12"), { day: 12, month: 11, year: 2026 });
  });

  it("lit « Jeu - Nom - JJ/MM/AAAA - HHhMM »", () => {
    const title = parseCompositeTitle("Riftbound - Tournois Nexus - 03/09/2026 - 19h30");
    assert.equal(title.game, "Riftbound");
    assert.equal(title.name, "Tournois Nexus");
    assert.deepEqual(title.segments, ["Riftbound", "Tournois Nexus"]);
    assert.deepEqual(title.date, { day: 3, month: 9, year: 2026 });
    assert.deepEqual(title.time, { hour: 19, minute: 30 });
  });

  it("accepte l'heure avant la date et l'année sur deux chiffres", () => {
    const title = parseCompositeTitle("Star Wars Unlimited - Store Showdown set 8 - 10h30 - 26/09/2026");
    assert.equal(title.game, "Star Wars Unlimited");
    assert.equal(title.name, "Store Showdown set 8");
    assert.deepEqual(title.date, { day: 26, month: 9, year: 2026 });
    assert.deepEqual(title.time, { hour: 10, minute: 30 });
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

  it("retire un jour de la semaine qui accompagne la date", () => {
    const evening = parseCompositeTitle("Soirée jeux - jeudi - 12/11/2026 - 19h30");
    assert.equal(evening.name, "Soirée jeux");
    assert.equal(evening.game, undefined);

    const night = parseCompositeTitle("Nuit du jeu - Les 5 ans de L'Antre Temps - samedi - 28/11/2026 - 19h30");
    assert.equal(night.game, "Nuit du jeu");
    assert.equal(night.name, "Les 5 ans de L'Antre Temps");

    // Un jour dans un nom reste dans le nom.
    assert.equal(parseCompositeTitle("Riftbound - Nexus du jeudi - 12/11/2026 - 19h30").name, "Nexus du jeudi");
  });

  it("garde tout le titre comme nom quand rien ne le découpe", () => {
    const title = parseCompositeTitle("Grand tournoi de rentrée");
    assert.equal(title.name, "Grand tournoi de rentrée");
    assert.equal(title.game, undefined);
    assert.equal(title.date, undefined);
    assert.equal(title.time, undefined);
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

describe("page calendrier — L'Antre Temps, novembre 2026", () => {
  const source = { url: SOURCE_URL, gameAliases: { MTG: "Magic: The Gathering" } };
  const config = OASIS_PRESET.config;
  const NOVEMBER = DateTime.fromISO("2026-11-01T10:00", { zone: PARIS });
  const byId = <T extends { externalId?: string }>(events: T[], id: string) => events.find((event) => event.externalId === id);

  it("lit toujours la grille, masquée derrière le calendrier", () => {
    const extraction = extractHtmlEvents({ html: CALENDAR_PAGE, config, source, games: GAMES, now: NOVEMBER });
    assert.equal(extraction.itemCount, 4);
    assert.equal(extraction.events.length, 4);
    assert.equal(byId(extraction.events, "30755")?.name, "Soirée jeux", "pas « jeudi »");
    assert.equal(byId(extraction.events, "30765")?.name, "Initiation Kill Team", "pas « samedi »");
  });

  it("désigne la fiche de chaque événement, dans l'ordre de la grille", () => {
    assert.deepEqual(htmlDetailUrls({ html: CALENDAR_PAGE, config, sourceUrl: SOURCE_URL }), [
      "https://www.antretemps.com/soiree-jeux-jeudi-12/11/2026-19h30-a30755.html",
      "https://www.antretemps.com/initiation-kill-team-samedi-14/11/2026-14h-a30765.html",
      "https://www.antretemps.com/riftbound-nexus-night-12/11/2026-19h30-a30864.html",
      "https://www.antretemps.com/nuit-du-jeu-les-5-ans-de-lantre-temps-samedi-28/11/2026-19h30-a30951.html",
    ]);
    assert.deepEqual(htmlDetailUrls({ html: CALENDAR_PAGE, config: { ...config, detail: undefined }, sourceUrl: SOURCE_URL }), []);
  });

  const extraction = extractHtmlEvents({ html: CALENDAR_PAGE, config, source, games: GAMES, now: NOVEMBER, details: CALENDAR_DETAILS });

  it("prend l'heure de fin de la fiche, le lendemain quand elle passe minuit", () => {
    const evening = byId(extraction.events, "30755");
    assert.equal(evening?.startDateTime, "2026-11-12T19:30:00.000+01:00");
    assert.equal(evening?.endDateTime, "2026-11-13T00:00:00.000+01:00");

    const night = byId(extraction.events, "30951");
    assert.equal(night?.startDateTime, "2026-11-28T19:30:00.000+01:00");
    assert.equal(night?.endDateTime, "2026-11-29T07:00:00.000+01:00");

    const initiation = byId(extraction.events, "30765");
    assert.equal(initiation?.startDateTime, "2026-11-14T14:00:00.000+01:00");
    assert.equal(initiation?.endDateTime, "2026-11-14T16:00:00.000+01:00");
  });

  it("prend le tarif sur place de la fiche quand la grille n'a pas de prix", () => {
    assert.equal(byId(extraction.events, "30755")?.price, 5);
    assert.equal(byId(extraction.events, "30765")?.price, 3);
  });

  it("garde ce que la grille dit quand la fiche ne le précise pas", () => {
    const nexus = byId(extraction.events, "30864");
    assert.equal(nexus?.name, "Nexus Night");
    assert.equal(nexus?.gameName, "Riftbound");
    assert.equal(nexus?.price, 8);
    assert.equal(nexus?.startDateTime, "2026-11-12T19:30:00.000+01:00");
    // Pas de « data-fin » : la durée par défaut, comme avant.
    assert.equal(nexus?.endDateTime, "2026-11-12T23:30:00.000+01:00");
  });

  it("lit depuis la grille un événement dont la fiche manque ou n'a pas le bloc", () => {
    const url = "https://www.antretemps.com/soiree-jeux-jeudi-12/11/2026-19h30-a30755.html";
    const missing = extractHtmlEvents({ html: CALENDAR_PAGE, config, source, games: GAMES, now: NOVEMBER, details: {} });
    assert.equal(byId(missing.events, "30755")?.endDateTime, "2026-11-12T23:30:00.000+01:00");
    assert.deepEqual(missing.warnings.filter((warning) => warning.includes("at-event")), []);

    const without = extractHtmlEvents({
      html: CALENDAR_PAGE,
      config,
      source,
      games: GAMES,
      now: NOVEMBER,
      details: { [url]: "<p>Fiche refaite, sans bloc</p>" },
    });
    assert.equal(byId(without.events, "30755")?.endDateTime, "2026-11-12T23:30:00.000+01:00");
    assert.ok(without.warnings.some((warning) => warning.includes("« .at-event » absent")));
  });
});

describe("préréglage et sources déjà créées", () => {
  const OLD_COPY = { ...OASIS_PRESET.config, detail: undefined };

  it("donne la fiche du préréglage à une source qui en est une copie ancienne", () => {
    assert.deepEqual(withPresetDetail(OLD_COPY, SOURCE_URL).detail, OASIS_PRESET.config.detail);
    assert.deepEqual(withPresetDetail(OLD_COPY, "https://antretemps.com/evenements/").detail, OASIS_PRESET.config.detail);
  });

  it("laisse une autre boutique, un autre sélecteur ou une fiche configurée", () => {
    assert.equal(withPresetDetail(OLD_COPY, "https://www.autre-boutique.fr/evenements/").detail, undefined);
    assert.equal(withPresetDetail({ ...OLD_COPY, itemSelector: ".autre" }, SOURCE_URL).detail, undefined);
    const own = { selector: ".mien", fields: { date: { attribute: "data-jour" } } };
    assert.deepEqual(withPresetDetail({ ...OLD_COPY, detail: own }, SOURCE_URL).detail, own);
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

describe("date et heure à part", () => {
  it("lit une date en toutes lettres sans année", () => {
    assert.deepEqual(parseDateText("mercredi 02 septembre"), { day: 2, month: 9 });
    assert.deepEqual(parseDateText("03/09/2026"), { day: 3, month: 9, year: 2026 });
    assert.equal(parseDateText("bientôt"), undefined);
  });

  it("lit une heure seule ou une plage, avec ou sans secondes", () => {
    assert.deepEqual(parseTimeRange("19h30"), { start: { hour: 19, minute: 30 } });
    assert.deepEqual(parseTimeRange("13:30 - 18:30"), { start: { hour: 13, minute: 30 }, end: { hour: 18, minute: 30 } });
    assert.deepEqual(parseTimeRange("13:30:00 - 18:30:00"), { start: { hour: 13, minute: 30 }, end: { hour: 18, minute: 30 } });
    assert.equal(parseTimeRange("toute la journée"), undefined);
  });
});

describe("page du Gobelin — Thionville", () => {
  const extraction = extractHtmlEvents({
    html: GOBELIN_PAGE,
    config: GOBELIN_PRESET.config,
    source: { url: "https://www.lesanimationsdugobelin.com/animations", gameAliases: { "One Piece": "One Piece Card Game", "Yu-Gi-Oh": "Yu-Gi-Oh!" } },
    games: GAMES,
    now: NOW,
  });

  it("lit chaque carte", () => {
    assert.equal(extraction.itemCount, 5);
    assert.equal(extraction.events.length, 5);
    assert.deepEqual(extraction.warnings, []);
  });

  it("compose le début et la fin depuis la date et la plage horaire", () => {
    const nexus = extraction.events.find((event) => event.name === "Tournoi Nexus");
    assert.ok(nexus);
    assert.equal(nexus.gameName, "Riftbound");
    assert.match(nexus.startDateTime, /^2026-\d{2}-\d{2}T\d{2}:\d{2}:00\.000\+02:00$/);
    assert.ok(nexus.endDateTime > nexus.startDateTime);
    assert.equal(nexus.status, "available");
    assert.ok(nexus.url?.startsWith("https://www.lesanimationsdugobelin.com/animations/view/"));
    assert.equal(typeof nexus.price, "number");
  });

  it("lit le jeu à part et garde le titre entier comme nom", () => {
    const core = extraction.events.find((event) => event.name === "Tournoi Core Constructed");
    assert.equal(core?.gameName, "Lorcana");

    const standard = extraction.events.find((event) => event.name === "Tournoi Standard" && event.gameName === "Yu-Gi-Oh!");
    assert.ok(standard, "« Tournoi Standard » n'est pas un jeu suivi d'un nom");
  });

  it("retire du nom le jeu que le titre répète", () => {
    const prerelease = extraction.events.find((event) => event.gameName === "Pokémon");
    assert.equal(prerelease?.name, "Avant-Première Règne Delta");
  });

  it("lit « Complet » et « -1 restante » comme complet, « 8 restantes » comme disponible", () => {
    const byGame = Object.fromEntries(extraction.events.map((event) => [event.gameName, event.status]));
    assert.equal(byGame["One Piece Card Game"], "sold-out");
    assert.equal(byGame["Pokémon"], "sold-out");
    assert.equal(byGame["Yu-Gi-Oh!"], "available");
  });

  it("compte les événements de chaque ville, filtre compris", () => {
    assert.deepEqual(extraction.venueCounts, { Thionville: 5 });
  });

  it("ne garde que les villes demandées", () => {
    const metz = extractHtmlEvents({
      html: GOBELIN_PAGE,
      config: { ...GOBELIN_PRESET.config, venues: ["Metz"] },
      source: { url: "https://www.lesanimationsdugobelin.com/animations" },
      games: GAMES,
      now: NOW,
    });

    assert.equal(metz.itemCount, 5);
    assert.equal(metz.events.length, 0);
    assert.ok(metz.warnings.some((warning) => warning.includes("Metz")));

    const both = extractHtmlEvents({
      html: GOBELIN_PAGE,
      config: { ...GOBELIN_PRESET.config, venues: ["Metz", "thionville"] },
      source: { url: "https://www.lesanimationsdugobelin.com/animations" },
      games: GAMES,
      now: NOW,
    });
    assert.equal(both.events.length, 5, "la ville se compare à la casse près");

    const all = extractHtmlEvents({
      html: GOBELIN_PAGE,
      config: { ...GOBELIN_PRESET.config, venues: [] },
      source: { url: "https://www.lesanimationsdugobelin.com/animations" },
      games: GAMES,
      now: NOW,
    });
    assert.equal(all.events.length, 5, "sans ville, tout est gardé");
  });

  it("lit les villes que le formulaire de la page propose", () => {
    assert.deepEqual(readVenueOptions(GOBELIN_PAGE, GOBELIN_PRESET.config.venueOptionsSelector), [
      "Metz", "Nancy", "Pont-à-Mousson", "Semécourt", "Thionville", "Toul",
    ]);
    assert.deepEqual(readVenueOptions(GOBELIN_PAGE, undefined), []);
    assert.deepEqual(readVenueOptions(GOBELIN_PAGE, "select.nope option"), []);
  });

  it("remplace {ville} dans les champs de formulaire", () => {
    assert.equal(hasVenuePlaceholder(GOBELIN_PRESET.formFields), true);
    assert.equal(hasVenuePlaceholder({ animation: "Thionville.lieu" }), false);
    assert.equal(hasVenuePlaceholder(undefined), false);
    assert.deepEqual(formFieldsForVenue({ animation: "{ville}.lieu", q: "" }, "Metz"), { animation: "Metz.lieu", q: "" });
  });
});
