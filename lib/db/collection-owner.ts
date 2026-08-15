import { ObjectId } from "mongodb";

/**
 * A collection can be owned either by an individual user (their personal
 * collection) or shared by a whole play-group (any member can add/remove
 * cards). `collection-cards` documents carry either a `userId` or a
 * `playGroupId` field (never both), and every query matches on whichever field
 * applies to the given owner.
 *
 * Ces trois définitions vivent à part pour être lues aussi bien par la
 * collection (`collection.ts`) que par ce qui s'y rattache — produits, valeurs
 * estimées — sans que ces modules aient à s'importer les uns les autres.
 * `collection.ts` les réexporte : c'est de là que le reste du code les prend
 * depuis toujours.
 */
export type CollectionOwner = { type: "user"; id: string } | { type: "playGroup"; id: string };

export function ownerField(owner: CollectionOwner): "userId" | "playGroupId" {
  return owner.type === "user" ? "userId" : "playGroupId";
}

export function ownerMatch(owner: CollectionOwner): Record<string, ObjectId> {
  return { [ownerField(owner)]: new ObjectId(owner.id) };
}
