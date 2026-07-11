import db from "@/lib/mongodb";

async function main() {
  const setCode = 'ASHP';

  const cursorBoosters = db.collection('booster-cards').find({
    setCode: setCode,
  });

  while (await cursorBoosters.hasNext()) {
    const card = await cursorBoosters.next();
    if (!card) continue;

    await db.collection('booster-cards').updateOne({
      _id: card._id,
    }, {
      $set: { cardId: `${card.setCode}-${card.collectorNumber}` },
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
      $set: { cardId: `${card.setCode}-${card.collectorNumber}` },
    });
  }
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});