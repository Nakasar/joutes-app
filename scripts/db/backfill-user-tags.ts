/**
 * Donne son tag (pseudo#1234) à chaque compte qui n'en a pas : `npm run users:tags`.
 *
 * Jusqu'au 2026-11-13, un compte créé par Discord ou par code e-mail n'en
 * recevait aucun (voir lib/users/tag.ts). Le pseudonyme déjà choisi est gardé ;
 * sinon il est tiré du nom du compte (celui de Discord), de la partie locale de
 * l'adresse, ou du hasard. Le discriminateur est libre pour ce pseudonyme.
 *
 *   npm run users:tags -- --dry-run   liste ce qui serait posé, sans rien écrire
 *
 * Idempotent : un compte déjà tagué n'est pas relu une seconde fois. La base
 * visée est celle de `MONGODB_URI`, lue dans l'environnement ou dans
 * `.env.local` / `.env`. Les comptes se connectant d'ici là reçoivent leur tag
 * d'eux-mêmes (lib/auth.ts).
 */

import db from "../../lib/mongodb.ts";
import { assignMissingTag } from "../../lib/users/assign-tag.ts";
import { deriveDisplayName } from "../../lib/users/tag.ts";

const dryRun = process.argv.includes("--dry-run");

type UserDoc = { name?: string; email?: string; displayName?: string | null; discriminator?: string | null };

async function main() {
  const users = db.collection("user");
  const cursor = db.collection<UserDoc>("user").find(
    {
      $or: [
        { discriminator: { $in: [null, ""] } },
        { displayName: { $in: [null, ""] } },
      ],
    },
    { projection: { name: 1, email: 1, displayName: 1, discriminator: 1 } }
  );

  let seen = 0;
  let tagged = 0;
  for await (const user of cursor) {
    seen += 1;
    const id = user._id.toString();
    if (dryRun) {
      const displayName = user.displayName || deriveDisplayName(user);
      if (seen <= 20) console.log(`${id} : ${user.name || "—"} → ${displayName}#????`);
      continue;
    }
    const tag = await assignMissingTag(users, id);
    if (!tag) continue;
    tagged += 1;
    if (tagged <= 20) console.log(`${id} : ${user.name || "—"} → ${tag.displayName}#${tag.discriminator}`);
  }

  console.log(dryRun ? `${seen} compte(s) sans tag (rien écrit).` : `${seen} compte(s) sans tag, ${tagged} tagué(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
