/**
 * Les adresses sous lesquelles Joutes se sert lui-même.
 *
 * Deux endroits en ont besoin, pour la même raison — ne pas croire un en-tête
 * que l'appelant écrit :
 *
 * - le CORS de l'API (`proxy.ts`), qui ne doit accorder les identifiants
 *   (cookie de session) qu'à nos propres pages ;
 * - la conversion en markdown (`app/api/markdown`), qui va rechercher la page
 *   sur l'hôte demandé et ne doit pas se laisser envoyer ailleurs.
 *
 * Fonctions pures, l'environnement en paramètre : elles se testent sans
 * toucher à `process.env`.
 */

type Env = Record<string, string | undefined>;

/** Les hôtes de production, écrits en dur : ils ne dépendent d'aucun réglage. */
const PRODUCTION_HOSTS = ["joutes.app", "www.joutes.app", "api.joutes.app"];

/**
 * Les origines de l'application mobile (Tauri), les mêmes que les
 * `trustedOrigins` de `lib/auth.ts`.
 */
const APP_ORIGINS = ["http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"];

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** L'hôte (`nom[:port]`) d'une adresse ou d'un hôte nu, en minuscules. */
function hostOf(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).host.toLowerCase();
  } catch {
    return undefined;
  }
}

function hostnameOf(host: string): string {
  // Une IPv6 s'écrit entre crochets, et contient elle-même des `:`.
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
}

/** Les hôtes configurés pour ce déploiement, en plus de la production. */
function configuredHosts(env: Env): string[] {
  return [
    env.NEXT_PUBLIC_BASE_URL,
    env.BETTER_AUTH_URL,
    env.DEV_URL,
    // Posées par Vercel sur chaque déploiement, sans protocole.
    env.VERCEL_URL,
    env.VERCEL_BRANCH_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
  ]
    .map(hostOf)
    .filter((host): host is string => !!host);
}

/**
 * Vrai si `host` (la valeur d'un en-tête `Host`, port compris) est l'un des
 * nôtres.
 *
 * Hors production, la machine locale est acceptée quel que soit son port. Sur
 * Vercel, tout `*.vercel.app` l'est aussi : les aperçus ont des alias que
 * `VERCEL_URL` ne liste pas, et la plateforme y écrit elle-même
 * `x-forwarded-host`. Ailleurs, où l'en-tête vient de l'appelant, ce suffixe
 * ne vaut rien et n'est pas reconnu.
 */
export function isOwnHost(host: string | null | undefined, env: Env = process.env): boolean {
  const normalized = hostOf(host ?? undefined);
  if (!normalized) return false;

  if (PRODUCTION_HOSTS.includes(normalized)) return true;
  if (configuredHosts(env).includes(normalized)) return true;

  const hostname = hostnameOf(normalized);

  if (env.NODE_ENV !== "production" && LOCAL_HOSTNAMES.has(hostname)) return true;
  if (env.VERCEL && hostname.endsWith(".vercel.app")) return true;

  return false;
}

/**
 * Vrai si une page servie depuis `origin` peut appeler l'API **avec** le
 * cookie de session : nos pages, et l'application mobile.
 *
 * Toute autre origine reste servie, mais sans identifiants — voir `proxy.ts`.
 */
export function isCredentialedOrigin(origin: string | null | undefined, env: Env = process.env): boolean {
  if (!origin) return false;
  if (APP_ORIGINS.includes(origin)) return true;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  // En clair, seule la machine locale : un `http://www.joutes.app` forgé sur
  // un réseau hostile ne doit pas lire l'API au nom de quelqu'un.
  if (url.protocol === "http:" && !LOCAL_HOSTNAMES.has(hostnameOf(url.host))) return false;

  // `Origin` est écrit par le navigateur de l'appelant, pas par la plateforme :
  // le suffixe `*.vercel.app` n'y prouve rien, n'importe qui peut y héberger
  // une page. Seuls les hôtes nommés (production, `VERCEL_URL`,
  // `VERCEL_BRANCH_URL`…) reçoivent donc les identifiants.
  return isOwnHost(url.host, { ...env, VERCEL: undefined });
}
