import "server-only";

import { resolveCardIdsByName } from "@/lib/db/deck-cards";
import { saveMetaEventMatches } from "@/lib/db/meta-events";
import { playableDomains } from "@/lib/decks/domains";
import { normalizeCardName } from "@/lib/decks/text";
import { fetchLocatorEvent, fetchLocatorMatches, fetchLocatorStandings } from "@/lib/meta/locator-api";
import type { MetaEventMatch, MetaEventPlayer } from "@/lib/meta/match-stats";
import type { Game } from "@/lib/types/Game";

export type LocatorMatchesImport = {
  game: Game;
  eventId: number;
  /** Le nom du tournoi dans Joutes : celui de ses decks méta. */
  source: string;
  eventDate: Date;
  userId: string;
};

/**
 * Lit les joueurs et les matchs d'un tournoi du locator et les enregistre,
 * en remplaçant ceux d'un import précédent.
 *
 * Tous les joueurs comptent, pas seulement ceux dont le deck est importé : la
 * légende de chacun vient du classement des rondes (ou, à défaut, de ses
 * matchs) et se rapproche du catalogue pour son image et ses domaines.
 */
export async function importLocatorMatches(request: LocatorMatchesImport): Promise<{ players: number; matches: number }> {
  const event = await fetchLocatorEvent(request.eventId);
  const [standings, parsed] = await Promise.all([fetchLocatorStandings(event), fetchLocatorMatches(event)]);

  // Une légende absente du classement (joueur parti tôt) se lit sur ses matchs.
  const legendFromMatches = new Map<number, string>();
  for (const match of parsed) {
    if (match.legends[0]) legendFromMatches.set(match.a, match.legends[0]);
    if (match.b !== undefined && match.legends[1]) legendFromMatches.set(match.b, match.legends[1]);
  }

  const rawPlayers = standings
    .filter((standing) => standing.registrationId !== undefined)
    .map((standing) => ({
      ...standing,
      legend: standing.legend ?? legendFromMatches.get(standing.registrationId as number),
    }));

  const legendNames = [...new Set(rawPlayers.flatMap((player) => (player.legend ? [player.legend] : [])))];
  const cards = await resolveCardIdsByName(request.game.id, legendNames);

  const players: MetaEventPlayer[] = rawPlayers.map((player) => {
    const card = player.legend ? cards.get(normalizeCardName(player.legend)) : undefined;
    return {
      id: player.registrationId as number,
      name: player.player,
      ...(player.place !== undefined ? { place: player.place } : {}),
      record: player.record,
      ...(player.legend ? { legend: card?.name ?? player.legend } : {}),
      ...(card ? { legendCardId: card.id } : {}),
      ...(card?.image ? { legendImage: card.image } : {}),
      domains: playableDomains(card?.domain),
    };
  });

  const matches: MetaEventMatch[] = parsed.map(({ legends: _legends, ...match }) => match);

  await saveMetaEventMatches({
    gameId: request.game.id,
    eventRef: `locator:${event.id}`,
    source: request.source,
    eventDate: request.eventDate,
    url: event.url,
    importedBy: request.userId,
    players,
    matches,
  });

  return { players: players.length, matches: matches.filter((match) => match.b !== undefined).length };
}
