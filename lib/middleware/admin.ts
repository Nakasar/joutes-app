import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/config/admins";
import { headers } from "next/headers";
import { getLairById } from "@/lib/db/lairs";

export async function requireAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.email || !isAdmin(session.user.email)) {
    throw new Error("Accès non autorisé");
  }

  return session;
}

export async function checkAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user?.email ? isAdmin(session.user.email) : false;
}

/**
 * Vérifie si l'utilisateur est administrateur OU owner du lair spécifié
 * @param lairId L'ID du lair à vérifier
 * @returns La session de l'utilisateur si autorisé
 * @throws Error si l'utilisateur n'est pas autorisé
 */
export async function requireAdminOrOwner(lairId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.email && !session?.user?.id) {
    throw new Error("Accès non autorisé");
  }

  // Vérifier si l'utilisateur est admin
  const userIsAdmin = session.user.email ? isAdmin(session.user.email) : false;
  if (userIsAdmin) {
    return session;
  }

  // Vérifier si l'utilisateur est owner du lair
  const lair = await getLairById(lairId);
  if (!lair) {
    throw new Error("Lieu non trouvé");
  }

  const isOwner = session.user.id && lair.owners.includes(session.user.id);
  if (!isOwner) {
    throw new Error("Accès non autorisé");
  }

  return session;
}

/**
 * Vérifie si l'utilisateur est administrateur OU owner du lair spécifié (sans lever d'exception)
 * @param lairId L'ID du lair à vérifier
 * @returns true si l'utilisateur est autorisé, false sinon
 */
export async function checkAdminOrOwner(lairId: string): Promise<boolean> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.email && !session?.user?.id) {
    return false;
  }

  // Vérifier si l'utilisateur est admin
  const userIsAdmin = session.user.email ? isAdmin(session.user.email) : false;
  if (userIsAdmin) {
    return true;
  }

  // Vérifier si l'utilisateur est owner du lair
  const lair = await getLairById(lairId);
  if (!lair || !session.user.id) {
    return false;
  }

  return lair.owners.includes(session.user.id);
}
