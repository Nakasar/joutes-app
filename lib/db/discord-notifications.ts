import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";

/**
 * Les lectures et écritures des messages privés Discord.
 *
 * Le lien entre un compte Joutes et un compte Discord vit dans la collection
 * `account` de Better Auth (`providerId: "discord"`, `accountId` = identifiant
 * Discord) — c'est déjà là que le bot le cherche pour l'inscription en un clic.
 */

/** L'identifiant Discord lié à un compte Joutes, ou `null`. */
export async function findDiscordAccountId(userId: string): Promise<string | null> {
  if (!ObjectId.isValid(userId)) return null;

  const account = await db.collection<{ userId: ObjectId; accountId: string }>("account").findOne(
    { providerId: "discord", userId: new ObjectId(userId) },
    { projection: { accountId: 1 } }
  );

  return account?.accountId ?? null;
}

/** Le compte Joutes lié à un identifiant Discord, ou `null`. */
export async function findUserIdByDiscordId(discordUserId: string): Promise<string | null> {
  const account = await db.collection<{ userId: ObjectId }>("account").findOne(
    { providerId: "discord", accountId: discordUserId },
    { projection: { userId: 1 } }
  );

  return account?.userId?.toString() ?? null;
}

export type DiscordRecipient = { userId: string; discordId: string };

/**
 * Parmi une audience, ceux qui ont demandé les messages privés **et** ont un
 * compte Discord lié. Deux requêtes, quelle que soit la taille de l'audience :
 * les comptes qui ont activé le réglage, puis leurs liaisons.
 */
export async function listDiscordRecipients(userIds: string[]): Promise<DiscordRecipient[]> {
  const ids = userIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  if (ids.length === 0) return [];

  const optedIn = await db
    .collection("user")
    .find({ _id: { $in: ids }, "notifications.discord.dm.enabled": true }, { projection: { _id: 1 } })
    .toArray();
  if (optedIn.length === 0) return [];

  const accounts = await db
    .collection<{ userId: ObjectId; accountId: string }>("account")
    .find(
      { providerId: "discord", userId: { $in: optedIn.map((doc) => doc._id) } },
      { projection: { userId: 1, accountId: 1 } }
    )
    .toArray();

  return accounts.map((account) => ({ userId: account.userId.toString(), discordId: account.accountId }));
}

/** Pose le réglage des messages privés Discord d'un compte. */
export async function setDiscordDmEnabled(userId: string, enabled: boolean): Promise<void> {
  await db
    .collection("user")
    .updateOne({ _id: new ObjectId(userId) }, { $set: { "notifications.discord.dm.enabled": enabled } });
}
