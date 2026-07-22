import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import db from "@/lib/mongodb";
import {ObjectId} from "mongodb";

async function fetchCardsFromWebsite(): Promise<{ publicCode: string; name: string; text?: { label: string; richText: { type: string; body: string } }; cardType: { label: string; type: { id: string; label: string }[]} }[]> {
  const res = await fetch('https://riftbound.leagueoflegends.com/en-us/card-gallery/#card-gallery--unl-132-219');

  const html = await res.text();

  const propsRegex = /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/;
  const match = html.match(propsRegex);

  if (match) {
    const json = match[1];

    const data = JSON.parse(json);

    const cards = data.props.pageProps.page.blades[2].cards.items;

    await writeFile(path.join(__dirname, 'cards.json'), JSON.stringify(cards));

    return cards;
  }

  throw new Error("No cards found on website.");
}

async function getCardsFromJson(): Promise<{ publicCode: string; name: string; text?: { label: string; richText: { type: string; body: string } }; cardType: { label: string; type: { id: string; label: string }[]} }[]> {
  const cards = readFile(path.join(__dirname, 'cards.json'), 'utf-8');

  return JSON.parse(await cards);
}

async function main() {
  const cardsRaw = await fetchCardsFromWebsite();

  const cards = cardsRaw.map(card => {
    const codeRegex = /(?<set>[A-Z]{3})-(?<cn>[A-Z0-9]{3}[a*]?)(?:\/[0-9]{3})?/;

    const match = card.publicCode.match(codeRegex);

    if (!match) {
      throw new Error(`Invalid card code: ${card.publicCode}`);
    }

    return {
      id: `${match.groups?.set}${match.groups?.cn}`,
      name: card.name,
      type: card.cardType.type[0].label,
      text: card.text?.richText.body.replaceAll('<p>', '').replaceAll('</p>', '').replaceAll('<br />', '\n'),
    };
  });

  for (const card of cards) {
    await db.collection('cards').updateOne({
      id: card.id,
      gameId: new ObjectId('69009afea722eab4fa0e55c4'),
    }, {
      $set: { text: card.text },
    });
  }
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});