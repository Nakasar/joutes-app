import type { ObjectId } from "mongodb";

export type PlayGroupMemberRole = "owner" | "admin" | "member";

export type PlayGroupMember = {
  userId: string;
  role: PlayGroupMemberRole;
  joinedAt: string;
};

export type PlayGroup = {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: PlayGroupMember[];
  createdAt: string;
  updatedAt: string;
};

export type PlayGroupInvitation = {
  id: string;
  playGroupId: string;
  playGroupName: string;
  invitedUserId: string;
  invitedById: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  updatedAt: string;
};

export type PlayGroupMemberDocument = PlayGroupMember;

export type PlayGroupDocument = {
  _id: ObjectId;
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: PlayGroupMemberDocument[];
  createdAt: string;
  updatedAt: string;
};

export type PlayGroupInvitationDocument = {
  _id: ObjectId;
  id: string;
  playGroupId: string;
  playGroupName: string;
  invitedUserId: string;
  invitedById: string;
  status: PlayGroupInvitation["status"];
  createdAt: string;
  updatedAt: string;
};
