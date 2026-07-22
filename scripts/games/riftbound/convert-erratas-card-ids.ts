import db from "../../../lib/mongodb.ts";

async function main() {
  const erratasCursor = db.collection('erratas').find({});

  while (await erratasCursor.hasNext()) {
    const errata = await erratasCursor.next();
    if (!errata) continue;

    if (errata.cardId?.startsWith("origins-")) {
      const cn = errata.cardId?.substring("origins-".length, errata.cardId.length - 3);

      await db.collection('erratas').updateOne({
        _id: errata._id,
      }, {
        $set: {
          cardId: null,
          cardIds: [`OGN${cn}`],
        },
      });
    }
  }
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});