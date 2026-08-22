import "server-only";

import {
  getStreamLinkById,
  mergeStreamLinkSubscription,
  setStreamLinkSubscription,
} from "@/lib/db/stream-links";
import { retractLive } from "@/lib/streams/announce";
import { streamPlatformListeningConfigured } from "@/lib/streams/config";
import { deleteTwitchSubscription, subscribeToTwitchStream } from "@/lib/streams/twitch-api";
import { subscribeToYouTubeChannel, unsubscribeFromYouTubeChannel } from "@/lib/streams/youtube-api";
import type { StreamLink } from "@/lib/types/StreamLink";

/**
 * L'écoute suit les destinations.
 *
 * Une liaison sans destination n'écoute rien : il n'y aurait rien à annoncer, et
 * Twitch comme Google plafonnent le nombre d'abonnements d'une application. La
 * règle tient en une phrase — **au moins une destination, une écoute ; plus
 * aucune, plus d'écoute** — et c'est `syncSubscription` qui l'applique, appelée
 * après chaque changement de destinations et à chaque tour du cron.
 *
 * Les deux plateformes n'ont pas la même notion d'« abonné » :
 *
 * - Twitch confirme tout de suite (l'abonnement naît `webhook_callback_verification_pending`
 *   et passe `enabled` dès notre réponse au défi, quelques centaines de
 *   millisecondes plus tard). On note `pending`, le webhook écrira `active`.
 * - Le hub WebSub confirme de façon asynchrone, en rappelant notre adresse.
 *   Même chose, mais l'attente peut durer quelques secondes.
 *
 * Dans les deux cas l'écran de compte montre « en attente » puis « active »,
 * sans que l'utilisateur ait rien à faire.
 */

/**
 * Demande l'écoute à la plateforme et note ce qui en revient.
 *
 * L'ordre des écritures n'est pas cosmétique. « En attente » est posé **avant**
 * l'appel, et le retour ne range que les identifiants : la confirmation peut
 * arriver sur notre webhook avant même que la plateforme ne nous ait répondu, et
 * l'écraser laisserait une liaison marquée « en attente » pour toujours. Seul
 * l'échec réécrit l'état — il n'y a alors aucune confirmation à perdre.
 */
export async function subscribeLink(link: StreamLink): Promise<void> {
  if (!streamPlatformListeningConfigured(link.platform)) {
    await setStreamLinkSubscription(link.id, { state: "failed", lastError: "plateforme-non-configuree" });
    return;
  }

  await mergeStreamLinkSubscription(link.id, { state: "pending", lastError: undefined });

  if (link.platform === "twitch") {
    const result = await subscribeToTwitchStream(link.channelId);

    if (!result.ok) {
      await setStreamLinkSubscription(link.id, { state: "failed", lastError: result.error });
      return;
    }

    if (result.ids.length > 0) {
      await mergeStreamLinkSubscription(link.id, { ids: result.ids });
    }

    return;
  }

  const result = await subscribeToYouTubeChannel(link.channelId);

  if (!result.ok) {
    await setStreamLinkSubscription(link.id, { state: "failed", lastError: result.error });
  }
}

export async function unsubscribeLink(link: StreamLink): Promise<void> {
  if (link.platform === "twitch") {
    await Promise.all((link.subscription.ids ?? []).map((id) => deleteTwitchSubscription(id)));
  } else {
    await unsubscribeFromYouTubeChannel(link.channelId);
  }
}

/**
 * Aligne l'écoute sur les destinations de la liaison.
 *
 * Idempotente : une liaison déjà en règle n'entraîne aucun appel réseau. C'est
 * ce qui permet de l'appeler sans réfléchir après chaque modification et à
 * chaque tour du cron.
 *
 * `force` relance l'abonnement même s'il se croit actif — c'est le chemin du
 * cron, qui renouvelle un bail WebSub avant son échéance et rattrape un
 * abonnement révoqué par Twitch.
 */
export async function syncSubscription(link: StreamLink, force = false): Promise<StreamLink> {
  const wanted = link.targets.length > 0;
  const listening = link.subscription.state === "active" || link.subscription.state === "pending";

  if (wanted && (!listening || force)) {
    await subscribeLink(link);
    return (await getStreamLinkById(link.id)) ?? link;
  }

  if (!wanted && (listening || link.subscription.state === "failed")) {
    // Plus de destination : on éteint d'abord ce qui est affiché, sans quoi un
    // direct en cours resterait sur une vitrine que plus rien ne viendra
    // rafraîchir.
    const retracted = (await retractLive(link)) ?? link;
    await unsubscribeLink(retracted);

    return (await setStreamLinkSubscription(retracted.id, { state: "idle" })) ?? retracted;
  }

  return link;
}

/**
 * Défait tout : le direct affiché, l'écoute, et rien d'autre.
 *
 * Le chemin de la déliaison d'un compte. La liaison elle-même est supprimée par
 * l'appelant — cette fonction ne fait que rendre le monde extérieur cohérent
 * avant sa disparition.
 */
export async function teardownLink(linkId: string): Promise<void> {
  const link = await getStreamLinkById(linkId);

  if (!link) {
    return;
  }

  const retracted = (await retractLive(link)) ?? link;
  await unsubscribeLink(retracted);
}
