/**
 * Ce qu'il faut conclure d'une réponse d'Apple ou de Google.
 *
 * Un envoi qui échoue peut vouloir dire trois choses très différentes : que le
 * téléphone n'existe plus, que le service a hoqueté, ou que **notre** message
 * était fautif. Les confondre coûte cher dans les deux sens — croire à une
 * panne quand le jeton est mort, c'est réessayer indéfiniment ; croire à un
 * jeton mort quand le message est fautif, c'est effacer sa base d'appareils un
 * matin de déploiement.
 *
 * Module pur, testé sur des corps de réponse réels : c'est le garde-fou de
 * cette dernière méprise.
 */

export type PushOutcome =
  | "delivered"
  /** Le service a hoqueté : on réessaiera. */
  | "retry"
  /** Le téléphone n'existe plus : on supprime le jeton. */
  | "drop-token"
  /** Le jeton est bon, mais pas pour cet environnement APNs. */
  | "wrong-environment"
  /** Notre faute, ou la configuration : à journaliser, jamais à interpréter. */
  | "failed";

function reasonOf(body: unknown): string | null {
  if (body && typeof body === "object" && "reason" in body) {
    const reason = (body as { reason?: unknown }).reason;
    if (typeof reason === "string") return reason;
  }
  return null;
}

/**
 * Apple range tout dans un champ `reason`.
 *
 * `BadDeviceToken` ne veut **pas** dire que le jeton est mort : c'est aussi ce
 * qu'Apple répond à un jeton de développement présenté à la production, et
 * inversement. Le supprimer là serait détruire tout jeton issu d'un build local
 * à la première salve — d'où un verdict distinct, qui demande de réessayer sur
 * l'autre point d'entrée avant de conclure.
 *
 * Le vrai jeton mort, lui, est un 410 `Unregistered`, et il n'y a pas d'ambiguïté.
 */
export function classifyApnsResponse(status: number, body: unknown): PushOutcome {
  if (status >= 200 && status < 300) return "delivered";

  const reason = reasonOf(body);

  if (status === 410 || reason === "Unregistered") return "drop-token";
  if (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic") return "wrong-environment";
  if (status === 429 || status >= 500) return "retry";

  // 400 sur un autre motif, 403 sur le jeton fournisseur : notre configuration
  // est en cause, pas l'appareil.
  return "failed";
}

/**
 * Google range l'erreur dans `error`, avec un `status` textuel et un tableau
 * `details` typé.
 *
 * Le piège est `INVALID_ARGUMENT`. Il signale un jeton mort **seulement** quand
 * `details` porte un `FcmError` ; accompagné d'un `BadRequest`, il dit que
 * notre charge utile est fautive — un champ `data` non textuel, par exemple.
 * Traiter le second comme le premier supprime un appareil valide par message
 * envoyé, c'est-à-dire toute la base en une salve.
 */
export function classifyFcmResponse(status: number, body: unknown): PushOutcome {
  if (status >= 200 && status < 300) return "delivered";

  const error = (body as { error?: { status?: string; details?: unknown[] } } | null)?.error;
  const errorStatus = error?.status;
  const details = Array.isArray(error?.details) ? error.details : [];

  const hasFcmError = details.some(
    (detail) =>
      typeof (detail as { "@type"?: unknown })?.["@type"] === "string" &&
      (detail as { "@type": string })["@type"].endsWith("google.firebase.fcm.v1.FcmError")
  );

  if (status === 404 || errorStatus === "NOT_FOUND" || errorStatus === "UNREGISTERED") {
    return "drop-token";
  }

  if (errorStatus === "INVALID_ARGUMENT") {
    return hasFcmError ? "drop-token" : "failed";
  }

  if (status === 429 || errorStatus === "UNAVAILABLE" || status >= 500) return "retry";

  return "failed";
}
