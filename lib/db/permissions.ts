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
  // `quizzes:update` donnait la main sur tous les quizz, à l'époque où seuls
  // ses porteurs pouvaient en écrire. Écrire un quizz est aujourd'hui ouvert à
  // tous et chacun gère les siens ; toucher à ceux des autres est devenu
  // `quizzes:update-all`.
  'quizzes:update-all': ['quizzes:update'],
};

// Accordées à tout compte connecté : voter est ouvert à la communauté, seule
// la publication de contenu faisant autorité est restreinte.
const IMPLICIT_PERMISSIONS = ['policies:vote', 'erratas:vote'];

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

  if (IMPLICIT_PERMISSIONS.includes(permission)) {
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

/**
 * Permissions effectives du compte connecté, pour que les clients (dont l'app
 * mobile) n'affichent que les actions réellement autorisées plutôt que de
 * découvrir le refus au moment d'écrire. Un administrateur les a toutes : il
 * est signalé par `isAdmin`, sa liste de permissions n'étant pas énumérable.
 */
export async function getMyPermissions(): Promise<{ permissions: string[]; isAdmin: boolean } | null> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.email) {
    return null;
  }

  const user = await db
    .collection<{ permissions?: string[]; isAdmin?: boolean }>('user')
    .findOne({ _id: new ObjectId(session.user.id) }, { projection: { permissions: 1, isAdmin: 1 } });

  const granted = new Set([...(user?.permissions ?? []), ...IMPLICIT_PERMISSIONS]);

  // Les alias historiques donnent aussi accès à la permission moderne : on la
  // liste explicitement pour que les clients n'aient pas à connaître la table.
  for (const [permission, aliases] of Object.entries(PERMISSION_ALIASES)) {
    if (aliases.some((alias) => granted.has(alias))) {
      granted.add(permission);
    }
  }

  return {
    permissions: [...granted].sort(),
    isAdmin: Boolean(user?.isAdmin) || isAdmin(session.user.email),
  };
}