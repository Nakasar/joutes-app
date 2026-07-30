import 'server-only';

import db from "@/lib/mongodb";
import {ObjectId} from "bson";
import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import {isAdmin} from "@/lib/config/admins";

// Anciens noms de permissions, toujours honorés : les comptes qui les portent
// conservent leurs droits sans migration de la base.
// `erratas:update` gardait la modération des erratas à l'époque où seuls les
// modérateurs pouvaient en créer ; c'est aujourd'hui `erratas:manage`.
const PERMISSION_ALIASES: Record<string, string[]> = {
  'erratas:manage': ['erratas:update'],
};

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

  const acceptedPermissions = [permission, ...(PERMISSION_ALIASES[permission] ?? [])];

  const userWithPermission = await db.collection('user').findOne({
    $and: [
      { _id: new ObjectId(session.user.id) },
      {
        $or: [
          {
            permissions: { $in: acceptedPermissions },
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