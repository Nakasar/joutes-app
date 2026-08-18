import 'server-only';

import db from "@/lib/mongodb";
import {ObjectId} from "bson";
import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import {isAdmin} from "@/lib/config/admins";
import {isPlanPermission, type SubscriptionPlanKey} from "@/lib/constants/subscription-plans";
import {plansForUserId} from "@/lib/subscriptions/access";
import {getPlansByUserIds} from "@/lib/db/subscriptions";
import {resolveEntitlements, resolvePlanPermissions} from "@/lib/subscriptions/entitlements";

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

  if (isAdmin(session.user.email)) {
    return true;
  }

  // Dernier recours, et seulement pour les permissions qu'un palier peut
  // ouvrir : les trois vérifications précédentes ne coûtent qu'une lecture
  // indexée et un test en mémoire, celle-ci va lire l'abonnement. `hasPermission`
  // est appelée partout, y compris pour des permissions qu'aucune offre ne
  // donne — `isPlanPermission` garde ces appels-là inchangés.
  if (isPlanPermission(permission)) {
    return resolvePlanPermissions(await plansForUserId(session.user.id)).includes(permission);
  }

  return false;
}

/**
 * Vrai si **au moins un** de ces comptes détient cette permission.
 *
 * Existe pour les droits qui se raisonnent à l'échelle d'un groupe : un groupe
 * de jeu débloque la gestion avancée de collection dès qu'un seul de ses membres
 * est abonné. Le droit appartient toujours à une personne — c'est le groupe qui
 * en profite, et personne n'y perd si un autre membre se désabonne.
 *
 * Deux lectures, quelle que soit la taille du groupe : les comptes, puis leurs
 * abonnements. Boucler `hasPermission` ferait un N+1 — et ne marcherait pas, ne
 * sachant regarder que le compte connecté.
 */
export async function anyUserHasPermission(
  userIds: readonly string[],
  permission: string
): Promise<boolean> {
  const ids = [...new Set(userIds.filter(Boolean))].filter((id) => ObjectId.isValid(id));

  if (ids.length === 0) {
    return false;
  }

  if (IMPLICIT_PERMISSIONS.includes(permission)) {
    return true;
  }

  const acceptedPermissions = [permission, ...(PERMISSION_ALIASES[permission] ?? [])];
  const objectIds = ids.map((id) => new ObjectId(id));

  const [holder, plansByUser] = await Promise.all([
    db.collection('user').findOne({
      _id: { $in: objectIds },
      $or: [{ permissions: { $in: acceptedPermissions } }, { isAdmin: true }],
    }),
    // Seulement pour les permissions qu'un palier peut ouvrir : les autres
    // n'ont aucune raison d'aller lire des abonnements.
    isPlanPermission(permission)
      ? getPlansByUserIds(ids)
      : Promise.resolve({} as Record<string, SubscriptionPlanKey[]>),
  ]);

  if (holder) {
    return true;
  }

  if (
    Object.values(plansByUser).some((plans) =>
      (resolvePlanPermissions(plans) as string[]).includes(permission)
    )
  ) {
    return true;
  }

  // Les administrateurs listés par configuration ne portent pas forcément le
  // drapeau en base : ils se reconnaissent à leur adresse.
  const admins = await db
    .collection<{ email?: string }>('user')
    .find({ _id: { $in: objectIds } }, { projection: { email: 1 } })
    .toArray();

  return admins.some((user) => !!user.email && isAdmin(user.email));
}

/**
 * Permissions effectives du compte connecté, pour que les clients (dont l'app
 * mobile) n'affichent que les actions réellement autorisées plutôt que de
 * découvrir le refus au moment d'écrire. Un administrateur les a toutes : il
 * est signalé par `isAdmin`, sa liste de permissions n'étant pas énumérable.
 *
 * Les offres d'abonnement et les droits qu'elles ouvrent voyagent dans la même
 * réponse, parce qu'un client se pose une seule question — « qu'ai-je le droit
 * de faire ? » — et n'a pas à savoir que deux systèmes y répondent.
 *
 * Ils restent pourtant **deux listes séparées**, et c'est délibéré : une
 * permission s'accorde à la main et vaut capacité d'équipe (modérer les erratas,
 * importer un quizz) ; un droit d'abonnement s'achète et se recalcule tout seul
 * depuis Patreon. Tout droit d'abonnement porte d'ailleurs le préfixe `sub:`,
 * qu'aucune permission n'emploie.
 *
 * Une offre peut malgré tout ouvrir une **permission** — `trades:full_history`
 * arrive avec Expert ou Pro, et s'accorde aussi à la main. La séparation qui
 * compte n'est pas celle des noms mais celle des **écritures** : les paliers ne
 * touchent jamais à `user.permissions[]`, ils s'ajoutent en lecture. Un
 * abonnement qui s'arrête ne peut donc pas effacer un droit de modérateur ; il
 * cesse seulement d'apporter le sien.
 */
export async function getMyPermissions(): Promise<{
  permissions: string[];
  isAdmin: boolean;
  plans: SubscriptionPlanKey[];
  entitlements: string[];
} | null> {
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

  // `plansForUserId` et non `getMyPlans` : la session est déjà lue plus haut,
  // et `getMyPlans` la relirait pour retrouver le même identifiant.
  const plans = await plansForUserId(session.user.id);

  // Les permissions ouvertes par un palier rejoignent la liste plutôt que de
  // former une troisième catégorie : un client se demande « ai-je le droit ? »,
  // pas « d'où me vient ce droit ? ». Elles n'entrent que dans cette réponse —
  // rien ne les écrit jamais dans `user.permissions[]`, de sorte qu'une fin
  // d'abonnement les retire d'elle-même au prochain appel.
  for (const permission of resolvePlanPermissions(plans)) {
    granted.add(permission);
  }

  return {
    permissions: [...granted].sort(),
    isAdmin: Boolean(user?.isAdmin) || isAdmin(session.user.email),
    plans,
    entitlements: resolveEntitlements(plans),
  };
}