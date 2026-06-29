// ── Parse a pasted deck list text into the DeckList structure ─────────────────
import {DeckList, DeckListCard} from "@/app/games/riftbound/deck-checker/action";
import { getCodeFromDeck } from "@piltoverarchive/riftbound-deck-codes";
import type { Deck, Card } from "@piltoverarchive/riftbound-deck-codes";

export function parseDeckList(text: string): DeckList {
  const result: DeckList = {
    champions: [],
    legends: [],
    maindeck: [],
    sideboard: [],
    battlefields: [],
    runes: [],
  };

  const map: Record<string, keyof DeckList> = {
    legend: 'legends',
    legends: 'legends',
    'légende': 'legends',
    'légendes': 'legends',
    champion: 'champions',
    champions: 'champions',
    maindeck: 'maindeck',
    "main deck": 'maindeck',
    deck: 'maindeck',
    main: 'maindeck',
    'main-deck': 'maindeck',
    sideboard: 'sideboard',
    side: 'sideboard',
    battlefield: 'battlefields',
    battlefields: 'battlefields',
    runes: 'runes',
  };

  let current: keyof DeckList = 'maindeck';

  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const headerMatch = line.match(/^([A-Za-z\u00C0-\u024F\u1E00-\u1EFF \-]+):?$/);
    if (headerMatch) {
      const key = headerMatch[1].trim().toLowerCase();
      if (map[key]) { current = map[key]; continue; }
    }

    const qtyMatch = line.match(/^\s*[xX\-*]*?(\d+)\s*x?\s+(.+)$/i);
    let qty = 1;
    let name = line;
    if (qtyMatch) {
      qty = parseInt(qtyMatch[1], 10);
      name = qtyMatch[2].trim();
    } else {
      const bulletMatch = line.replace(/^[-\u2022]\s*/, '');
      if (bulletMatch !== line) name = bulletMatch.trim();
    }

    const existingCard = result[current].find(c => c.name === name);
    if (existingCard) {
      existingCard.quantity += 1;
    } else {
      result[current].push({name, quantity: qty});
    }
  }

  return result;
}

// ── Stringify a DeckList back to raw text ──────────────────────────────────────
export function stringifyDeckList(deckList: DeckList): string {
  const sections: Array<{ label: string; key: keyof DeckList }> = [
    { label: 'Legend', key: 'legends' },
    { label: 'Champion', key: 'champions' },
    { label: 'MainDeck', key: 'maindeck' },
    { label: 'Sideboard', key: 'sideboard' },
    { label: 'Battlefields', key: 'battlefields' },
    { label: 'Runes', key: 'runes' },
  ];

  const parts: string[] = [];
  for (const { label, key } of sections) {
    const cards = deckList[key];
    if (cards.length === 0) continue;
    parts.push(`${label}:`);
    for (const card of cards) {
      parts.push(`${card.quantity} ${card.name}`);
    }
    parts.push('');
  }

  return parts.join('\n').trim();
}

export function cardIdToPiltoverFormat(cardId: string): string {
  // exception for legacy cards
  // @TODO: harmonize IDs
  if (cardId.startsWith('origins-')) {

    const codeRegex = /origins-(?<cn>[0-9]{3}[a-z*]?)[0-9]+/gi;
    const match = codeRegex.exec(cardId);
    if (!match) {
      return cardId;
    }
    return `OGN-${match[1]}`;
  }
  if (cardId.startsWith('ogs')) {
    const codeRegex = /ogs(?<cn>[0-9]{3}[a-z*]?)[0-9]+/gi;
    const match = codeRegex.exec(cardId);
    if (!match) {
      return cardId;
    }
    return `OGS-${match[1]}`
  }

  const codeRegex = /(?<set>[A-Z]{3})-?(?<cn>[A-Z0-9]{3}[a*]?)(?:\/[0-9]{3})?/;
  const match = codeRegex.exec(cardId);
  if (!match) {
    return cardId;
  }
  const set = match[1];
  const cn = match[2];
  return `${set}-${cn}`;
}

export function serializeDeckList(deckList: DeckList): string {
  return getCodeFromDeck([...deckList.maindeck, ...deckList.runes, ...deckList.legends].map((c: DeckListCard): Card => {
    if (!c.cardId) {
      throw new Error('Missing card ID');
    }

    return {
      cardCode: cardIdToPiltoverFormat(c.cardId),
      count: c.quantity,
    };
  }), deckList.sideboard.map((c: DeckListCard): Card => {
    if (!c.cardId) {
      throw new Error('Missing card ID');
    }

    return {
      cardCode: cardIdToPiltoverFormat(c.cardId),
      count: c.quantity,
    };
  }), deckList.champions[0]?.cardId ? cardIdToPiltoverFormat(deckList.champions[0].cardId) : undefined);
}