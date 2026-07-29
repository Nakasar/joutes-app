import 'server-only';

import { getGameBySlugOrId } from "@/lib/db/games";
import type {
  TournamentDecklistCard,
  TournamentFormDecklistAnswer,
  TournamentParsedDecklist,
} from "@/lib/types/Tournament";
import {
  getDeckFromPiltover,
  getDeckFromPiltoverCode,
  validateDeckList,
  type DeckList,
} from "@/app/games/riftbound/deck-checker/action";
import { parseDeckList } from "@/app/games/riftbound/deck-checker/utils";

// Jeux dont une liste de deck peut être analysée. Ailleurs la saisie du joueur
// est conservée telle quelle : mieux vaut une liste brute lisible qu'une
// analyse inventée.
const PARSABLE_GAME_SLUGS = new Set(["riftbound"]);

const PILTOVER_DECK_URL = "https://piltoverarchive.com/decks/view/";

// Ordre d'affichage des sections : la même liste se lit pareil d'une fiche à
// l'autre, quel que soit l'ordre dans lequel le joueur les a saisies.
const SECTION_ORDER: (keyof DeckList)[] = [
  "legends",
  "champions",
  "maindeck",
  "runes",
  "battlefields",
  "sideboard",
];

/**
 * Le jeu du tournoi sait-il analyser une liste de deck ? Sert à adapter la
 * saisie côté joueur (formats acceptés) sans dupliquer la liste des jeux.
 */
export async function gameSupportsDecklistParsing(gameId?: string): Promise<boolean> {
  const slug = await resolveGameSlug(gameId);
  return supportsDecklistParsing(slug);
}

export type FormGameContext = {
  // Slug du jeu, nécessaire à la recherche de cartes côté client.
  gameSlug: string | null;
  decklistSupported: boolean;
};

/**
 * Les deux informations que le formulaire tire du jeu du tournoi, en une seule
 * lecture : elles sortent de la même fiche de jeu, la chercher deux fois par
 * requête ne rapporte rien.
 */
export async function resolveFormGameContext(gameId?: string): Promise<FormGameContext> {
  const gameSlug = await resolveGameSlug(gameId);
  return { gameSlug, decklistSupported: supportsDecklistParsing(gameSlug) };
}

function supportsDecklistParsing(slug: string | null): boolean {
  return slug !== null && PARSABLE_GAME_SLUGS.has(slug);
}

/**
 * Slug du jeu du tournoi, ou null s'il n'en a pas. Le tournoi porte un id
 * Mongo, mais un slug est également accepté (mêmes entrées que le reste de
 * l'application).
 */
export async function resolveGameSlug(gameId?: string): Promise<string | null> {
  if (!gameId) return null;
  const game = await getGameBySlugOrId(gameId);
  return game?.slug ?? null;
}

/**
 * Analyse la saisie d'un joueur pour un champ « decklist ».
 *
 * Trois formats sont acceptés, distingués comme le fait déjà le vérificateur
 * de deck : un lien Piltover Archive, un code de deck (un seul mot), ou une
 * liste écrite en clair. L'analyse est faite ici, jamais reprise du client :
 * c'est elle qui sert à l'arbitrage.
 *
 * Un échec n'est pas une erreur de saisie : la liste brute est conservée et
 * le motif est mémorisé, à charge de l'arbitrage de trancher.
 */
export async function parseDecklistAnswer(
  gameId: string | undefined,
  input: string
): Promise<TournamentFormDecklistAnswer> {
  const trimmed = input.trim();
  const answer: TournamentFormDecklistAnswer = { input: trimmed };
  if (!trimmed) return answer;

  const slug = await resolveGameSlug(gameId);
  if (!slug || !PARSABLE_GAME_SLUGS.has(slug)) {
    return answer;
  }

  try {
    let deck: DeckList;
    if (trimmed.startsWith(PILTOVER_DECK_URL)) {
      const deckId = trimmed.slice(PILTOVER_DECK_URL.length).split(/[/?#]/)[0];
      if (!deckId) throw new Error("Lien de deck incomplet");
      deck = await getDeckFromPiltover(deckId);
    } else if (!/\s/.test(trimmed)) {
      deck = await getDeckFromPiltoverCode(trimmed);
    } else {
      deck = parseDeckList(trimmed);
    }

    return {
      ...answer,
      parsed: toParsedDecklist(await validateDeckList(deck)),
      parsedAt: new Date(),
    };
  } catch (error) {
    console.warn("Analyse de liste de deck impossible:", error);
    return {
      ...answer,
      parseError: error instanceof Error ? error.message : "Analyse impossible",
      parsedAt: new Date(),
    };
  }
}

function toParsedDecklist(deck: DeckList): TournamentParsedDecklist {
  const sections = SECTION_ORDER.flatMap((key) => {
    const cards: TournamentDecklistCard[] = deck[key].map((card) => ({
      name: card.name,
      quantity: card.quantity,
      cardId: card.cardId,
      image: card.image,
      recognized: card.recognized ?? false,
      banned: card.banned ?? false,
    }));
    return cards.length > 0 ? [{ key, cards }] : [];
  });

  const allCards = sections.flatMap((section) => section.cards);

  return {
    sections,
    totalCards: allCards.reduce((sum, card) => sum + card.quantity, 0),
    unrecognizedCards: allCards.filter((card) => !card.recognized).length,
    bannedCards: allCards.filter((card) => card.banned).length,
  };
}
