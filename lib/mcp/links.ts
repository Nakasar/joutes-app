import { joutesBaseUrl } from "@/lib/notifications/discord-message";

/**
 * Les pages où voir ce qu'un outil MCP vient de créer ou de modifier.
 *
 * Un outil qui écrit renvoie toujours l'adresse absolue de l'élément touché :
 * l'assistant peut la donner telle quelle, et l'utilisateur vérifie d'un clic
 * ce qui a été fait en son nom. Les chemins sont ceux de la langue par défaut
 * (sans préfixe), le site redirige ensuite selon la langue du visiteur.
 */

type Env = Record<string, string | undefined>;

export function joutesUrl(path: string, env: Env = process.env): string {
    return `${joutesBaseUrl(env).replace(/\/+$/, "")}${path}`;
}

const segment = encodeURIComponent;

export const mcpLinks = {
    event: (eventId: string, env?: Env) => joutesUrl(`/events/${segment(eventId)}`, env),
    lair: (lairId: string, env?: Env) => joutesUrl(`/lairs/${segment(lairId)}`, env),
    game: (gameSlugOrId: string, env?: Env) => joutesUrl(`/games/${segment(gameSlugOrId)}`, env),
    collection: (gameSlugOrId: string, playGroupId?: string, env?: Env) =>
        joutesUrl(
            playGroupId
                ? `/play-groups/${segment(playGroupId)}/collection/${segment(gameSlugOrId)}`
                : `/collection/${segment(gameSlugOrId)}`,
            env,
        ),
    wishlist: (wishlistId: string, env?: Env) => joutesUrl(`/wishlists/${segment(wishlistId)}`, env),
    playGroup: (playGroupId: string, env?: Env) => joutesUrl(`/play-groups/${segment(playGroupId)}`, env),
    tournament: (tournamentId: string, env?: Env) => joutesUrl(`/tournaments/${segment(tournamentId)}/organizer`, env),
    /** Le portail joueur : sa table, son adversaire, son classement. */
    tournamentPlayer: (tournamentId: string, env?: Env) => joutesUrl(`/tournaments/${segment(tournamentId)}/player`, env),
    tournamentRound: (tournamentId: string, roundId: string, env?: Env) =>
        joutesUrl(`/tournaments/${segment(tournamentId)}/organizer/rounds/${segment(roundId)}/matches`, env),
    tournamentPlayerSheet: (tournamentId: string, playerId: string, env?: Env) =>
        joutesUrl(`/tournaments/${segment(tournamentId)}/organizer/players/${segment(playerId)}`, env),
    tournamentLive: (tournamentId: string, env?: Env) => joutesUrl(`/tournaments/${segment(tournamentId)}/organizer/live`, env),
    tournamentPlayers: (tournamentId: string, env?: Env) =>
        joutesUrl(`/tournaments/${segment(tournamentId)}/organizer/players`, env),
    /**
     * Un errata n'a pas de page à lui : il s'affiche sur la fiche de chacune de
     * ses cartes. Le lien mène à la première, avec une ancre sur l'errata.
     */
    errata: (errataId: string, gameSlugOrId: string, cardId: string, env?: Env) =>
        joutesUrl(`/games/${segment(gameSlugOrId)}/cards/${segment(cardId)}#errata-${segment(errataId)}`, env),
};

/** La ligne ajoutée au texte de la réponse, à la manière de `check_deck`. */
export function linkLine(url: string): string {
    return `\n\nLien : ${url}`;
}
