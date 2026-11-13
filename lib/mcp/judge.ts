/**
 * Le texte des outils MCP d'arbitrage, en fonction pure.
 *
 * Le rapport vient du moteur de jeu (`joutes-judge`) : il a fait tourner la
 * situation et cite la règle derrière chaque évènement et chaque refus. Ici, on
 * ne fait que l'écrire pour un assistant : le récit, la question en attente
 * avec ses choix numérotés, et ce qui ne peut pas être joué.
 */

/** Ce que le texte lit d'un rapport : la même forme pour tous les jeux du moteur. */
export type JudgeReportText = {
    summary: string;
    steps: { player: string; question: string; chose: string }[];
    asked: {
        player: string;
        text: string;
        choices: { label: string }[];
        unplayable: { name: string; reason: string; rule: string | null }[];
    } | null;
    result: Record<string, unknown> | null;
    rules: string[];
    notes: string[];
};

export type JudgeTextOptions = {
    /** L'adresse d'une règle par son numéro, pour que l'assistant la cite en lien (si le site publie ces règles). */
    ruleUrl?: (rule: string) => string;
    /** Le document dont viennent les numéros de règle, quand le site n'a pas de lien à donner. */
    rulebook?: string;
    /** Montrer les choix possibles (simulation) ou seulement la question (relecture). */
    withChoices: boolean;
    /** Ce que le moteur couvre, dit en fin de réponse (« extensions OGN et OGS »). */
    scope: string;
};

const MAX_CHOICES = 40;

export function describeJudgeReport(report: JudgeReportText, options: JudgeTextOptions): string {
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
        const reason = typeof report.result.reason === "string" ? ` : ${report.result.reason}` : ".";
        lines.push("", `Partie terminée${reason}`);
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
        const { ruleUrl } = options;
        if (ruleUrl) {
            lines.push("", "Règles citées :");
            for (const rule of report.rules) lines.push(`- ${rule} : ${ruleUrl(rule)}`);
        } else {
            lines.push("", `Règles citées${options.rulebook ? ` (${options.rulebook})` : ""} : ${report.rules.join(", ")}`);
        }
    }

    lines.push(
        "",
        `Réponse calculée par le moteur de jeu Joutes (${options.scope}). Ce n'est pas une décision officielle : en tournoi, l'arbitre tranche.`,
    );

    return lines.join("\n");
}
