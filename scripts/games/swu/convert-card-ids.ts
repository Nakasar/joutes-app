import db from "@/lib/mongodb";
import {ObjectId} from "mongodb";

/*
  Created to migrate existing SWU cards whose IDS where numerical to strings.
  This is a temporary measure, SWU cards will be imported using their standard format ID <SET><CN> next time.
 */

async function main() {

  const cursor = db.collection('cards').find({
    gameId: new ObjectId('68f108675fdfb9c53ba3387d'),
  });

  while (await cursor.hasNext()) {
    const card = await cursor.next();
    if (!card) continue;

    await db.collection('cards').updateOne({
      _id: card._id,
    }, {
      $set: { id: `${card.id}` },
    });
  }
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});