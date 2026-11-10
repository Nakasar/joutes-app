import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";

import { getGameTable } from "@/lib/db/game-tables";
import { EngineError, judgeReview, judgeSimulate } from "@/lib/engine/server";
import { engineServer } from "@/lib/engine/tables";
import { describeJudgeReport } from "@/lib/mcp/judge";
import { joutesUrl } from "@/lib/mcp/links";

import { registerJoutesTool, userIdFrom, type ToolResult } from "./tool-policy";
import { errorResult, textResult, withToolLogging } from "./tools";

/*
 * Les outils d'arbitrage Riftbound : le moteur de jeu (dépôt joutes-engine,
 * `joutes-judge`) fait tourner la situation qu'on lui décrit et cite la règle
 * derrière chaque évènement et chaque refus. Un assistant répond ainsi à « que
 * se passe-t-il si… » et « pourquoi je ne peux pas… » en s'appuyant sur une
 * exécution, pas sur sa lecture des règles.
 *
 * Le moteur tourne dans ce processus (WebAssembly) : ces outils ne dépendent
 * pas du serveur de parties, sauf la relecture d'une table en ligne, qui va y
 * chercher son journal.
 */

const ruleUrl = (rule: string) => joutesUrl(`/games/riftbound/rules/cr#rule-${rule}`);

const scenarioSchema = z
    .object({
        mode: z.enum(["duel", "ffa3", "ffa4", "teams"]).optional().describe("Mode de jeu (duel par défaut)"),
        legends: z.array(z.string()).optional().describe("La légende de chaque joueur, par code (OGN-249) ou nom exact"),
        battlefields: z.array(z.string()).optional().describe("Les champs de bataille en jeu"),
        turn: z.number().int().min(0).optional().describe("Le siège dont c'est le tour, en phase principale (0 par défaut)"),
        controllers: z
            .array(z.number().int().nullable())
            .optional()
            .describe("Qui contrôle chaque champ de bataille (siège ou null)"),
        players: z
            .array(z.looseObject({}))
            .optional()
            .describe(
                "Un objet par joueur, tout est facultatif : name, points, hand (cartes), base (cartes), " +
                    "battlefields (une liste de cartes par champ de bataille), hidden ([{ bf, card }]), " +
                    "runes et exhausted_runes ({ fury, calm, mind, body, chaos, order } en nombres), trash, deck_top. " +
                    "Une carte est un code ou un nom exact, ou { card, exhausted, damage, buffed, stunned }.",
            ),
    })
    .describe("La situation de jeu. Tout est facultatif : par défaut un duel, tour du joueur 1, phase principale.");

type SimulateArgs = { scenario: z.infer<typeof scenarioSchema>; steps: number[] };

async function handleJudgeSimulate({ scenario, steps }: SimulateArgs): Promise<ToolResult> {
    try {
        const report = judgeSimulate(scenario, steps);
        return textResult(describeJudgeReport(report, { ruleUrl, withChoices: true }));
    } catch (error) {
        // Carte inconnue, situation impossible, numéro de choix hors liste : le
        // message du moteur dit quoi corriger.
        if (error instanceof EngineError) return errorResult(`Le moteur refuse cette situation : ${error.message}`);
        throw error;
    }
}

type ReviewArgs = { tableId?: string; record?: string; upto?: number; last: number };

async function recordOfTable(tableId: string, userId: string | undefined): Promise<string | ToolResult> {
    const table = await getGameTable(tableId.trim().toLowerCase());
    if (!table) return errorResult(`Aucune table en ligne avec le code « ${tableId} ».`);
    // Le journal d'une partie dit tout, mains comprises : pendant la partie, il
    // ferait un outil de triche. Une fois finie, il revient à ceux qui l'ont jouée.
    if (table.status !== "finished") {
        return errorResult("Cette partie n'est pas terminée : son journal ne se relit qu'une fois la partie finie.");
    }
    if (!userId || !table.seats.some((seat) => seat.userId === userId)) {
        return errorResult("Seuls les joueurs de cette table peuvent relire sa partie (authentification requise).");
    }
    const server = engineServer();
    if (!server) return errorResult("Le serveur de parties n'est pas configuré.");
    const response = await fetch(`${server.url}/games/${table.id}/record`, {
        headers: { authorization: `Bearer ${server.adminToken}` },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return errorResult("Le serveur de parties n'a plus le journal de cette partie.");
    return response.text();
}

async function handleJudgeReview(
    { tableId, record, upto, last }: ReviewArgs,
    extra: ServerContext,
): Promise<ToolResult> {
    // Le journal reste du texte jusqu'au moteur : voir `judgeReview`.
    let source: string;
    if (record) {
        source = record;
    } else if (tableId) {
        const found = await recordOfTable(tableId, userIdFrom(extra));
        if (typeof found !== "string") return found;
        source = found;
    } else {
        return errorResult("Donner `tableId` (code d'une table en ligne terminée) ou `record` (journal d'une partie).");
    }

    try {
        const report = judgeReview(source, upto ?? null, last);
        return textResult(describeJudgeReport(report, { ruleUrl, withChoices: false }));
    } catch (error) {
        if (error instanceof EngineError) return errorResult(`Le moteur ne peut pas rejouer ce journal : ${error.message}`);
        throw error;
    }
}

export function registerJudgeTools(server: McpServer): void {
    registerJoutesTool(server, "riftbound_judge_simulate", {
        title: "Simulate a Riftbound situation",
        description:
            "Arbitrage Riftbound par le moteur de jeu Joutes : décrire une situation (mains, bases, champs de bataille, runes), " +
            "le moteur la fait tourner et répond ce qui se passe, quelle décision est attendue avec ses choix numérotés, " +
            "quelles cartes ne peuvent pas être jouées et pourquoi, en citant la règle des Core Rules à chaque fois. " +
            "Sans mémoire : pour dérouler un choix, rappeler avec la même situation et le numéro du choix ajouté à `steps`. " +
            "Cartes des extensions OGN et OGS seulement, désignées par code (OGN-001) ou nom anglais exact.",
        inputSchema: {
            scenario: scenarioSchema,
            steps: z
                .array(z.number().int().min(0))
                .max(200)
                .default([])
                .describe("Les numéros des choix déjà faits, dans l'ordre"),
        },
    }, withToolLogging("riftbound_judge_simulate", handleJudgeSimulate));

    registerJoutesTool(server, "riftbound_judge_review", {
        title: "Review a played Riftbound game",
        description:
            "Relire une partie Riftbound jouée sur Joutes : le récit des derniers évènements avec la règle appliquée à chacun, " +
            "et la décision en attente à ce moment-là. Donner `tableId` (code d'une table en ligne terminée dont l'utilisateur " +
            "était joueur) ou `record` (le journal JSON d'une partie : configuration, graine, actions).",
        inputSchema: {
            tableId: z.string().optional().describe("Code de la table en ligne"),
            record: z.string().max(2_000_000).optional().describe("Journal de la partie, en JSON"),
            upto: z.number().int().min(0).optional().describe("S'arrêter après ce nombre d'actions (toute la partie par défaut)"),
            last: z.number().int().min(1).max(200).default(30).describe("Nombre d'évènements à raconter avant ce point"),
        },
    }, withToolLogging("riftbound_judge_review", handleJudgeReview));
}
