/**
 * Le texte des outils MCP d'arbitrage, en fonction pure.
 *
 * Le rapport vient du moteur de jeu (`joutes-judge`) : il a fait tourner la
 * situation et cite la règle derrière chaque évènement et chaque refus. Ici, on
 * ne fait que l'écrire pour un assistant : le récit, la question en attente
 * avec ses choix numérotés, et ce qui ne peut pas être joué.
 */

import type { JudgeReport } from "@/lib/engine/types";

export type JudgeTextOptions = {
    /** L'adresse d'une règle par son numéro, pour que l'assistant la cite en lien. */
    ruleUrl: (rule: string) => string;
    /** Montrer les choix possibles (simulation) ou seulement la question (relecture). */
    withChoices: boolean;
};

const MAX_CHOICES = 40;

export function describeJudgeReport(report: JudgeReport, options: JudgeTextOptions): string {
    const lines: string[] = [];

    if (report.steps.length > 0) {
        lines.push("Choix déroulés :");
        report.steps.forEach((step, index) => {
            lines.push(`${index + 1}. ${step.player} — ${step.question} → ${step.chose}`);
        });
        lines.push("");
    }

    lines.push("Ce qui se passe :");
    lines.push(report.summary.trim() || "(rien de nouveau)");

    if (report.result) {
        lines.push("", `Partie terminée : ${report.result.reason}`);
    }

    const asked = report.asked;
    if (asked) {
        lines.push("", `Décision attendue de ${asked.player} : ${asked.text}`);
        if (options.withChoices) {
            asked.choices.slice(0, MAX_CHOICES).forEach((choice, index) => {
                lines.push(`  [${index}] ${choice.label}`);
            });
            if (asked.choices.length > MAX_CHOICES) {
                lines.push(`  … et ${asked.choices.length - MAX_CHOICES} autres choix.`);
            }
            lines.push("Pour dérouler un choix, rappeler l'outil avec son numéro ajouté à la fin de `steps`.");
        }
        if (asked.unplayable.length > 0) {
            lines.push("", `Ce que ${asked.player} ne peut pas jouer maintenant :`);
            for (const refusal of asked.unplayable) {
                lines.push(`- ${refusal.name} : ${refusal.reason}${refusal.rule ? ` (règle ${refusal.rule})` : ""}`);
            }
        }
    }

    if (report.notes.length > 0) {
        lines.push("", "Réserves :");
        for (const note of report.notes) lines.push(`- ${note}`);
    }

    if (report.rules.length > 0) {
        lines.push("", "Règles citées :");
        for (const rule of report.rules) lines.push(`- ${rule} : ${options.ruleUrl(rule)}`);
    }

    lines.push(
        "",
        "Réponse calculée par le moteur de jeu Joutes (extensions OGN et OGS). Ce n'est pas une décision officielle : en tournoi, l'arbitre tranche.",
    );

    return lines.join("\n");
}
