import db from "@/lib/mongodb";
import { ObjectId, WithId } from "mongodb";
import type { FriendRequest, FriendRequestDocument } from "@/lib/types/FriendRequest";
import type { User } from "@/lib/types/User";

const FRIEND_REQUESTS_COLLECTION = "friendRequests";
const USER_COLLECTION = "user";

const friendRequestsCollection = db.collection<FriendRequestDocument>(FRIEND_REQUESTS_COLLECTION);

function toFriendRequest(doc: WithId<FriendRequestDocument>): FriendRequest {
  return {
    id: doc.id || doc._id.toString(),
    requesterId: doc.requesterId,
    recipientId: doc.recipientId,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function areUsersFriends(userId: string, otherUserId: string): Promise<boolean> {
  const user = await db.collection(USER_COLLECTION).findOne(
    { _id: ObjectId.createFromHexString(userId), friends: otherUserId },
    { projection: { _id: 1 } }
  );
  return !!user;
}

export async function getPendingRequestBetween(userId: string, otherUserId: string): Promise<FriendRequest | null> {
  const doc = await friendRequestsCollection.findOne({
    status: "pending",
    $or: [
      { requesterId: userId, recipientId: otherUserId },
      { requesterId: otherUserId, recipientId: userId },
    ],
  });
  return doc ? toFriendRequest(doc) : null;
}

export async function createFriendRequest(input: { requesterId: string; recipientId: string }): Promise<FriendRequest> {
  const now = new Date().toISOString();
  const request: FriendRequestDocument = {
    _id: new ObjectId(),
    id: new ObjectId().toString(),
    requesterId: input.requesterId,
    recipientId: input.recipientId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  await friendRequestsCollection.insertOne(request);
  return toFriendRequest(request);
}

export async function getPendingFriendRequestsForUser(userId: string): Promise<FriendRequest[]> {
  const requests = await friendRequestsCollection
    .find({ recipientId: userId, status: "pending" })
    .sort({ createdAt: -1 })
    .toArray();

  return requests.map(toFriendRequest);
}

export async function acceptFriendRequest(requestId: string, userId: string): Promise<FriendRequest | null> {
  const request = await friendRequestsCollection.findOne({ id: requestId, recipientId: userId, status: "pending" });
  if (!request) {
    return null;
  }

  const now = new Date().toISOString();
  await friendRequestsCollection.updateOne({ id: requestId }, { $set: { status: "accepted", updatedAt: now } });

  const userCollection = db.collection(USER_COLLECTION);
  await Promise.all([
    userCollection.updateOne(
      { _id: ObjectId.createFromHexString(request.requesterId) },
      { $addToSet: { friends: request.recipientId } }
    ),
    userCollection.updateOne(
      { _id: ObjectId.createFromHexString(request.recipientId) },
      { $addToSet: { friends: request.requesterId } }
    ),
  ]);

  return toFriendRequest({ ...request, status: "accepted", updatedAt: now });
}

export async function declineFriendRequest(requestId: string, userId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await friendRequestsCollection.updateOne(
    { id: requestId, recipientId: userId, status: "pending" },
    { $set: { status: "declined", updatedAt: now } }
  );
  return result.modifiedCount > 0;
}

export async function removeFriend(userId: string, friendId: string): Promise<boolean> {
  const userCollection = db.collection<User>(USER_COLLECTION);
  const [result] = await Promise.all([
    userCollection.updateOne({ _id: ObjectId.createFromHexString(userId) }, { $pull: { friends: friendId } }),
    userCollection.updateOne({ _id: ObjectId.createFromHexString(friendId) }, { $pull: { friends: userId } }),
  ]);
  return result.modifiedCount > 0;
}
