import "server-only";

import { twitchCallbackUrl, twitchConfig } from "@/lib/streams/config";
import { TWITCH_SUBSCRIPTION_TYPES, type TwitchSubscriptionType } from "@/lib/streams/twitch-eventsub";

/**
 * L'API Helix, réduite à ce dont l'annonce automatique a besoin.
 *
 * Quatre appels : lire une chaîne, poser un abonnement EventSub, le retirer, et
 * demander qui diffuse en ce moment. Le dernier n'est pas un doublon des
 * webhooks mais leur filet : une livraison perdue, un déploiement pendant un
 * `stream.offline`, et un direct resterait affiché indéfiniment. Le cron relit
 * l'état réel et le fait converger.
 *
 * **Aucune de ces fonctions ne jette.** Elles rendent `null` ou un résultat
 * en échec : une panne de Twitch ne doit ni éteindre un direct en cours, ni
 * faire échouer l'écran de compte de quelqu'un qui n'y est pour rien.
 */

const HELIX = "https://api.twitch.tv/helix";
const TOKEN_ENDPOINT = "https://id.twitch.tv/oauth2/token";

type AppToken = { value: string; expiresAt: number };

let cachedToken: AppToken | null = null;

/**
 * Le jeton applicatif, obtenu en `client_credentials`.
 *
 * Gardé en mémoire du module et renouvelé une minute avant l'échéance — un
 * jeton Twitch vit deux mois environ, et en redemander un à chaque appel ferait
 * de la limite de débit d'identification notre plafond réel. Le cache est
 * par instance : plusieurs fonctions serverless en détiendront chacune un, ce
 * qui est sans conséquence, Twitch les acceptant tous.
 */
async function appAccessToken(): Promise<string | null> {
  const config = twitchConfig();
  if (!config) {
    return null;
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "client_credentials",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Jeton applicatif Twitch refusé:", response.status, await response.text());
      return null;
    }

    const body = (await response.json()) as { access_token?: string; expires_in?: number };

    if (!body.access_token) {
      return null;
    }

    cachedToken = {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    };

    return cachedToken.value;
  } catch (error) {
    console.error("Jeton applicatif Twitch indisponible:", error);
    return null;
  }
}

async function helix(path: string, init: RequestInit = {}): Promise<Response | null> {
  const config = twitchConfig();
  const token = await appAccessToken();

  if (!config || !token) {
    return null;
  }

  try {
    return await fetch(`${HELIX}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        "Client-Id": config.clientId,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  } catch (error) {
    console.error(`Appel Helix ${path} en échec:`, error);
    return null;
  }
}

export type TwitchChannel = {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl?: string;
};

/**
 * Lit une chaîne par son identifiant.
 *
 * C'est ce qui donne le `login` — le nom qui compose l'adresse publique et donc
 * l'URL du direct. Le compte social lié ne porte que l'identifiant numérique.
 */
export async function getTwitchChannel(broadcasterUserId: string): Promise<TwitchChannel | null> {
  const response = await helix(`/users?id=${encodeURIComponent(broadcasterUserId)}`);

  if (!response?.ok) {
    return null;
  }

  const body = (await response.json()) as {
    data?: { id: string; login: string; display_name: string; profile_image_url?: string }[];
  };
  const user = body.data?.[0];

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    profileImageUrl: user.profile_image_url,
  };
}

export type TwitchStream = {
  userId: string;
  userLogin: string;
  title?: string;
  startedAt?: string;
  streamId?: string;
};

/**
 * Qui, parmi ces chaînes, diffuse en ce moment.
 *
 * Twitch accepte cent identifiants par appel et n'en rend que les chaînes
 * allumées : l'absence d'une chaîne dans la réponse **est** la réponse. C'est ce
 * qui rend la réconciliation bidirectionnelle en un appel par lot.
 */
export async function getLiveTwitchStreams(broadcasterUserIds: string[]): Promise<Map<string, TwitchStream>> {
  const live = new Map<string, TwitchStream>();

  for (let index = 0; index < broadcasterUserIds.length; index += 100) {
    const batch = broadcasterUserIds.slice(index, index + 100);
    const query = batch.map((id) => `user_id=${encodeURIComponent(id)}`).join("&");
    const response = await helix(`/streams?${query}&first=100`);

    if (!response?.ok) {
      continue;
    }

    const body = (await response.json()) as {
      data?: { id: string; user_id: string; user_login: string; title?: string; started_at?: string; type?: string }[];
    };

    for (const stream of body.data ?? []) {
      // `type` vaut « live » pour un direct et « » pour une rediffusion d'erreur
      // côté Twitch : on ne retient que le premier.
      if (stream.type && stream.type !== "live") {
        continue;
      }

      live.set(stream.user_id, {
        userId: stream.user_id,
        userLogin: stream.user_login,
        title: stream.title,
        startedAt: stream.started_at,
        streamId: stream.id,
      });
    }
  }

  return live;
}

export type EventSubResult = { ok: true; ids: string[] } | { ok: false; error: string };

/**
 * Abonne notre webhook au début **et** à la fin des directs d'une chaîne.
 *
 * Les deux abonnements sont posés ensemble et le premier échec annule le lot :
 * une écoute qui saurait allumer sans savoir éteindre laisserait des directs
 * fantômes sur les vitrines, ce qui est pire que pas d'écoute du tout.
 *
 * Twitch dédoublonne de son côté — un abonnement identique déjà présent ressort
 * en 409, que l'on traite comme un succès sans identifiant : le cron le
 * retrouvera par `listTwitchSubscriptions` s'il faut le supprimer.
 */
export async function subscribeToTwitchStream(broadcasterUserId: string): Promise<EventSubResult> {
  const config = twitchConfig();
  const callback = twitchCallbackUrl();

  if (!config) {
    return { ok: false, error: "twitch-non-configure" };
  }

  if (!callback) {
    return { ok: false, error: "adresse-de-rappel-absente" };
  }

  const ids: string[] = [];

  for (const type of TWITCH_SUBSCRIPTION_TYPES) {
    const result = await createSubscription(type, broadcasterUserId, config.eventSubSecret, callback);

    if (!result.ok) {
      // On retire ce qui vient d'être posé : un demi-abonnement ne s'assume pas.
      await Promise.all(ids.map((id) => deleteTwitchSubscription(id)));
      return result;
    }

    ids.push(...result.ids);
  }

  return { ok: true, ids };
}

async function createSubscription(
  type: TwitchSubscriptionType,
  broadcasterUserId: string,
  secret: string,
  callback: string,
): Promise<EventSubResult> {
  const response = await helix("/eventsub/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      version: "1",
      condition: { broadcaster_user_id: broadcasterUserId },
      transport: { method: "webhook", callback, secret },
    }),
  });

  if (!response) {
    return { ok: false, error: "twitch-injoignable" };
  }

  if (response.status === 409) {
    return { ok: true, ids: [] };
  }

  if (!response.ok) {
    return { ok: false, error: `twitch-${response.status}: ${(await response.text()).slice(0, 200)}` };
  }

  const body = (await response.json()) as { data?: { id: string }[] };

  return { ok: true, ids: (body.data ?? []).map((item) => item.id) };
}

export async function deleteTwitchSubscription(id: string): Promise<boolean> {
  const response = await helix(`/eventsub/subscriptions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  return response?.ok ?? false;
}

export type TwitchSubscriptionSummary = {
  id: string;
  type: string;
  status: string;
  broadcasterUserId?: string;
};

/**
 * Tous les abonnements de l'application.
 *
 * Sert au ménage : un abonnement dont la chaîne n'est plus liée chez nous
 * continuerait de nous réveiller, et Twitch plafonne leur nombre par
 * application.
 */
export async function listTwitchSubscriptions(): Promise<TwitchSubscriptionSummary[]> {
  const summaries: TwitchSubscriptionSummary[] = [];
  let cursor: string | null = null;

  do {
    const response: Response | null = await helix(
      `/eventsub/subscriptions?first=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`,
    );

    if (!response?.ok) {
      break;
    }

    const body = (await response.json()) as {
      data?: { id: string; type: string; status: string; condition?: { broadcaster_user_id?: string } }[];
      pagination?: { cursor?: string };
    };

    for (const item of body.data ?? []) {
      summaries.push({
        id: item.id,
        type: item.type,
        status: item.status,
        broadcasterUserId: item.condition?.broadcaster_user_id,
      });
    }

    cursor = body.pagination?.cursor ?? null;
  } while (cursor);

  return summaries;
}
