import type {
    Tournament,
    TournamentMatch,
    TournamentPhase,
    TournamentPlayer,
    TournamentPuzzleSeat,
    TournamentRound,
    TournamentRoundStanding,
} from "@/lib/types/Tournament";
import { formatDuration } from "@/lib/tournament-timer";

/**
 * Ce qu'un joueur demande à son assistant pendant un tournoi : où il joue,
 * contre qui, où il en est au classement, et combien de rondes restent.
 *
 * Le texte est assemblé ici, sans base de données, à partir de ce que l'outil
 * MCP a lu : les mêmes lectures que le portail joueur (phase affichée, dernière
 * ronde, classement d'ensemble), pour que l'assistant dise la même chose que
 * l'écran du joueur.
 */

export type StandingRow = Pick<
    TournamentRoundStanding,
    "playerId" | "matchPoints" | "wins" | "losses" | "draws" | "puzzleTimeSeconds"
>;

export type TournamentStatusInput = {
    tournament: Pick<Tournament, "name" | "status" | "timer">;
    phases: TournamentPhase[];
    /** Phase affichée (active, sinon la dernière déclarée). */
    activePhase: TournamentPhase | null;
    /** Ronde courante de la phase affichée. */
    currentRound: TournamentRound | null;
    /** Matchs de la ronde courante. */
    roundMatches: TournamentMatch[];
    players: TournamentPlayer[];
    /** Classement d'ensemble, du premier au dernier. */
    standings: StandingRow[];
    /** Le joueur de l'utilisateur, absent s'il n'est pas inscrit (staff). */
    me: TournamentPlayer | null;
    /** Table attribuée au joueur en phase contre la montre. */
    puzzleSeat?: Pick<TournamentPuzzleSeat, "tableNumber"> | null;
    now?: Date;
};

const TOURNAMENT_STATUS_LABELS: Record<string, string> = {
    "draft": "pas encore commencé",
    "in-progress": "en cours",
    "completed": "terminé",
};

const PHASE_TYPE_LABELS: Record<string, string> = {
    "freeform": "format libre",
    "swiss": "rondes suisses",
    "elimination": "élimination",
    "bracket": "arbre à élimination directe",
    "time-race": "contre la montre",
};

const PHASE_STATUS_LABELS: Record<string, string> = {
    "not-started": "à venir",
    "in-progress": "en cours",
    "completed": "terminée",
};

const PLAYER_STATUS_LABELS: Record<string, string> = {
    "registered": "inscrit",
    "pre-registered": "pré-inscrit, en attente de confirmation par l'organisation",
    "dropped": "retiré du tournoi",
};

export function playerLabel(player: Pick<TournamentPlayer, "displayName" | "discriminator"> | undefined): string {
    if (!player) return "joueur inconnu";
    return player.discriminator ? `${player.displayName}#${player.discriminator}` : player.displayName;
}

function plural(count: number, word: string): string {
    return `${count} ${word}${count > 1 ? "s" : ""}`;
}

function ordinal(rank: number): string {
    return rank === 1 ? "1er" : `${rank}e`;
}

function record(row: StandingRow): string {
    return `${row.wins}V/${row.losses}D${row.draws ? `/${row.draws}N` : ""}`;
}

/** « 5 rondes prévues », ou ce qu'on peut en dire quand l'organisation n'a rien fixé. */
export function plannedRoundsLabel(phase: TournamentPhase): string {
    if (phase.plannedRounds) return `${plural(phase.plannedRounds, "ronde")} prévue${phase.plannedRounds > 1 ? "s" : ""}`;
    if (phase.type === "time-race") return "une épreuve chronométrée";
    // Un arbre se déduit de sa taille : 8 qualifiés, 3 rondes jusqu'à la finale.
    if (phase.type === "bracket" && phase.topCut && phase.topCut > 1) {
        const rounds = Math.ceil(Math.log2(phase.topCut));
        return `${plural(rounds, "ronde")} jusqu'à la finale`;
    }
    return "nombre de rondes non fixé par l'organisation";
}

/** Une ligne par phase, dans l'ordre du tournoi. */
export function describePhases(phases: TournamentPhase[]): string {
    if (phases.length === 0) return "Aucune phase déclarée pour l'instant.";
    return phases.map(phase => {
        const cut = phase.topCut ? `, top ${phase.topCut}` : "";
        return `- ${phase.name} (${PHASE_TYPE_LABELS[phase.type] ?? phase.type}${cut}) — ${plannedRoundsLabel(phase)}, ${PHASE_STATUS_LABELS[phase.status] ?? phase.status}`;
    }).join("\n");
}

/** « Ronde 3 sur 5 de la phase Suisse (en cours) ». */
export function describeRound(phase: TournamentPhase | null, round: TournamentRound | null): string {
    if (!phase) return "Aucune phase n'a commencé.";
    if (!round) return `Phase ${phase.name} : aucune ronde lancée pour l'instant (${plannedRoundsLabel(phase)}).`;
    const outOf = phase.plannedRounds ? ` sur ${phase.plannedRounds}` : "";
    const state = round.status === "completed" ? "terminée" : "en cours";
    return `Ronde ${round.number}${outOf} de la phase ${phase.name} (${state}).`;
}

function describeClock(input: TournamentStatusInput): string | null {
    const { tournament, currentRound, now = new Date() } = input;
    if (!currentRound || currentRound.status !== "in-progress") return null;
    // Une ronde asynchrone se joue sur un intervalle : c'est son échéance qui
    // compte, pas le minuteur de la salle.
    if (currentRound.deadlineAt) {
        return `Échéance de la ronde : ${currentRound.deadlineAt.toISOString()}.`;
    }
    const timer = tournament.timer;
    if (!timer) return null;
    if (timer.running && timer.endsAt) {
        const remaining = (timer.endsAt.getTime() - now.getTime()) / 1000;
        return remaining >= 0
            ? `Temps restant : ${formatDuration(remaining)}.`
            : `Temps écoulé depuis ${formatDuration(-remaining)} (tours supplémentaires).`;
    }
    if (timer.remainingSeconds !== undefined) {
        return `Minuteur en pause, ${formatDuration(timer.remainingSeconds)} restantes.`;
    }
    return null;
}

function describeMatchResult(match: TournamentMatch, myId: string): string {
    if (match.status === "disputed") return "résultat contesté, l'arbitrage doit trancher";
    if (match.status !== "completed") {
        return match.games.length > 0 || match.status === "in-progress" ? "en cours" : "à jouer";
    }
    if (match.resolution === "double-loss") return "double défaite";
    const mine = match.players.find(p => p.playerId === myId)?.score ?? 0;
    const theirs = Math.max(0, ...match.players.filter(p => p.playerId !== myId).map(p => p.score));
    const score = match.games.length > 0 ? ` ${mine}-${theirs}` : "";
    const forfeit = match.resolution === "forfeit" ? " par forfait" : "";
    if (match.winnerIds.length === 0) return `match nul${score}`;
    return match.winnerIds.includes(myId) ? `victoire${forfeit}${score}` : `défaite${forfeit}${score}`;
}

function describeMyMatch(input: TournamentStatusInput, me: TournamentPlayer): string {
    const { activePhase, currentRound, roundMatches, players, standings, puzzleSeat } = input;
    if (!currentRound) return "Pas encore de table : aucune ronde n'est lancée.";

    if (activePhase?.type === "time-race") {
        return puzzleSeat
            ? `Épreuve contre la montre, sans adversaire. Votre table : ${puzzleSeat.tableNumber}.`
            : "Épreuve contre la montre, sans adversaire. L'organisation ne vous a pas encore attribué de table.";
    }

    const match = roundMatches.find(m => m.players.some(p => p.playerId === me.id));
    if (!match) {
        return me.status === "dropped"
            ? "Vous n'avez pas de match cette ronde (retiré du tournoi)."
            : "Vous n'avez pas de match dans cette ronde.";
    }

    const opponents = match.players.filter(p => p.playerId !== me.id);
    if (opponents.length === 0) {
        return "Vous avez un BYE cette ronde : pas d'adversaire, la victoire vous est accordée.";
    }

    const playersById = new Map(players.map(p => [p.id, p]));
    const rankById = new Map(standings.map((row, index) => [row.playerId, { row, rank: index + 1 }]));
    const opponentsText = opponents.map(opponent => {
        const standing = rankById.get(opponent.playerId);
        const detail = standing
            ? ` (${ordinal(standing.rank)}, ${plural(standing.row.matchPoints, "pt")}, ${record(standing.row)})`
            : "";
        return `${playerLabel(playersById.get(opponent.playerId))}${detail}`;
    }).join(", ");

    const table = match.tableNumber !== undefined ? `Table ${match.tableNumber}` : "Table non attribuée";
    const against = opponents.length > 1 ? "Adversaires" : "Adversaire";
    return `${table}. ${against} : ${opponentsText}. Match : ${describeMatchResult(match, me.id)}.`;
}

function describeMyStanding(input: TournamentStatusInput, me: TournamentPlayer): string {
    const { standings } = input;
    const index = standings.findIndex(row => row.playerId === me.id);
    if (index < 0) return "Vous n'apparaissez pas encore au classement.";
    const row = standings[index];
    const time = row.puzzleTimeSeconds !== undefined ? `, temps cumulé ${formatDuration(row.puzzleTimeSeconds)}` : "";
    return `Classement : ${ordinal(index + 1)} sur ${standings.length}, ${plural(row.matchPoints, "point")} (${record(row)})${time}.`;
}

/** Le texte complet renvoyé par `get_my_tournament_status`. */
export function describeTournamentStatus(input: TournamentStatusInput): string {
    const { tournament, phases, activePhase, currentRound, me } = input;
    const lines: string[] = [
        `**${tournament.name}** — ${TOURNAMENT_STATUS_LABELS[tournament.status] ?? tournament.status}`,
        describeRound(activePhase, currentRound),
    ];
    const clock = describeClock(input);
    if (clock) lines.push(clock);

    if (me) {
        lines.push("", `Vous jouez sous le nom ${playerLabel(me)} (${PLAYER_STATUS_LABELS[me.status] ?? me.status}).`);
        lines.push(describeMyMatch(input, me));
        lines.push(describeMyStanding(input, me));
    } else {
        lines.push("", "Vous n'êtes pas inscrit comme joueur à ce tournoi (accès en tant qu'organisation).");
    }

    lines.push("", `Phases :\n${describePhases(phases)}`);
    return lines.join("\n");
}

// --- Côté organisation ---

function matchState(match: TournamentMatch, playersById: Map<string, TournamentPlayer>): string {
    if (match.players.length === 1) return "BYE";
    if (match.status === "disputed") return "contesté";
    if (match.status === "pending") return "à jouer";
    if (match.status === "in-progress") {
        return match.reportedBy ? "rapporté, en attente de confirmation" : "en cours";
    }
    if (match.resolution === "double-loss") return "double défaite";
    const forfeit = match.resolution === "forfeit" ? " par forfait" : "";
    if (match.winnerIds.length === 0) return `nul${forfeit}`;
    const winners = match.winnerIds.map(id => playerLabel(playersById.get(id))).join(" et ");
    const score = match.games.length > 0
        ? ` (${[...match.players].sort((a, b) => b.score - a.score).map(p => p.score).join("-")})`
        : "";
    return `victoire de ${winners}${forfeit}${score}`;
}

/**
 * Les tables d'une ronde, dans l'ordre de la salle, et ce qui reste à rentrer :
 * ce qu'un organisateur regarde avant de lancer la suite.
 */
export function describeRoundMatches(
    phase: TournamentPhase | null,
    round: TournamentRound,
    matches: TournamentMatch[],
    players: TournamentPlayer[],
): string {
    const playersById = new Map(players.map(p => [p.id, p]));
    const sorted = [...matches].sort(
        (a, b) => (a.tableNumber ?? Number.MAX_SAFE_INTEGER) - (b.tableNumber ?? Number.MAX_SAFE_INTEGER)
    );
    const lines = sorted.map(match => {
        const table = match.tableNumber !== undefined ? `Table ${match.tableNumber}` : "Sans table";
        const names = match.players.map(p => playerLabel(playersById.get(p.playerId))).join(" vs ");
        return `- ${table} : ${names} — ${matchState(match, playersById)} (match ${match.id})`;
    });
    const done = matches.filter(m => m.status === "completed").length;
    const disputed = matches.filter(m => m.status === "disputed").length;
    const summary = matches.length === 0
        ? "Aucun match dans cette ronde."
        : `Résultats rentrés : ${done}/${matches.length}${disputed ? `, ${plural(disputed, "match")} contesté${disputed > 1 ? "s" : ""}` : ""}.`;
    return [describeRound(phase, round), summary, ...lines].join("\n");
}

export type PlayerLookup = { player: TournamentPlayer } | { error: string };

/**
 * Retrouve un joueur comme l'organisation le nomme : son id, « Pseudo#1234 »,
 * ou son pseudo seul s'il n'a pas d'homonyme. Un pseudo partagé n'est jamais
 * tranché au hasard : on liste les candidats.
 */
export function findTournamentPlayer(players: TournamentPlayer[], reference: string): PlayerLookup {
    const ref = reference.trim();
    const byId = players.find(p => p.id === ref);
    if (byId) return { player: byId };

    const [name, discriminator] = ref.split("#");
    const sameName = players.filter(p => p.displayName.toLowerCase() === name.trim().toLowerCase());
    const candidates = discriminator
        ? sameName.filter(p => p.discriminator === discriminator.trim())
        : sameName;
    if (candidates.length === 1) return { player: candidates[0] };
    if (candidates.length > 1) {
        return { error: `Plusieurs joueurs s'appellent « ${name} » : ${candidates.map(p => `${playerLabel(p)} (ID: ${p.id})`).join(", ")}. Précisez le discriminant ou l'id.` };
    }
    return { error: `Aucun joueur « ${ref} » dans ce tournoi.` };
}
