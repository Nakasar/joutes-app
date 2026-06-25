import db from "@/lib/mongodb";
import { Filter, ObjectId, UpdateFilter, WithId } from "mongodb";
import type {
  PlayGroup,
  PlayGroupDocument,
  PlayGroupInvitation,
  PlayGroupInvitationDocument,
  PlayGroupMember,
  PlayGroupMemberRole,
} from "@/lib/types/PlayGroup";

const PLAY_GROUPS_COLLECTION = "playGroups";
const PLAY_GROUP_INVITATIONS_COLLECTION = "playGroupInvitations";

const playGroupsCollection = db.collection<PlayGroupDocument>(PLAY_GROUPS_COLLECTION);
const playGroupInvitationsCollection = db.collection<PlayGroupInvitationDocument>(PLAY_GROUP_INVITATIONS_COLLECTION);

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
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
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
