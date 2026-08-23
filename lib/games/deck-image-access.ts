import 'server-only';

import { isAdmin } from '@/lib/config/admins.ts';

/**
 * La lecture d'une liste de deck par l'IA passe par un modèle facturé à
 * l'appel : elle reste réservée aux administrateurs. `admins` est la liste de
 * référence du projet ; `ADMIN_EMAIL` est conservé pour les déploiements qui
 * ne s'appuyaient que sur cette variable.
 *
 * Vit hors de l'action serveur du vérificateur : un fichier `'use server'`
 * n'exporte que des fonctions asynchrones, et la route qui émet le jeton de
 * dépôt doit appliquer exactement la même règle.
 */
export function canAnalyzeDeckListImages(email: string | null | undefined): boolean {
  if (!email) return false;
  if (isAdmin(email)) return true;

  const adminEmail = process.env.ADMIN_EMAIL;

  return !!adminEmail && email.toLowerCase() === adminEmail.toLowerCase();
}
