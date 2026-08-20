import db from "@/lib/mongodb";
import { Filter, ObjectId, UpdateFilter, WithId } from "mongodb";
import type {
  PlayGroup,
  PlayGroupAnnouncement,
  PlayGroupContentItem,
  PlayGroupDocument,
  PlayGroupFollowerDocument,
  PlayGroupInvitation,
  PlayGroupInvitationDocument,
  PlayGroupLiveStream,
  PlayGroupMember,
  PlayGroupMemberRole,
  PlayGroupOptions,
} from "@/lib/types/PlayGroup";
import { PLAY_GROUP_MAX_LIVES } from "@/lib/types/PlayGroup";

const PLAY_GROUPS_COLLECTION = "playGroups";
const PLAY_GROUP_INVITATIONS_COLLECTION = "playGroupInvitations";
const PLAY_GROUP_FOLLOWERS_COLLECTION = "playGroupFollowers";

const playGroupsCollection = db.collection<PlayGroupDocument>(PLAY_GROUPS_COLLECTION);
const playGroupInvitationsCollection = db.collection<PlayGroupInvitationDocument>(PLAY_GROUP_INVITATIONS_COLLECTION);
const playGroupFollowersCollection = db.collection<PlayGroupFollowerDocument>(PLAY_GROUP_FOLLOWERS_COLLECTION);

function toPlayGroup(doc: WithId<PlayGroupDocument>): PlayGroup {
  return {
    id: doc.id || doc._id.toString(),
    name: doc.name,
    description: doc.description || undefined,
    ownerId: doc.ownerId,
    members: (doc.members || []).map((member: PlayGroupMember) => ({
      userId: member.userId,
      role: member.role,
      joinedAt: member.joinedAt,
    })),
    enabledGameIds: doc.enabledGameIds ?? null,
    options: doc.options,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Whether a game is available for a group's collection/wishlists. `null` enabledGameIds means every game is allowed. */
export function isGameEnabledForPlayGroup(group: Pick<PlayGroup, "enabledGameIds">, gameId: string): boolean {
  return !group.enabledGameIds || group.enabledGameIds.includes(gameId);
}

function toPlayGroupInvitation(doc: WithId<PlayGroupInvitationDocument>): PlayGroupInvitation {
  return {
    id: doc.id || doc._id.toString(),
    playGroupId: doc.playGroupId,
    playGroupName: doc.playGroupName,
    invitedUserId: doc.invitedUserId,
    invitedById: doc.invitedById,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function createPlayGroup(input: { name: string; description?: string; ownerId: string }): Promise<PlayGroup> {
  const now = new Date().toISOString();
  const group: PlayGroupDocument = {
    _id: new ObjectId(),
    id: new ObjectId().toString(),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    ownerId: input.ownerId,
    members: [{ userId: input.ownerId, role: "owner", joinedAt: now }],
    createdAt: now,
    updatedAt: now,
  };

  await playGroupsCollection.insertOne(group);

  return toPlayGroup(group);
}

export async function getPlayGroupsForUser(userId: string): Promise<PlayGroup[]> {
  const groups = await playGroupsCollection.find({ "members.userId": userId }).sort({ createdAt: -1 }).toArray();

  return groups.map(toPlayGroup);
}

export async function getPlayGroupById(playGroupId: string): Promise<PlayGroup | null> {
  const group = await playGroupsCollection.findOne({ id: playGroupId });
  return group ? toPlayGroup(group) : null;
}

export async function getPlayGroupByIdAndUser(playGroupId: string, userId: string): Promise<PlayGroup | null> {
  const group = await playGroupsCollection.findOne({ id: playGroupId, "members.userId": userId });
  return group ? toPlayGroup(group) : null;
}

export async function updatePlayGroupEnabledGames(playGroupId: string, enabledGameIds: string[] | null): Promise<PlayGroup | null> {
  const now = new Date().toISOString();
  const update: UpdateFilter<PlayGroupDocument> = enabledGameIds
    ? { $set: { enabledGameIds, updatedAt: now } }
    : { $set: { updatedAt: now }, $unset: { enabledGameIds: "" } };

  const result = await playGroupsCollection.findOneAndUpdate({ id: playGroupId }, update, { returnDocument: "after" });

  return result ? toPlayGroup(result) : null;
}

/** Le nom et la description du groupe — le reste de l'identité vit dans `options`. */
export async function updatePlayGroupProfile(
  playGroupId: string,
  input: { name: string; description?: string },
): Promise<PlayGroup | null> {
  const now = new Date().toISOString();
  const name = input.name.trim();
  const description = input.description?.trim();

  const result = await playGroupsCollection.findOneAndUpdate(
    { id: playGroupId },
    description
      ? { $set: { name, description, updatedAt: now } }
      : { $set: { name, updatedAt: now }, $unset: { description: "" } },
    { returnDocument: "after" },
  );

  return result ? toPlayGroup(result) : null;
}

/**
 * Réécrit une partie de la personnalisation du groupe.
 *
 * Une fusion superficielle suffit — et vaut mieux qu'une fusion profonde : le
 * thème, les liens et le rythme sont éditables ensemble depuis le même
 * formulaire, tandis que les annonces, les contenus et les directs passent par
 * les fonctions dédiées plus bas, qui lisent puis réécrivent leur liste
 * entière.
 */
export async function updatePlayGroupOptions(
  playGroupId: string,
  patch: Partial<PlayGroupOptions>,
): Promise<PlayGroup | null> {
  const now = new Date().toISOString();
  const current = await playGroupsCollection.findOne({ id: playGroupId });
  if (!current) {
    return null;
  }

  const result = await playGroupsCollection.findOneAndUpdate(
    { id: playGroupId },
    { $set: { options: { ...current.options, ...patch }, updatedAt: now } },
    { returnDocument: "after" },
  );

  return result ? toPlayGroup(result) : null;
}

/** Les annonces du groupe, de la plus récente à la plus ancienne. */
export function sortPlayGroupAnnouncements(announcements: PlayGroupAnnouncement[]): PlayGroupAnnouncement[] {
  return [...announcements].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

export async function addPlayGroupAnnouncement(
  playGroupId: string,
  announcement: PlayGroupAnnouncement,
): Promise<PlayGroup | null> {
  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    return null;
  }

  return updatePlayGroupOptions(playGroupId, {
    announcements: [announcement, ...(group.options?.announcements ?? [])],
  });
}

export async function updatePlayGroupAnnouncement(
  playGroupId: string,
  announcementId: string,
  patch: Partial<Pick<PlayGroupAnnouncement, "title" | "body" | "scope">>,
): Promise<PlayGroup | null> {
  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    return null;
  }

  const now = new Date().toISOString();
  const announcements = (group.options?.announcements ?? []).map((item) =>
    item.id === announcementId ? { ...item, ...patch, updatedAt: now } : item,
  );

  return updatePlayGroupOptions(playGroupId, { announcements });
}

export async function removePlayGroupAnnouncement(playGroupId: string, announcementId: string): Promise<PlayGroup | null> {
  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    return null;
  }

  return updatePlayGroupOptions(playGroupId, {
    announcements: (group.options?.announcements ?? []).filter((item) => item.id !== announcementId),
  });
}

export async function addPlayGroupContent(playGroupId: string, content: PlayGroupContentItem): Promise<PlayGroup | null> {
  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    return null;
  }

  return updatePlayGroupOptions(playGroupId, {
    contents: [content, ...(group.options?.contents ?? [])],
  });
}

export async function updatePlayGroupContent(
  playGroupId: string,
  contentId: string,
  patch: Partial<Omit<PlayGroupContentItem, "id" | "authorId">>,
): Promise<PlayGroup | null> {
  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    return null;
  }

  const now = new Date().toISOString();
  const contents = (group.options?.contents ?? []).map((item) =>
    item.id === contentId ? { ...item, ...patch, updatedAt: now } : item,
  );

  return updatePlayGroupOptions(playGroupId, { contents });
}

export async function removePlayGroupContent(playGroupId: string, contentId: string): Promise<PlayGroup | null> {
  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    return null;
  }

  return updatePlayGroupOptions(playGroupId, {
    contents: (group.options?.contents ?? []).filter((item) => item.id !== contentId),
  });
}

/**
 * Déclare — ou remplace — le direct d'un membre.
 *
 * Un membre ne tient qu'un direct à la fois : redéclarer remplace le sien
 * plutôt que d'en empiler un second. `startedAt` n'est réécrit que si l'URL
 * change, pour qu'une faute de frappe corrigée ne ramène pas « depuis 42 min »
 * à zéro.
 */
export async function setPlayGroupLiveStream(
  playGroupId: string,
  live: PlayGroupLiveStream,
): Promise<PlayGroup | null> {
  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    return null;
  }

  const lives = group.options?.lives ?? [];
  const existing = lives.find((item) => item.memberId === live.memberId);
  const others = lives.filter((item) => item.memberId !== live.memberId);

  if (!existing && others.length >= PLAY_GROUP_MAX_LIVES) {
    return null;
  }

  const merged: PlayGroupLiveStream = {
    ...live,
    id: existing?.id ?? live.id,
    startedAt: existing && existing.url === live.url ? existing.startedAt : live.startedAt,
  };

  return updatePlayGroupOptions(playGroupId, { lives: [...others, merged] });
}

export async function removePlayGroupLiveStream(playGroupId: string, liveId: string): Promise<PlayGroup | null> {
  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    return null;
  }

  return updatePlayGroupOptions(playGroupId, {
    lives: (group.options?.lives ?? []).filter((item) => item.id !== liveId),
  });
}

export async function countPlayGroupFollowers(playGroupId: string): Promise<number> {
  return playGroupFollowersCollection.countDocuments({ playGroupId });
}

export async function isFollowingPlayGroup(playGroupId: string, userId: string): Promise<boolean> {
  const follower = await playGroupFollowersCollection.findOne({ playGroupId, userId });
  return !!follower;
}

/** Bascule l'abonnement à la vitrine, et renvoie l'état obtenu. */
export async function togglePlayGroupFollower(playGroupId: string, userId: string): Promise<boolean> {
  const deleted = await playGroupFollowersCollection.deleteOne({ playGroupId, userId });
  if (deleted.deletedCount > 0) {
    return false;
  }

  await playGroupFollowersCollection.insertOne({
    _id: new ObjectId(),
    playGroupId,
    userId,
    createdAt: new Date().toISOString(),
  });

  return true;
}

export async function addPlayGroupMember(playGroupId: string, userId: string, role: Exclude<PlayGroupMemberRole, "owner"> = "member"): Promise<boolean> {
  const now = new Date().toISOString();
  const filter: Filter<PlayGroupDocument> = { id: playGroupId, "members.userId": { $ne: userId } };
  const update: UpdateFilter<PlayGroupDocument> = {
    $push: { members: { userId, role, joinedAt: now } },
    $set: { updatedAt: now },
  };
  const result = await playGroupsCollection.updateOne(filter, update);

  return result.modifiedCount > 0;
}

export async function updatePlayGroupMemberRole(playGroupId: string, userId: string, role: PlayGroupMemberRole): Promise<boolean> {
  const now = new Date().toISOString();
  const filter: Filter<PlayGroupDocument> = { id: playGroupId, "members.userId": userId };
  const update: UpdateFilter<PlayGroupDocument> = {
    $set: {
      "members.$.role": role,
      updatedAt: now,
    },
  };
  const result = await playGroupsCollection.updateOne(filter, update);

  return result.modifiedCount > 0;
}

export async function removePlayGroupMember(playGroupId: string, userId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const filter: Filter<PlayGroupDocument> = { id: playGroupId };
  const update: UpdateFilter<PlayGroupDocument> = {
    $pull: { members: { userId } },
    $set: { updatedAt: now },
  };
  const result = await playGroupsCollection.updateOne(filter, update);

  return result.modifiedCount > 0;
}

export async function createPlayGroupInvitation(input: {
  playGroupId: string;
  playGroupName: string;
  invitedUserId: string;
  invitedById: string;
}): Promise<PlayGroupInvitation> {
  const now = new Date().toISOString();
  const invitation: PlayGroupInvitationDocument = {
    _id: new ObjectId(),
    id: new ObjectId().toString(),
    playGroupId: input.playGroupId,
    playGroupName: input.playGroupName,
    invitedUserId: input.invitedUserId,
    invitedById: input.invitedById,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  await playGroupInvitationsCollection.insertOne(invitation);
  return toPlayGroupInvitation(invitation);
}

/** Les invitations encore en attente d'un groupe — l'écran des membres les liste. */
export async function getPendingInvitationsForPlayGroup(playGroupId: string): Promise<PlayGroupInvitation[]> {
  const invitations = await playGroupInvitationsCollection
    .find({ playGroupId, status: "pending" })
    .sort({ createdAt: -1 })
    .toArray();

  return invitations.map(toPlayGroupInvitation);
}

/**
 * Annule une invitation en attente.
 *
 * Supprimée plutôt que marquée « refusée » : le refus appartient à l'invité,
 * et lui prêter un geste qu'il n'a pas fait fausserait son historique.
 */
export async function cancelPlayGroupInvitation(invitationId: string, playGroupId: string): Promise<boolean> {
  const result = await playGroupInvitationsCollection.deleteOne({ id: invitationId, playGroupId, status: "pending" });
  return result.deletedCount > 0;
}

export async function getPendingInvitationsForUser(userId: string): Promise<PlayGroupInvitation[]> {
  const invitations = await playGroupInvitationsCollection.find({ invitedUserId: userId, status: "pending" }).sort({ createdAt: -1 }).toArray();

  return invitations.map(toPlayGroupInvitation);
}

export async function acceptPlayGroupInvitation(invitationId: string, userId: string): Promise<PlayGroup | null> {
  const invitation = await playGroupInvitationsCollection.findOne({ id: invitationId, invitedUserId: userId, status: "pending" });
  if (!invitation) {
    return null;
  }

  const group = await getPlayGroupById(invitation.playGroupId);
  if (!group) {
    return null;
  }

  const alreadyMember = group.members.some((member) => member.userId === userId);
  if (alreadyMember) {
    await playGroupInvitationsCollection.updateOne({ id: invitationId }, { $set: { status: "accepted", updatedAt: new Date().toISOString() } });
    return group;
  }

  const now = new Date().toISOString();
  await playGroupsCollection.updateOne(
    { id: invitation.playGroupId } as Filter<PlayGroupDocument>,
    {
      $push: { members: { userId, role: "member", joinedAt: now } },
      $set: { updatedAt: now },
    } as UpdateFilter<PlayGroupDocument>
  );

  await playGroupInvitationsCollection.updateOne(
    { id: invitationId },
    { $set: { status: "accepted", updatedAt: now } }
  );

  return getPlayGroupById(invitation.playGroupId);
}

/**
 * Suppression d'un groupe de jeu et de ses invitations (modération). Les
 * listes possédées par le groupe sont supprimées par l'appelant
 * (`lib/db/reportable-content.ts`) pour éviter un cycle d'imports.
 */
export async function deletePlayGroup(playGroupId: string): Promise<boolean> {
  const result = await playGroupsCollection.deleteOne({ id: playGroupId });
  if (result.deletedCount === 0) {
    return false;
  }

  await playGroupInvitationsCollection.deleteMany({ playGroupId });
  await playGroupFollowersCollection.deleteMany({ playGroupId });
  return true;
}
