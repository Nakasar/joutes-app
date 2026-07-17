import db from "@/lib/mongodb";
import { MongoServerError, ObjectId, WithId } from "mongodb";
import type { FriendRequest, FriendRequestDocument } from "@/lib/types/FriendRequest";
import type { User } from "@/lib/types/User";

const FRIEND_REQUESTS_COLLECTION = "friendRequests";
const USER_COLLECTION = "user";

const friendRequestsCollection = db.collection<FriendRequestDocument>(FRIEND_REQUESTS_COLLECTION);

export class DuplicateFriendRequestError extends Error {
  constructor() {
    super("A pending friend request already exists between these users");
    this.name = "DuplicateFriendRequestError";
  }
}

function computePairKey(userId: string, otherUserId: string): string {
  return [userId, otherUserId].sort().join(":");
}

/** Doit être appelée au moins une fois (ex. script de setup) pour garantir l'unicité des demandes en attente entre deux utilisateurs. */
export async function createFriendRequestIndexes() {
  await friendRequestsCollection.createIndex(
    { pairKey: 1 },
    { unique: true, partialFilterExpression: { status: "pending" } }
  );
}

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
  const id = new ObjectId();
  const request: FriendRequestDocument = {
    _id: id,
    id: id.toString(),
    requesterId: input.requesterId,
    recipientId: input.recipientId,
    pairKey: computePairKey(input.requesterId, input.recipientId),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  try {
    await friendRequestsCollection.insertOne(request);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new DuplicateFriendRequestError();
    }
    throw error;
  }

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
  const updateResult = await friendRequestsCollection.updateOne(
    { id: requestId, recipientId: userId, status: "pending" },
    { $set: { status: "accepted", updatedAt: now } }
  );
  if (updateResult.modifiedCount === 0) {
    return null;
  }

  const userCollection = db.collection(USER_COLLECTION);
  try {
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
  } catch (error) {
    // Les utilisateurs n'ont pas pu être liés : on remet la demande en attente plutôt que de la laisser "accepted" à tort.
    await friendRequestsCollection.updateOne(
      { id: requestId, status: "accepted" },
      { $set: { status: "pending", updatedAt: new Date().toISOString() } }
    );
    throw error;
  }

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
  const [userResult, friendResult] = await Promise.all([
    userCollection.updateOne({ _id: ObjectId.createFromHexString(userId) }, { $pull: { friends: friendId } }),
    userCollection.updateOne({ _id: ObjectId.createFromHexString(friendId) }, { $pull: { friends: userId } }),
  ]);
  return userResult.modifiedCount > 0 || friendResult.modifiedCount > 0;
}
