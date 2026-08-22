/**
 * La liaison d'une chaîne de direct à un compte Joutes.
 *
 * Une liaison ne naît **jamais** d'elle-même : elle suit un compte social lié
 * depuis « Connexions et comptes ». Le compte (`account` de Better Auth) dit
 * *qui* ; cette collection-ci dit *où le direct s'annonce* et *ce qui est
 * annoncé en ce moment*. Les deux sont séparés parce qu'ils ne meurent pas
 * ensemble — délier le compte efface la liaison, mais retirer une destination
 * ne touche pas au compte.
 */

import type { User } from "@/lib/types/User";

/** Les deux plateformes reconnues, celles que `lib/media/live-embed.ts` sait intégrer. */
export type StreamPlatform = "twitch" | "youtube";

export const STREAM_PLATFORMS: StreamPlatform[] = ["twitch", "youtube"];

/**
 * Où un direct s'annonce.
 *
 * `lair` — le lieu affiche **un** direct : celui qui arrive remplace le
 * précédent. `play-group` — le groupe en affiche jusqu'à trois, un par membre.
 * Cette asymétrie n'est pas la nôtre, elle vient des deux vitrines ; elle est
 * absorbée par `lib/streams/announce.ts` et ne remonte pas jusqu'ici.
 *
 * `user` — la vitrine de son propre profil. C'est la destination la plus simple
 * des trois : rien n'y est écrit ailleurs, le direct étant **déjà** porté par
 * cette liaison. Elle n'en est pas décorative pour autant — l'abonnement chez
 * la plateforme n'est posé que si une liaison a au moins une destination, si
 * bien que sans elle un profil n'apprendrait jamais que son titulaire diffuse.
 */
export type StreamTargetKind = "lair" | "play-group" | "user";

export type StreamTarget = {
  kind: StreamTargetKind;
  id: string;
};

/**
 * Le nombre de destinations qu'une liaison accepte.
 *
 * Une borne de bon sens, pas une limite technique : au-delà, l'écran devient une
 * liste à faire défiler et l'annonce d'un direct écrit dans une dizaine de
 * documents à chaque `stream.online`.
 */
export const STREAM_MAX_TARGETS = 10;

/**
 * Ce qui a réellement été écrit sur une destination.
 *
 * Retirer un direct ne se déduit pas des destinations *actuelles* : entre le
 * début et la fin du direct, l'utilisateur a pu en ajouter ou en retirer. On
 * range donc ce qu'on a écrit, et c'est cela qu'on défait.
 *
 * `liveId` n'existe que pour un groupe, dont les directs sont une liste
 * identifiée ; un lieu n'en a qu'un, reconnu à son URL.
 */
export type StreamAnnouncement = {
  target: StreamTarget;
  liveId?: string;
};

/** Le direct en cours, tel que la liaison l'a annoncé. */
export type StreamLinkLive = {
  url: string;
  title?: string;
  /** ISO 8601 — l'heure donnée par la plateforme quand elle la donne. */
  startedAt: string;
  /** Twitch : identifiant du direct. YouTube : identifiant de la vidéo. */
  platformStreamId?: string;
  announcements: StreamAnnouncement[];
};

/**
 * L'état de l'abonnement chez la plateforme.
 *
 * Il est créé quand la première destination arrive et retiré quand la dernière
 * part : sans destination, il n'y a rien à annoncer et rien à écouter. Le cron
 * de `app/api/cron/streams-refresh` le répare et le renouvelle.
 */
export type StreamSubscriptionState = "idle" | "pending" | "active" | "failed";

export type StreamSubscription = {
  state: StreamSubscriptionState;
  /**
   * Twitch : les identifiants EventSub, pour les supprimer.
   *
   * Deux, et non un : le début et la fin d'un direct sont deux abonnements
   * distincts chez Twitch. Ils vivent et meurent ensemble — n'écouter que le
   * premier laisserait un direct allumé pour toujours.
   */
  ids?: string[];
  /** WebSub : fin du bail, à renouveler avant. ISO 8601. */
  expiresAt?: string;
  /** ISO 8601 — dernière confirmation reçue de la plateforme. */
  confirmedAt?: string;
  lastError?: string;
};

/**
 * Une vidéo YouTube sous surveillance.
 *
 * YouTube ne prévient que d'une chose : « cette chaîne a publié quelque chose ».
 * Un direct programmé y apparaît **avant** de commencer, et rien n'est poussé au
 * démarrage réel ni à la fin. On garde donc l'identifiant sous la main et le
 * cron interroge son état, ce qui coûte une unité de quota par lot de cinquante.
 */
export type WatchedVideo = {
  videoId: string;
  /** ISO 8601 — date à laquelle le flux nous l'a signalée. */
  seenAt: string;
};

export type StreamLink = {
  id: string;
  userId: User["id"];
  platform: StreamPlatform;
  /** Twitch : l'identifiant numérique du diffuseur. YouTube : la chaîne `UC…`. */
  channelId: string;
  /** Twitch : le `login`. YouTube : le handle `@…` quand la chaîne en a un. */
  channelLogin?: string;
  channelName?: string;
  /** L'adresse publique de la chaîne, pour le lien de l'écran de compte. */
  channelUrl?: string;
  targets: StreamTarget[];
  subscription: StreamSubscription;
  live?: StreamLinkLive | null;
  /** YouTube seulement. */
  watched?: WatchedVideo[];
  createdAt: string;
  updatedAt: string;
};
