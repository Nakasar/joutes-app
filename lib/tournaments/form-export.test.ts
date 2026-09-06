import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFormResponseRows,
  buildFormResponsesCsv,
  buildFormResponsesCsvFileName,
  formAnswerText,
  formResponseCell,
  type FormResponseLabels,
} from "./form-export";
import type { TournamentForm, TournamentFormField } from "@/lib/types/Tournament";

/**
 * Tests de la mise à plat des réponses au formulaire d'inscription.
 *
 * Exécution : `npm run test`.
 */

const labels: FormResponseLabels = {
  decklistCount: (count) => `Cartes : ${count}`,
  unrecognized: (count) => `Non reconnues : ${count}`,
  banned: (count) => `Bannies : ${count}`,
  parseError: "Liste non vérifiée",
};

const field = (id: string, type: TournamentFormField["type"], label = id): TournamentFormField => ({
  id,
  type,
  label,
  required: false,
});

const form: TournamentForm = {
  fields: [
    field("pseudo", "text", "Pseudo en jeu"),
    field("age", "number", "Âge"),
    field("faction", "single-choice", "Faction"),
    field("card", "card", "Carte fétiche"),
    field("deck", "decklist", "Liste"),
  ],
  playerEditable: true,
  lateSubmissions: true,
};

const when = new Date("2026-05-01T10:00:00Z");

describe("formAnswerText", () => {
  it("rend chaque type de réponse en texte", () => {
    assert.equal(formAnswerText(field("a", "text"), { fieldId: "a", text: " Nakasar ", updatedAt: when }), "Nakasar");
    assert.equal(formAnswerText(field("a", "number"), { fieldId: "a", number: 42, updatedAt: when }), "42");
    assert.equal(
      formAnswerText(field("a", "multiple-choice"), { fieldId: "a", choices: ["Rouge", "Bleu"], updatedAt: when }),
      "Rouge, Bleu"
    );
    assert.equal(
      formAnswerText(field("a", "card"), {
        fieldId: "a",
        card: { cardId: "c1", name: "Lightning Bolt", setCode: "LEA", collectorNumber: "161" },
        updatedAt: when,
      }),
      "Lightning Bolt (LEA 161)"
    );
    assert.equal(
      formAnswerText(field("a", "card"), {
        fieldId: "a",
        card: { cardId: "c1", name: "Lightning Bolt" },
        updatedAt: when,
      }),
      "Lightning Bolt"
    );
  });

  it("est vide sans réponse", () => {
    assert.equal(formAnswerText(field("a", "text"), undefined), "");
    assert.equal(formAnswerText(field("a", "number"), { fieldId: "a", updatedAt: when }), "");
  });
});

describe("formResponseCell", () => {
  it("résume une liste de deck analysée par son nombre de cartes, avec ses alertes", () => {
    const cell = formResponseCell(
      field("deck", "decklist"),
      {
        fieldId: "deck",
        decklist: {
          input: "4 Lightning Bolt\n4 Counterspell",
          parsed: { sections: [], totalCards: 8, unrecognizedCards: 1, bannedCards: 2 },
        },
        updatedAt: when,
      },
      labels
    );

    assert.equal(cell.text, "4 Lightning Bolt\n4 Counterspell");
    assert.equal(cell.summary, "Cartes : 8");
    assert.deepEqual(cell.warnings, ["Non reconnues : 1", "Bannies : 2"]);
  });

  it("compte les lignes d'une liste non analysée et signale l'échec d'analyse", () => {
    const cell = formResponseCell(
      field("deck", "decklist"),
      {
        fieldId: "deck",
        decklist: { input: "4 Lightning Bolt\n\n4 Counterspell\n", parseError: "lien mort" },
        updatedAt: when,
      },
      labels
    );

    assert.equal(cell.summary, "Cartes : 2");
    assert.deepEqual(cell.warnings, ["Liste non vérifiée"]);
  });

  it("ne marque tardive qu'une réponse effectivement donnée", () => {
    const late = formResponseCell(field("a", "text"), { fieldId: "a", text: "oui", late: true, updatedAt: when }, labels);
    const empty = formResponseCell(field("a", "text"), { fieldId: "a", text: "", late: true, updatedAt: when }, labels);

    assert.equal(late.late, true);
    assert.equal(empty.late, false);
  });
});

describe("buildFormResponseRows", () => {
  it("fait une ligne par joueur, une cellule par champ dans l'ordre du formulaire", () => {
    const rows = buildFormResponseRows(
      form,
      [
        {
          id: "p1",
          displayName: "Nakasar",
          discriminator: "1234",
          status: "registered",
          formAnswers: [
            { fieldId: "age", number: 30, updatedAt: new Date("2026-05-01T10:00:00Z") },
            { fieldId: "pseudo", text: "Nak", updatedAt: new Date("2026-05-02T10:00:00Z"), late: true },
          ],
        },
        { id: "p2", displayName: "Kestrel", status: "dropped" },
      ],
      labels
    );

    assert.equal(rows.length, 2);
    assert.equal(rows[0].label, "Nakasar#1234");
    assert.equal(rows[0].answered, true);
    assert.equal(rows[0].late, true);
    assert.equal(rows[0].answeredAt?.toISOString(), "2026-05-02T10:00:00.000Z");
    assert.deepEqual(
      rows[0].cells.map((cell) => cell.text),
      ["Nak", "30", "", "", ""]
    );

    assert.equal(rows[1].label, "Kestrel");
    assert.equal(rows[1].answered, false);
    assert.equal(rows[1].answeredAt, undefined);
    assert.equal(rows[1].status, "dropped");
  });
});

describe("buildFormResponsesCsv", () => {
  it("met les libellés des questions en en-tête et le texte complet dans les cellules", () => {
    const rows = buildFormResponseRows(
      form,
      [
        {
          id: "p1",
          displayName: "Nakasar",
          status: "registered",
          formAnswers: [
            { fieldId: "pseudo", text: "Nak; le \"grand\"", updatedAt: when },
            {
              fieldId: "deck",
              decklist: {
                input: "4 Bolt\n4 Counterspell",
                parsed: { sections: [], totalCards: 8, unrecognizedCards: 0, bannedCards: 0 },
              },
              updatedAt: when,
            },
          ],
        },
      ],
      labels
    );

    const csv = buildFormResponsesCsv(form, rows, {
      player: "Joueur",
      status: "Statut",
      answeredAt: "Dernière réponse",
      late: "Tardif",
      yes: "Oui",
      no: "Non",
      statusLabels: { registered: "Inscrit", "pre-registered": "Pré-inscrit", dropped: "Retiré" },
      formatDate: (date) => date.toISOString(),
    });

    // La liste de deck entière tient dans une cellule, sauts de ligne compris.
    assert.equal(
      csv,
      "﻿Joueur;Statut;Pseudo en jeu;Âge;Faction;Carte fétiche;Liste;Dernière réponse;Tardif\r\n" +
        'Nakasar;Inscrit;"Nak; le ""grand""";;;;"4 Bolt\n4 Counterspell";2026-05-01T10:00:00.000Z;Non\r\n'
    );
  });
});

describe("buildFormResponsesCsvFileName", () => {
  it("dérive un nom de fichier sûr du nom du tournoi", () => {
    assert.equal(buildFormResponsesCsvFileName("Coupe d'été — Édition 2026"), "coupe-d-ete-edition-2026-reponses.csv");
    assert.equal(buildFormResponsesCsvFileName("   "), "tournoi-reponses.csv");
  });
});
