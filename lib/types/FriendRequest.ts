import type { ObjectId } from "mongodb";

export type FriendRequestStatus = "pending" | "accepted" | "declined";

export type FriendRequest = {
  id: string;
  requesterId: string;
  recipientId: string;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export type FriendRequestDocument = {
  _id: ObjectId;
  id: string;
  requesterId: string;
  recipientId: string;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt: string;
};
