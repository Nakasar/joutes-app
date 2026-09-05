import "server-only";

import type { StreamPlatform } from "@/lib/types/StreamLink";

/**
 * Les secrets des plateformes de direct, lus en un seul endroit.
 *
 * Même contrat que `lib/patreon/config.ts`, et pour la même raison : un
 * environnement de développement ou un aperçu n'a aucune de ces variables et ne
 * doit pas pour autant échouer. Chaque fonction rend `null` quand sa
 * configuration manque ; l'écran de compte affiche alors la liaison désactivée,
 * les webhooks répondent 503 et le cron ne fait rien.
 *
 * Les identifiants OAuth sont relus ici plutôt qu'empruntés à `lib/auth.ts` :
 * la configuration de l'authentification se lit au chargement du module et doit
 * rester lisible seule. C'est deux lignes dupliquées contre une dépendance en
 * moins sur le chemin critique de la connexion.
 */

export type TwitchConfig = {
  clientId: string;
  clientSecret: string;
  /**
   * Le secret dont Twitch signe ses livraisons.
   *
   * Nous le choisissons — Twitch le reçoit à la création de chaque abonnement et
   * s'en sert pour signer. Sans lui, on ne peut ni créer d'abonnement ni
   * vérifier une livraison : l'écoute est alors indisponible, ce que
   * `twitchConfig()` dit en rendant `null`.
   *
   * Entre 10 et 100 caractères, borne imposée par Twitch.
   */
  eventSubSecret: string;
};

export type YouTubeConfig = {
  /**
   * La clé de l'API Data v3.
   *
   * Elle sert à une seule question, posée à `videos.list` : « cette vidéo est-
   * elle en direct en ce moment ? ». Une unité de quota par lot de cinquante
   * identifiants — c'est ce qui rend la surveillance des directs programmés
   * abordable.
   */
  apiKey: string;
  /**
   * Le secret du hub WebSub.
   *
   * Facultatif chez Google, obligatoire chez nous : sans lui, n'importe qui
   * connaissant l'adresse du webhook pourrait pousser un faux flux Atom et
   * déclarer un direct sur les destinations d'autrui.
   */
  webSubSecret: string;
};

export function twitchConfig(): TwitchConfig | null {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();
  const eventSubSecret = process.env.TWITCH_EVENTSUB_SECRET?.trim();

  if (!clientId || !clientSecret || !eventSubSecret) {
    return null;
  }

  return { clientId, clientSecret, eventSubSecret };
}

/**
 * La liaison Twitch est-elle proposable ?
 *
 * Plus permissif que `twitchConfig()` : lier un compte ne demande que le couple
 * OAuth. Sans secret EventSub, la liaison fonctionne et la connexion aussi ;
 * seule l'annonce automatique reste en sommeil, ce que l'écran signale.
 */
export function twitchOAuthConfigured(): boolean {
  return Boolean(process.env.TWITCH_CLIENT_ID?.trim() && process.env.TWITCH_CLIENT_SECRET?.trim());
}

export function youtubeConfig(): YouTubeConfig | null {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  const webSubSecret = process.env.YOUTUBE_WEBSUB_SECRET?.trim();

  if (!apiKey || !webSubSecret) {
    return null;
  }

  return { apiKey, webSubSecret };
}

/**
 * La seule clé de l'API Data, pour tout ce qui n'a rien à voir avec le hub.
 *
 * `youtubeConfig()` demande en plus `YOUTUBE_WEBSUB_SECRET`, et c'est justifié
 * pour ce qui **pose** un abonnement chez Google : sans secret, impossible de
 * signer, donc impossible de s'abonner. Mais lire une vidéo publique n'a que
 * faire de ce secret, et l'exiger éteindrait la lecture faute d'une valeur
 * qu'elle n'emploie pas.
 *
 * Le distinguo n'est pas théorique : les directs des éditeurs
 * (`docs/GAME_LIVES.md`) ne posent aucun abonnement, et leur cron se coupait
 * pourtant sans le secret WebSub — en contradiction avec sa propre
 * documentation, qui annonçait « sans `YOUTUBE_API_KEY`, la détection dort ».
 */
export function youtubeApiKey(): string | null {
  return process.env.YOUTUBE_API_KEY?.trim() || null;
}

/** Google porte la liaison YouTube : YouTube n'a pas d'OAuth à lui. */
export function youtubeOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function streamPlatformOAuthConfigured(platform: StreamPlatform): boolean {
  return platform === "twitch" ? twitchOAuthConfigured() : youtubeOAuthConfigured();
}

export function streamPlatformListeningConfigured(platform: StreamPlatform): boolean {
  return platform === "twitch" ? twitchConfig() !== null : youtubeConfig() !== null;
}

/**
 * L'adresse publique du site, celle que les plateformes rappelleront.
 *
 * Les deux abonnements sont posés **chez elles** avec cette adresse : un
 * déploiement d'aperçu qui s'abonnerait détournerait les livraisons de la
 * production, puisque Twitch comme Google ne retiennent qu'une adresse par
 * abonnement. C'est pourquoi rien ne s'abonne sans que cette variable soit
 * définie et servie en `https` — une adresse `localhost` est refusée par les
 * deux hubs de toute façon.
 */
export function streamCallbackBaseUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();

  if (!base || !base.startsWith("https://")) {
    return null;
  }

  return base.replace(/\/+$/, "");
}

export function twitchCallbackUrl(): string | null {
  const base = streamCallbackBaseUrl();
  return base ? `${base}/api/streams/twitch` : null;
}

export function youtubeCallbackUrl(): string | null {
  const base = streamCallbackBaseUrl();
  return base ? `${base}/api/streams/youtube` : null;
}
