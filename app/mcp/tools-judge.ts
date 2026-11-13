import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";

import { getGameTable } from "@/lib/db/game-tables";
import { EngineError, judgeReview, judgeSimulate } from "@/lib/engine/server";
import { engineGameId } from "@/lib/engine/results";
import { swuJudgeReview, swuJudgeSimulate } from "@/lib/engine/swu/server";
import { engineServer, reconcileTable, SWU_SLUG } from "@/lib/engine/tables";
import { describeJudgeReport } from "@/lib/mcp/judge";
import { joutesUrl } from "@/lib/mcp/links";

import { registerJoutesTool, userIdFrom, type ToolResult } from "./tool-policy";
import { errorResult, textResult, withToolLogging } from "./tools";

/*
 * Les outils d'arbitrage (Riftbound et Star Wars: Unlimited) : le moteur de jeu (dépôt joutes-engine,
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

const RIFTBOUND_TEXT = { ruleUrl, scope: "extensions OGN et OGS" };
// Le site ne publie pas les règles de SWU : les numéros sont cités avec leur document.
const SWU_TEXT = { rulebook: "Comprehensive Rules 8.0", scope: "Star Wars: Unlimited, format Premier" };

const scenarioSchema = z
    .object({
        mode: z.enum(["duel", "ffa3", "ffa4", "teams"]).optional().describe("Mode de jeu (duel par défaut)"),
        legends: z.array(z.string().max(80)).max(4).optional().describe("La légende de chaque joueur, par code (OGN-249) ou nom exact"),
        battlefields: z.array(z.string().max(80)).max(12).optional().describe("Les champs de bataille en jeu"),
        turn: z.number().int().min(0).optional().describe("Le siège dont c'est le tour, en phase principale (0 par défaut)"),
        controllers: z
            .array(z.number().int().nullable())
            .max(12)
            .optional()
            .describe("Qui contrôle chaque champ de bataille (siège ou null)"),
        players: z
            .array(z.looseObject({}))
            .max(4)
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

/**
 * Le moteur tourne dans le processus qui répond : ce qu'on lui donne à rejouer
 * est borné. Une vraie partie tient dans quelques dizaines de kilo-octets.
 */
const MAX_SCENARIO = 20_000;
const MAX_RECORD = 400_000;

async function handleJudgeSimulate({ scenario, steps }: SimulateArgs): Promise<ToolResult> {
    if (JSON.stringify(scenario).length > MAX_SCENARIO) {
        return errorResult("Cette situation est trop longue : ne décrire que les cartes utiles à la question.");
    }
    try {
        const report = judgeSimulate(scenario, steps);
        return textResult(describeJudgeReport(report, { ...RIFTBOUND_TEXT, withChoices: true }));
    } catch (error) {
        // Carte inconnue, situation impossible, numéro de choix hors liste : le
        // message du moteur dit quoi corriger.
        if (error instanceof EngineError) return errorResult(`Le moteur refuse cette situation : ${error.message}`);
        throw error;
    }
}

type ReviewArgs = { tableId?: string; record?: string; upto?: number; last: number };

async function recordOfTable(tableId: string, userId: string | undefined, swu: boolean): Promise<string | ToolResult> {
    const stored = await getGameTable(tableId.trim().toLowerCase());
    // L'annonce de fin a pu se perdre : on demande au serveur de parties.
    const table = stored && (await reconcileTable(stored));
    if (!table) return errorResult(`Aucune table en ligne avec le code « ${tableId} ».`);
    // Chaque jeu a son moteur : le journal d'une table ne se relit qu'avec l'outil de son jeu.
    if ((table.gameSlug === SWU_SLUG) !== swu) {
        return errorResult(
            swu
                ? "Cette table n'est pas une partie de Star Wars: Unlimited : utiliser `riftbound_judge_review`."
                : "Cette table est une partie de Star Wars: Unlimited : utiliser `swu_judge_review`.",
        );
    }
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
    const response = await fetch(`${server.url}/games/${engineGameId(table)}/record`, {
        headers: { authorization: `Bearer ${server.adminToken}` },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return errorResult("Le serveur de parties n'a plus le journal de cette partie.");
    return response.text();
}

async function reviewWith(
    { tableId, record, upto, last }: ReviewArgs,
    extra: ServerContext,
    swu: boolean,
): Promise<ToolResult> {
    // Le journal reste du texte jusqu'au moteur : voir `judgeReview`.
    let source: string;
    if (record) {
        source = record;
    } else if (tableId) {
        const found = await recordOfTable(tableId, userIdFrom(extra), swu);
        if (typeof found !== "string") return found;
        source = found;
    } else {
        return errorResult("Donner `tableId` (code d'une table en ligne terminée) ou `record` (journal d'une partie).");
    }

    try {
        const text = swu
            ? describeJudgeReport(swuJudgeReview(source, upto ?? null, last), { ...SWU_TEXT, withChoices: false })
            : describeJudgeReport(judgeReview(source, upto ?? null, last), { ...RIFTBOUND_TEXT, withChoices: false });
        return textResult(text);
    } catch (error) {
        if (error instanceof EngineError) return errorResult(`Le moteur ne peut pas rejouer ce journal : ${error.message}`);
        throw error;
    }
}

const handleJudgeReview = (args: ReviewArgs, extra: ServerContext) => reviewWith(args, extra, false);
const handleSwuJudgeReview = (args: ReviewArgs, extra: ServerContext) => reviewWith(args, extra, true);

const swuScenarioSchema = z
    .object({
        leaders: z.array(z.string().max(80)).max(2).optional().describe("Le leader de chaque joueur, par code (SOR-005) ou nom complet"),
        bases: z.array(z.string().max(80)).max(2).optional().describe("La base de chaque joueur"),
        turn: z.number().int().min(0).max(1).optional().describe("Le siège qui doit faire la prochaine action (0 par défaut)"),
        initiative: z.number().int().min(0).max(1).optional().describe("Le siège qui a l'initiative (0 par défaut)"),
        initiative_taken: z.boolean().optional().describe("L'initiative a déjà été prise ce round"),
        round: z.number().int().min(1).max(99).optional().describe("Le numéro du round (1 par défaut)"),
        players: z
            .array(z.looseObject({}))
            .max(2)
            .optional()
            .describe(
                "Un objet par joueur, tout est facultatif : name, base_damage, " +
                    "leader ({ deployed, exhausted, damage, shields, experience, upgrades }), hand (cartes), " +
                    "units (chaque unité va dans l'arène de sa carte), resources et exhausted_resources (nombres), " +
                    "resource_cards (cartes précises en ressource, pour Smuggle ou Plot), discard, " +
                    "deck_top (la première sera piochée en premier), deck (cartes sans texte dessous, 10 par défaut), " +
                    "force (booléen), credits (nombre). " +
                    "Une unité est un code ou un nom, ou { card, exhausted, damage, shields, experience, upgrades }.",
            ),
    })
    .describe(
        "La situation de jeu. Tout est facultatif : par défaut Luke Skywalker contre Darth Vader, round 1, " +
            "phase d'action, au joueur 1 qui a l'initiative.",
    );

type SwuSimulateArgs = { scenario: z.infer<typeof swuScenarioSchema>; steps: number[] };

async function handleSwuJudgeSimulate({ scenario, steps }: SwuSimulateArgs): Promise<ToolResult> {
    if (JSON.stringify(scenario).length > MAX_SCENARIO) {
        return errorResult("Cette situation est trop longue : ne décrire que les cartes utiles à la question.");
    }
    try {
        const report = swuJudgeSimulate(scenario, steps);
        return textResult(describeJudgeReport(report, { ...SWU_TEXT, withChoices: true }));
    } catch (error) {
        if (error instanceof EngineError) return errorResult(`Le moteur refuse cette situation : ${error.message}`);
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
            record: z.string().max(MAX_RECORD).optional().describe("Journal de la partie, en JSON"),
            upto: z.number().int().min(0).optional().describe("S'arrêter après ce nombre d'actions (toute la partie par défaut)"),
            last: z.number().int().min(1).max(200).default(30).describe("Nombre d'évènements à raconter avant ce point"),
        },
    }, withToolLogging("riftbound_judge_review", handleJudgeReview));

    registerJoutesTool(server, "swu_judge_simulate", {
        title: "Simulate a Star Wars: Unlimited situation",
        description:
            "Arbitrage Star Wars: Unlimited par le moteur de jeu Joutes : décrire une situation (leaders, bases, unités, mains, " +
            "ressources), le moteur la fait tourner et répond ce qui se passe, quelle décision est attendue avec ses choix " +
            "numérotés, quelles cartes de la main ne peuvent pas être jouées et pourquoi, en citant la règle des " +
            "Comprehensive Rules 8.0 à chaque fois. " +
            "Sans mémoire : pour dérouler un choix, rappeler avec la même situation et le numéro du choix ajouté à `steps`. " +
            "Format Premier, extensions SOR à HMW. Une carte se désigne par son code (SOR-095), son nom anglais complet " +
            "(« Luke Skywalker, Jedi Knight ») ou son nom seul s'il n'est porté que par une carte ; sinon le moteur liste les codes possibles.",
        inputSchema: {
            scenario: swuScenarioSchema,
            steps: z
                .array(z.number().int().min(0))
                .max(200)
                .default([])
                .describe("Les numéros des choix déjà faits, dans l'ordre"),
        },
    }, withToolLogging("swu_judge_simulate", handleSwuJudgeSimulate));

    registerJoutesTool(server, "swu_judge_review", {
        title: "Review a played Star Wars: Unlimited game",
        description:
            "Relire une partie de Star Wars: Unlimited jouée sur Joutes : le récit des derniers évènements avec la règle " +
            "appliquée à chacun, et la décision en attente à ce moment-là. Donner `tableId` (code d'une table en ligne " +
            "terminée dont l'utilisateur était joueur) ou `record` (le journal JSON d'une partie : configuration, graine, actions).",
        inputSchema: {
            tableId: z.string().optional().describe("Code de la table en ligne"),
            record: z.string().max(MAX_RECORD).optional().describe("Journal de la partie, en JSON"),
            upto: z.number().int().min(0).optional().describe("S'arrêter après ce nombre d'actions (toute la partie par défaut)"),
            last: z.number().int().min(1).max(200).default(30).describe("Nombre d'évènements à raconter avant ce point"),
        },
    }, withToolLogging("swu_judge_review", handleSwuJudgeReview));
}
