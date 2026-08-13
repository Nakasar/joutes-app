import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  announcementMessage,
  formatDeadline,
  resultDisputedMessage,
  resultToConfirmMessage,
  roundCompleteMessage,
  roundPairedMessage,
  tournamentLink,
  tournamentStatusMessage,
} from "./notification-messages";

/**
 * Tests des messages de tournoi.
 *
 * Ils sont lus sur un écran de verrouillage, entre deux parties : le titre doit
 * nommer le tournoi — on peut en jouer deux le même week-end — et le corps dire
 * quoi faire. C'est ce que ces tests verrouillent, plus la différence de fond
 * entre une ronde jouée sur place et un intervalle.
 *
 * Exécution : `npm run test`.
 */

const base = { tournamentName: "Coupe de printemps", roundNumber: 3 } as const;

describe("roundPairedMessage — sur place", () => {
  it("met la table en tête : c'est ce qui fait se lever", () => {
    const message = roundPairedMessage({
      ...base,
      pacing: "live",
      opponents: ["Nakasar"],
      tableNumber: 7,
    });

    assert.equal(message.title, "Coupe de printemps — ronde 3");
    assert.equal(message.description, "Table 7 — vous affrontez Nakasar.");
  });

  it("se passe de table quand il n'y en a pas", () => {
    const message = roundPairedMessage({ ...base, pacing: "live", opponents: ["Nakasar"] });

    assert.equal(message.description, "Vous affrontez Nakasar.");
  });

  it("annonce le scénario quand la ronde en a un", () => {
    const message = roundPairedMessage({
      ...base,
      pacing: "live",
      opponents: ["Nakasar"],
      tableNumber: 7,
      scenario: "Prise de position",
    });

    assert.ok(message.description.endsWith("Scénario : Prise de position."), message.description);
  });

  it("dit au joueur exempt qu'il l'est", () => {
    // L'ancien code écartait les BYE. Sur place, c'est précisément ce message
    // qui permet d'aller prendre un café au lieu de chercher sa table.
    const message = roundPairedMessage({ ...base, pacing: "live", opponents: [] });

    assert.equal(message.description, "Vous êtes exempt de cette ronde.");
  });

  it("énumère plusieurs adversaires lisiblement", () => {
    assert.equal(
      roundPairedMessage({ ...base, pacing: "live", opponents: ["Nakasar", "Kestrel"] }).description,
      "Vous affrontez Nakasar et Kestrel."
    );
    assert.equal(
      roundPairedMessage({ ...base, pacing: "live", opponents: ["A", "B", "C"] }).description,
      "Vous affrontez A, B et C."
    );
  });
});

describe("roundPairedMessage — intervalle", () => {
  it("parle d'échéance, pas de table", () => {
    const message = roundPairedMessage({
      ...base,
      pacing: "asynchronous",
      opponents: ["Nakasar"],
      deadline: "jeudi 14 août à 18h30",
    });

    assert.equal(message.title, "Coupe de printemps — intervalle 3");
    assert.ok(message.description.includes("avant le jeudi 14 août à 18h30"), message.description);
    assert.ok(!message.description.includes("Table"), message.description);
  });

  it("reste compréhensible sans échéance", () => {
    const message = roundPairedMessage({ ...base, pacing: "asynchronous", opponents: ["Nakasar"] });

    assert.equal(
      message.description,
      "Vous affrontez Nakasar. Organisez votre partie et rapportez le résultat."
    );
  });
});

describe("announcementMessage", () => {
  it("reprend le message de l'organisateur tel quel", () => {
    const message = announcementMessage({
      tournamentName: "Coupe de printemps",
      message: "Pause déjeuner, reprise à 14 h.",
      level: "info",
    });

    assert.equal(message.title, "Coupe de printemps — annonce");
    assert.equal(message.description, "Pause déjeuner, reprise à 14 h.");
  });

  it("signale l'urgence dans le titre", () => {
    // Le titre est la seule partie qu'on lit à coup sûr, notification repliée.
    const message = announcementMessage({
      tournamentName: "Coupe de printemps",
      message: "Évacuation de la salle.",
      level: "urgent",
    });

    assert.ok(message.title.startsWith("🚨 "), message.title);
    assert.equal(message.description, "Évacuation de la salle.");
  });
});

describe("resultToConfirmMessage", () => {
  it("nomme qui a saisi et où", () => {
    const message = resultToConfirmMessage({
      tournamentName: "Coupe de printemps",
      reporterName: "Nakasar",
      tableNumber: 7,
    });

    assert.equal(message.title, "Coupe de printemps — résultat à confirmer");
    assert.ok(message.description.startsWith("Nakasar a saisi le résultat de votre match de la table 7."));
  });

  it("retombe sur « votre adversaire » quand le nom manque", () => {
    const message = resultToConfirmMessage({ tournamentName: "Coupe de printemps" });

    assert.ok(message.description.startsWith("Votre adversaire a saisi le résultat de votre match."));
  });
});

describe("messages de l'organisation", () => {
  it("annonce un résultat contesté", () => {
    assert.equal(
      resultDisputedMessage({ tournamentName: "Coupe de printemps", tableNumber: 7 }).description,
      "Table 7 : le résultat d'un match est contesté et attend votre arbitrage."
    );
    assert.equal(
      resultDisputedMessage({ tournamentName: "Coupe de printemps" }).description,
      "Le résultat d'un match est contesté et attend votre arbitrage."
    );
  });

  it("annonce une ronde complète", () => {
    const message = roundCompleteMessage({ tournamentName: "Coupe de printemps", roundNumber: 3 });

    assert.equal(message.title, "Coupe de printemps — ronde 3 complète");
  });
});

describe("tournamentStatusMessage", () => {
  it("distingue le début de la fin", () => {
    assert.ok(
      tournamentStatusMessage({ tournamentName: "Coupe", status: "in-progress" }).title.endsWith("c'est parti")
    );
    assert.ok(
      tournamentStatusMessage({ tournamentName: "Coupe", status: "completed" }).title.endsWith("terminé")
    );
  });
});

describe("tournamentLink", () => {
  it("mène à la page du tournoi, et pas plus fin", () => {
    // L'application mobile n'a d'écran ni pour un match ni pour une ronde :
    // pointer vers eux ouvrirait une page blanche.
    assert.equal(tournamentLink("abc123"), "/tournaments/abc123");
  });
});

describe("formatDeadline", () => {
  it("rend une date lisible en français", () => {
    const formatted = formatDeadline(new Date("2026-08-14T18:30:00Z"));

    assert.ok(/août/.test(formatted), formatted);
    assert.ok(/h/.test(formatted), formatted);
  });
});
