import db from "../../../lib/mongodb.ts";
import {ObjectId} from "mongodb";

async function main() {
  const cardsCursor = db.collection('cards').find({
    gameId: new ObjectId("69009afea722eab4fa0e55c4"),
  });

  while (await cardsCursor.hasNext()) {
    const card = await cardsCursor.next();
    if (!card) continue;

    await db.collection('cards').updateOne({
      _id: card._id,
    }, {
      $set: { id: `${card.setCode}${card.collectorNumber}` },
    });
  }

  const setCode = "OGN";

  const cursorBoosters = db.collection('booster-cards').find({
    setCode: setCode,
  });

  while (await cursorBoosters.hasNext()) {
    const card = await cursorBoosters.next();
    if (!card) continue;

    await db.collection('booster-cards').updateOne({
      _id: card._id,
    }, {
      $set: { cardId: `${card.setCode}${card.collectorNumber}` },
    });
  }

  const cursorCollection = db.collection('collection-cards').find({
    setCode: setCode,
  });

  while (await cursorCollection.hasNext()) {
    const card = await cursorCollection.next();
    if (!card) continue;

    await db.collection('collection-cards').updateOne({
      _id: card._id,
    }, {
      $set: { cardId: `${card.setCode}${card.collectorNumber}` },
    });
  }
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});