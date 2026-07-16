'use server';

import db from '@/lib/mongodb';
import {Errata} from "@/lib/types/errata";
import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import {generateText} from "ai";
import {openai} from "@ai-sdk/openai";
import {cardIdFromPiltoverFormat, parseDeckList} from "@/app/games/riftbound/deck-checker/utils";
import {getDeckFromCode} from "@piltoverarchive/riftbound-deck-codes";
import {ObjectId} from "mongodb";
import {BoosterCard} from "@/lib/types/booster";

export type DeckListCard = {
  name: string;
  quantity: number;
  cardId?: string;
  image?: string;
  banned?: boolean;
  recognized?: boolean;
  erratas?: Errata[];
};

export type DeckList = {
  champions: DeckListCard[];
  legends: DeckListCard[];
  maindeck: DeckListCard[];
  sideboard: DeckListCard[];
  battlefields: DeckListCard[];
  runes: DeckListCard[];
};

export async function validateDeckList(decklist: DeckList): Promise<DeckList> {
  const allSections = Object.keys(decklist) as (keyof DeckList)[];

  type CardWithSection = DeckListCard & { section: keyof DeckList };
  const allCards: CardWithSection[] = allSections.flatMap((section) =>
    decklist[section].map((card) => ({...card, section}))
  );

  // Collect unique card names to fetch in a single MongoDB query
  const uniqueNames = [...new Set(allCards.map((c) => c.name))];

  const cardsFromDb =
    uniqueNames.length > 0
      ? await db
        .collection<{ id: string; name: string; image?: string; banned?: boolean; erratas?: Errata[] }>('cards')
        .aggregate([
          {
            $match: {name: {$in: uniqueNames}, lang: 'en'},
          },
          {
            $lookup: {
              from: 'erratas',
              localField: 'id',
              foreignField: 'cardIds',
              as: 'erratas',
              pipeline: [
                {
                  $addFields: {
                    id: {$toString: '$_id'},
                  },
                },
                {
                  $project: {
                    _id: 0,
                    createdBy: 0,
                  },
                },
              ],
            },
          },
          {
            $project: {
              id: 1,
              name: 1,
              image: 1,
              banned: 1,
              erratas: 1,
            },
          },
        ], {collation: {locale: 'en', strength: 2}})
        .toArray()
      : [];


  // Map by lowercase card name for case-insensitive O(1) lookup
  const cardMap = new Map(cardsFromDb.sort((a, b) => a.erratas.length - b.erratas.length).map((c) => [c.name.toLowerCase(), c]));

  // Rebuild DeckList with enriched data
  const result: DeckList = {
    champions: [],
    legends: [],
    maindeck: [],
    sideboard: [],
    battlefields: [],
    runes: [],
  };

  for (const card of allCards) {
    const cardDb = cardMap.get(card.name.toLowerCase());
    result[card.section].push({
      name: card.name,
      quantity: card.quantity,
      cardId: cardDb?.id,
      image: cardDb?.image,
      banned: cardDb?.banned ?? false,
      recognized: !!cardDb,
      erratas: cardDb?.erratas ?? [],
    });
  }

  return result;
}

export async function getDeckFromPiltover(deckId: string): Promise<DeckList> {
  const res = await fetch(`https://piltoverarchive.com/api/external/v1/decks/${deckId}/price`);
  if (!res.ok) {
    throw new Error('Failed to get deck list.');
  }
  const data = await res.json() as {
    breakdown: { champions: {cardName:string;quantity:number}[]; legend: {cardName:string;quantity:number}[]; maindeck: {cardName:string;quantity:number}[]; sideboard: {cardName:string;quantity:number}[]; battlefields: {cardName:string;quantity:number}[]; runes: {cardName:string;quantity:number}[]; };
  };

  const parsed = {
    champions:   data.breakdown.champions.map(c => ({name: c.cardName, quantity: c.quantity})),
    legends:     data.breakdown.legend.map(c => ({name: c.cardName, quantity: c.quantity})),
    maindeck:    data.breakdown.maindeck.map(c => ({name: c.cardName, quantity: c.quantity})),
    sideboard:   data.breakdown.sideboard.map(c => ({name: c.cardName, quantity: c.quantity})),
    battlefields:data.breakdown.battlefields.map(c => ({name: c.cardName, quantity: c.quantity})),
    runes:       data.breakdown.runes.map(c => ({name: c.cardName, quantity: c.quantity})),
  };

  return parsed;
}

export async function getDeckFromPiltoverCode(code: string): Promise<DeckList> {
  const deck = getDeckFromCode(code);

  const result: DeckList = {
    champions: [],
    legends: [],
    maindeck: [],
    sideboard: [],
    battlefields: [],
    runes: [],
  };

  const cardIdsToSearch: string[] = [
    deck.chosenChampion,
    ...deck.sideboard.map(c => c.cardCode),
    ...deck.mainDeck.map(c => c.cardCode),
  ].filter((c) : c is string => !!(c?.length && c.length > 2));

  // safeguard, max 100 cards.
  const uniques = new Set(cardIdsToSearch);
  if (uniques.size === 0 || uniques.size >= 100) {
    throw new Error('Failed to get deck list. Too many uniques cards.');
  }

  const uniqueIds = [...uniques.keys()].map(id => cardIdFromPiltoverFormat(id));

  console.log(uniqueIds);

  const cards = await db.collection<{ id: string; name: string; type: string }>('cards').find({
    id: {
      $in: uniqueIds,
    },
    gameId: new ObjectId('69009afea722eab4fa0e55c4'),
  }, { projection: { id: 1, name: 1, type: 1 } }).toArray();

  if (deck.chosenChampion) {
    const card = cards.find(c => c.id === cardIdFromPiltoverFormat(deck.chosenChampion!))

    if (card) {
      result.champions.push({
        cardId: card.id,
        name: card.name,
        quantity: 1,
      })
    }
  }

  if (deck.sideboard.length > 0) {
    const sideboard = deck.sideboard.map((c): DeckListCard => {
      const card = cards.find(candidate => candidate.id === cardIdFromPiltoverFormat(c.cardCode));

      return {
        cardId: card?.id ?? cardIdFromPiltoverFormat(c.cardCode),
        name: card?.name ?? c.cardCode,
        quantity: c.count,
      };
    });

    result.sideboard.push(...sideboard);
  }

  for (const sourceCard of deck.mainDeck) {
    const cardId = cardIdFromPiltoverFormat(sourceCard.cardCode);
    const card = cards.find(candidate => candidate.id === cardId);

    if (!card) {
      result.maindeck.push({
        cardId,
        name: sourceCard.cardCode,
        quantity: sourceCard.count,
      })
    } else {
      if (card.type === 'Runes') {
        result.runes.push({
          cardId,
          name: card.name,
          quantity: sourceCard.count,
        });
      } else if (card.type === 'Battlefields') {
        result.battlefields.push({
          cardId,
          name: card.name,
          quantity: sourceCard.count,
        });
      } else if (card.type === 'Legend') {
        result.legends.push({
          cardId,
          name: card.name,
          quantity: sourceCard.count,
        });
      } else {
        result.maindeck.push({
          cardId,
          name: card.name,
          quantity: sourceCard.count,
        })
      }
    }
  }

  return result;
}

export async function analyzeDeckListImageBase64Action(imageBase64: string): Promise<{ raw: string; deckList: DeckList }> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session?.user.email !== process.env.ADMIN_EMAIL) {
    throw new Error('Unauthorized');
  }

  // Extraire les cartes de la photo avec OpenAI Vision
  const { text } = await generateText({
    model: openai("gpt-4o"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract all card names from this Riftbound deck photo. Return ONLY a list of card names, one per line, without any additional text, formatting, or numbering. If the card is in the photo multiple times, list it multiple times, one per line. If the image has a quantity next to the card name, prefix the card name with this quantity.\nGroup cards by deck section if indicated, writing the name of the section above the cards of this section. Available deck sections are: Legends, Champions, Runes, Maindeck, Sideboard.\nNote : cards with the indication 'Choosen Champion' must be put in the Champions section.'",
          },
          {
            type: "image",
            image: imageBase64,
          },
        ],
      },
    ],
  });
  const trimmed = text.replaceAll('```', '').trim();

  // Parser les listes
  const deckList = parseDeckList(trimmed);

  return {
    raw: trimmed,
    deckList: deckList,
  };
}

export async function analyzeDeckListImageURLAction(url: string): Promise<{ raw: string; deckList: DeckList }> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session?.user.email !== process.env.ADMIN_EMAIL) {
    throw new Error('Unauthorized');
  }

  if (!url.startsWith('https://uiez8a3cxaj4q4wl.public.blob.vercel-storage.com/deck-images/')) {
    throw new Error('Unauthorized');
  }

  // Extraire les cartes de la photo avec OpenAI Vision
  const { text } = await generateText({
    model: openai("gpt-4o"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract all card names from this Riftbound deck photo. Return ONLY a list of card names, one per line, without any additional text, formatting, or numbering. If the card is in the photo multiple times, list it multiple times, one per line. If the image has a quantity next to the card name, prefix the card name with this quantity.\nGroup cards by deck section if indicated, writing the name of the section above the cards of this section. Available deck sections are: Legends, Champions, Runes, Maindeck, Sideboard.\nNote : cards with the indication 'Choosen Champion' must be put in the Champions section.'",
          },
          {
            type: "image",
            image: url,
          },
        ],
      },
    ],
  });
  const trimmed = text.replaceAll('```', '').trim();

  // Parser les listes
  const deckList = parseDeckList(trimmed);

  return {
    raw: trimmed,
    deckList: deckList,
  };
}
