/**
 * Ce qu'on met dans un push.
 *
 * Apple et Google veulent chacun leur enveloppe, mais le contenu est le même :
 * un titre, un corps, et de quoi retrouver la notification quand l'utilisateur
 * touche l'alerte. Ce module fabrique les deux à partir d'un seul objet, et
 * c'est là que se règlent les longueurs — une notification Joutes n'a pas de
 * limite, une alerte de téléphone si.
 *
 * Module pur, sans réseau : c'est ce qui le rend testable, et la forme des
 * enveloppes est exactement ce qui mérite de l'être.
 */

/**
 * Ce qu'une alerte affiche avant d'être coupée par le système. iOS et Android
 * tronquent différemment et selon l'appareil ; ces bornes visent le lisible,
 * pas la limite technique (la charge APNs tient 4 Ko, on en est loin).
 */
export const MAX_PUSH_TITLE_LENGTH = 120;
export const MAX_PUSH_BODY_LENGTH = 300;

export type PushContent = {
  title: string;
  body: string;
  /** Chemin relatif de Joutes, ou `null` si la notification ne mène nulle part. */
  link: string | null;
  notificationId: string;
  /** Regroupe les rappels successifs d'une même ronde en une seule alerte. */
  collapseId?: string;
};

/**
 * Coupe au dernier mot entier qui tient, et marque la coupure.
 *
 * `Intl.Segmenter` plutôt qu'un `slice` : un emoji, une lettre accentuée
 * décomposée ou un drapeau tiennent en plusieurs unités de code, et les couper
 * en deux produit le losange noir à point d'interrogation.
 */
export function truncatePushText(value: string, maxLength: number): string {
  const text = value.replace(/\s+/g, " ").trim();

  const segmenter = new Intl.Segmenter("fr", { granularity: "grapheme" });
  const graphemes = [...segmenter.segment(text)].map((entry) => entry.segment);
  if (graphemes.length <= maxLength) return text;

  const cut = graphemes.slice(0, maxLength - 1).join("");
  const lastSpace = cut.lastIndexOf(" ");
  // Un mot plus long que la limite entière : mieux vaut le couper que ne rien
  // rendre du tout.
  const kept = lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut;

  return `${kept.replace(/[\s,;:.]+$/, "")}…`;
}

export type ApnsPayload = {
  aps: {
    alert: { title: string; body: string };
    sound: "default";
    "mutable-content": 1;
  };
  joutes: { id: string; link: string | null };
};

/**
 * L'enveloppe d'Apple.
 *
 * `mutable-content` laisse la porte ouverte à une extension de service (une
 * image de carte, un avatar) sans avoir à retoucher le serveur le jour venu.
 *
 * Pas de `badge` : le compte des non-lues demande l'agrégation complète de
 * `getUserNotifications`, par destinataire — impensable dans un fan-out qui en
 * touche des centaines. L'app pose son propre badge à l'ouverture, en
 * demandant le compte à l'API. Absence délibérée.
 */
export function buildApnsPayload(content: PushContent): ApnsPayload {
  return {
    aps: {
      alert: {
        title: truncatePushText(content.title, MAX_PUSH_TITLE_LENGTH),
        body: truncatePushText(content.body, MAX_PUSH_BODY_LENGTH),
      },
      sound: "default",
      "mutable-content": 1,
    },
    joutes: { id: content.notificationId, link: content.link },
  };
}

export type FcmMessage = {
  notification: { title: string; body: string };
  data: Record<string, string>;
  android: { priority: "high"; notification: { default_sound: true } };
};

/**
 * L'enveloppe de Google. `message.token` est ajouté par l'appelant, appareil
 * par appareil : l'API v1 n'a pas d'équivalent au `sendMulticast` d'autrefois.
 *
 * `data` n'accepte **que** des chaînes de caractères — un nombre ou un `null`
 * fait rejeter tout le message. D'où le `link` rendu en chaîne vide plutôt
 * qu'absent : l'app lit une chaîne vide comme « pas de destination ».
 */
export function buildFcmMessage(content: PushContent): FcmMessage {
  return {
    notification: {
      title: truncatePushText(content.title, MAX_PUSH_TITLE_LENGTH),
      body: truncatePushText(content.body, MAX_PUSH_BODY_LENGTH),
    },
    data: { id: content.notificationId, link: content.link ?? "" },
    android: { priority: "high", notification: { default_sound: true } },
  };
}
