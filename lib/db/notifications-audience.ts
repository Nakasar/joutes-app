import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { AudienceSource, LoadedAudience } from "@/lib/notifications/audience";
import { resolveAudience } from "@/lib/notifications/audience";

/**
 * Les lectures dont `lib/notifications/audience.ts` a besoin.
 *
 * Séparées du module pur pour la raison habituelle : `lib/mongodb.ts` ouvre une
 * connexion à l'import, et c'est la correspondance avec le `$match` de lecture
 * qui mérite un test, pas ces trois requêtes.
 */

/**
 * Les followers d'un lair ne sont pas sur le lair : ils sont sur l'utilisateur,
 * dans `user.lairs` — c'est déjà ce que lit `getUserNotifications`. Les
 * retrouver demande donc une requête sur la collection des comptes, et
 * **un index sur `user.lairs`** : sans lui, chaque annonce de lair la balaie
 * entière.
 */
async function loadLairFollowers(lairId: string): Promise<string[]> {
  const docs = await db
    .collection("user")
    .find({ lairs: lairId }, { projection: { _id: 1 } })
    .toArray();

  return docs.map((doc) => doc._id.toString());
}

async function loadLairOwners(lairId: string): Promise<string[]> {
  if (!ObjectId.isValid(lairId)) return [];

  const lair = await db
    .collection("lairs")
    .findOne({ _id: new ObjectId(lairId) }, { projection: { owners: 1 } });

  return (lair?.owners ?? []) as string[];
}

/**
 * Les événements ne sont pas retrouvés par `_id` mais par leur champ `id` :
 * c'est ce que fait le `$lookup` du pipeline de lecture, et les notifications
 * portent cet identifiant-là.
 */
async function loadEvent(eventId: string): Promise<{ participants: string[]; creatorId: string | null }> {
  const event = await db
    .collection("events")
    .findOne({ id: eventId }, { projection: { participants: 1, creatorId: 1 } });

  return {
    participants: (event?.participants ?? []) as string[],
    creatorId: (event?.creatorId ?? null) as string | null,
  };
}

/** Charge ce que la cible réclame, et rien d'autre. */
async function loadAudience(source: AudienceSource): Promise<LoadedAudience> {
  switch (source.kind) {
    case "user":
      return {};
    case "lair": {
      const [owners, followers] = await Promise.all([
        source.owners ? loadLairOwners(source.lairId) : Promise.resolve([]),
        source.followers ? loadLairFollowers(source.lairId) : Promise.resolve([]),
      ]);
      return { owners, followers };
    }
    case "event": {
      if (!source.participants && !source.creator) return {};
      const event = await loadEvent(source.eventId);
      return { participants: event.participants, creatorId: event.creatorId };
    }
  }
}

/** Les destinataires d'une notification, dédupliqués. */
export async function loadAudienceUserIds(
  source: AudienceSource,
  options: { exclude?: string[] } = {}
): Promise<string[]> {
  const loaded = await loadAudience(source);
  return resolveAudience(source, loaded, options);
}
