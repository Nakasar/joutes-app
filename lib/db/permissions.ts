import 'server-only';

import db from "@/lib/mongodb";
import {ObjectId} from "bson";
import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import {isAdmin} from "@/lib/config/admins";

export async function requirePermission(permission: string) {
  if (await hasPermission(permission)) {
    return true;
  }

  throw new Error('Not authorized.');
}

export async function hasPermission(permission: string) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.email) {
    return false;
  }

  if (['policies:vote', 'erratas:vote'].includes(permission)) {
    return true;
  }

  const userWithPermission = await db.collection('user').findOne({
    $and: [
      { _id: new ObjectId(session.user.id) },
      {
        $or: [
          {
            permissions: permission,
          },
          {
            isAdmin: true,
          }
        ]
      },
    ],
  });

  if (userWithPermission) {
    return true;
  }

  return isAdmin(session.user.email);
}