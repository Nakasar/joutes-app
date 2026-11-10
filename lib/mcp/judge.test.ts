import { test } from "node:test";
import assert from "node:assert/strict";

import { describeJudgeReport } from "./judge.ts";
import type { JudgeReport } from "../engine/types.ts";

const table = {} as JudgeReport["table"];

const report: JudgeReport = {
    summary: "Ada joue Facebreaker. (règle 357)",
    steps: [{ player: "Ada", question: "Votre phase principale.", chose: "Jouer Facebreaker" }],
    events: [],
    asked: {
        seat: 1,
        player: "Bob",
        kind: "priority",
        text: "Réagir ?",
        card: null,
        choices: [
            { action: { type: "pass" }, label: "Passer" },
            { action: { type: "play", card: 4 }, label: "Jouer Defy" },
        ],
        unplayable: [{ card: "OGN-001", name: "Cleave", reason: "pas assez d'Énergie", rule: "357" }],
    },
    result: null,
    rules: ["357"],
    notes: ["Carte appliquée en partie : OGN-194."],
    table,
};

const ruleUrl = (rule: string) => `https://joutes.app/r#${rule}`;

test("le rapport d'arbitrage numérote les choix à partir de 0 et cite les règles en lien", () => {
    const text = describeJudgeReport(report, { ruleUrl, withChoices: true });
    assert.match(text, /1\. Ada — Votre phase principale\. → Jouer Facebreaker/);
    assert.match(text, /Décision attendue de Bob : Réagir \?/);
    assert.match(text, /\[0\] Passer\n {2}\[1\] Jouer Defy/);
    assert.match(text, /- Cleave : pas assez d'Énergie \(règle 357\)/);
    assert.match(text, /- 357 : https:\/\/joutes\.app\/r#357/);
    assert.match(text, /Réserves :\n- Carte appliquée en partie/);
});

test("la relecture d'une partie ne propose pas de dérouler des choix", () => {
    const text = describeJudgeReport(report, { ruleUrl, withChoices: false });
    assert.doesNotMatch(text, /\[0\]/);
    assert.match(text, /Décision attendue de Bob/);
});

test("une partie finie annonce son résultat", () => {
    const text = describeJudgeReport(
        { ...report, asked: null, result: { winners: [0], reason: "Score de victoire atteint." } },
        { ruleUrl, withChoices: true },
    );
    assert.match(text, /Partie terminée : Score de victoire atteint\./);
});
