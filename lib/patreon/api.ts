import 'server-only';

import type { PatreonDocument } from "./types";

/**
 * Les appels à l'API Patreon.
 *
 * **La règle qui gouverne ce fichier tient en une phrase : un échec réseau ne
 * doit jamais pouvoir passer pour « cet abonné n'a plus rien ».** Une panne de
 * Patreon interprétée comme une absence de palier éteindrait tous les abonnés
 * d'un coup — c'est le pire scénario de cette fonctionnalité, et il est écarté
 * par le typage plutôt que par la vigilance : ces fonctions rendent un résultat
 * discriminé, et `sync.ts` n'écrit qu'en cas de succès. Il n'existe aucun chemin
 * de code depuis « la requête a échoué » vers `plans: []`.
 *
 * Patreon documente par ailleurs des 504 sur `/identity` pour les comptes à
 * nombreuses adhésions : ce n'est pas un cas d'école.
 */

const API_ROOT = "https://www.patreon.com/api/oauth2/v2";
const TIMEOUT_MS = 15_000;

export type PatreonResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "unauthorized" | "not-found" | "rate-limited" | "unavailable" | "network" };

/**
 * Les champs demandés à Patreon. Tout est explicite : l'API v2 ne rend un
 * attribut que si on le nomme, et un `fields[member]` oublié donne une réponse
 * valide où tout vaut zéro — le genre de bug qui éteint des abonnements en
 * silence.
 */
const MEMBER_FIELDS = "patron_status,currently_entitled_amount_cents,last_charge_status";

/**
 * L'adhésion du porteur du jeton.
 *
 * Sans le scope `identity.memberships`, Patreon ne rend que l'adhésion à
 * **notre** campagne — exactement ce qu'on veut, et la portée la moins
 * intrusive. Ne pas « corriger » en ajoutant le scope : il exposerait les
 * adhésions du mécène à tous les autres créateurs.
 */
export async function fetchIdentity(accessToken: string): Promise<PatreonResult<PatreonDocument>> {
  const url =
    `${API_ROOT}/identity` +
    `?include=memberships.currently_entitled_tiers,memberships.campaign` +
    `&fields%5Bmember%5D=${MEMBER_FIELDS}`;

  return request(url, accessToken);
}

/**
 * Un membre, relu à la source.
 *
 * C'est ce que le webhook appelle : sa charge utile dit *qui* a changé, cet
 * appel dit *ce qu'il est devenu*. L'ordre de livraison et les répétitions
 * deviennent alors sans effet, puisque l'état est toujours relu.
 */
export async function fetchMember(
  memberId: string,
  creatorAccessToken: string
): Promise<PatreonResult<PatreonDocument>> {
  const url =
    `${API_ROOT}/members/${encodeURIComponent(memberId)}` +
    `?include=currently_entitled_tiers,user` +
    `&fields%5Bmember%5D=${MEMBER_FIELDS}`;

  return request(url, creatorAccessToken);
}

/**
 * Une page de membres de la campagne, pour la réconciliation.
 * Le curseur suivant se lit dans `meta.pagination.cursors.next` ; son absence
 * marque la fin.
 */
export async function fetchCampaignMembers({
  campaignId,
  creatorAccessToken,
  cursor,
}: {
  campaignId: string;
  creatorAccessToken: string;
  cursor?: string | null;
}): Promise<PatreonResult<PatreonDocument & { meta?: { pagination?: { cursors?: { next?: string } } } }>> {
  const url =
    `${API_ROOT}/campaigns/${encodeURIComponent(campaignId)}/members` +
    `?include=currently_entitled_tiers,user` +
    `&fields%5Bmember%5D=${MEMBER_FIELDS}` +
    `&page%5Bcount%5D=500` +
    (cursor ? `&page%5Bcursor%5D=${encodeURIComponent(cursor)}` : "");

  return request(url, creatorAccessToken);
}

/**
 * Une requête, avec une seule nouvelle tentative.
 *
 * Une seule : au-delà, on empile les délais dans une fonction serverless pour
 * un service qui, s'il est vraiment tombé, ne reviendra pas en trois secondes.
 * Le cron de réconciliation est le vrai filet.
 */
async function request<T>(url: string, accessToken: string, attempt = 0): Promise<PatreonResult<T>> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (response.ok) {
      return { ok: true, data: (await response.json()) as T };
    }

    if (response.status === 401 || response.status === 403) {
      // Jeton expiré ou révoqué. Surtout pas une extinction d'abonnement :
      // c'est notre problème d'authentification, pas le sien.
      return { ok: false, reason: "unauthorized" };
    }

    if (response.status === 404) {
      return { ok: false, reason: "not-found" };
    }

    if (response.status === 429) {
      return { ok: false, reason: "rate-limited" };
    }

    // 5xx, dont les 504 documentés sur `/identity`.
    if (attempt === 0) {
      return request(url, accessToken, 1);
    }

    return { ok: false, reason: "unavailable" };
  } catch {
    // Délai dépassé, DNS, coupure réseau.
    if (attempt === 0) {
      return request(url, accessToken, 1);
    }

    return { ok: false, reason: "network" };
  }
}

/** Le curseur de la page suivante, ou `null` à la fin du parcours. */
export function nextCursor(
  page: PatreonDocument & { meta?: { pagination?: { cursors?: { next?: string } } } }
): string | null {
  return page.meta?.pagination?.cursors?.next ?? null;
}
