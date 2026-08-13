import 'server-only';

import http2 from "node:http2";
import crypto from "node:crypto";
import type { ApnsConfig } from "@/lib/push/config";
import { apnsTokenIssuedAt, buildApnsJwt } from "@/lib/push/apns-jwt";
import { classifyApnsResponse, type PushOutcome } from "@/lib/push/errors";
import type { ApnsPayload } from "@/lib/push/payload";
import type { PushEnvironment } from "@/lib/types/PushDevice";

/**
 * L'envoi à Apple.
 *
 * `node:http2` et pas `fetch` : APNs n'accepte que HTTP/2 depuis 2021, et le
 * `fetch` de Node — undici — ne le parle pas. Ce n'est pas une préférence,
 * c'est la seule voie sans dépendance.
 *
 * Une session par salve, N flux multiplexés dedans. On ne réutilise pas la
 * session d'une invocation à l'autre : sur Vercel, l'instance peut disparaître
 * entre deux, et une session morte gardée en mémoire coûte plus cher que la
 * poignée de main qu'elle économise.
 */

const PRODUCTION_HOST = "https://api.push.apple.com";
const SANDBOX_HOST = "https://api.sandbox.push.apple.com";

/** Au-delà, APNs renvoie un GOAWAY et coupe la session. */
const MAX_CONCURRENT_STREAMS = 100;

/** Une alerte de tournoi n'a plus d'intérêt le lendemain. */
const EXPIRATION_SECONDS = 24 * 60 * 60;

export type ApnsTarget = { token: string; environment?: PushEnvironment };

export type PushSendResult = {
  token: string;
  outcome: PushOutcome;
  status?: number;
  reason?: string;
  /** Renseigné quand le second passage a tranché : l'environnement à retenir en base. */
  environment?: PushEnvironment;
};

/**
 * Le jeton fournisseur, mémorisé pour la demi-heure en cours. Le calcul est peu
 * coûteux, mais Apple compte les renouvellements et refuse au-delà d'un par
 * vingt minutes.
 */
let cachedJwt: { token: string; issuedAt: number } | null = null;

function providerToken(config: ApnsConfig): string {
  const issuedAt = apnsTokenIssuedAt();
  if (cachedJwt && cachedJwt.issuedAt === issuedAt) return cachedJwt.token;

  const token = buildApnsJwt({
    keyId: config.keyId,
    teamId: config.teamId,
    privateKey: config.privateKey,
    issuedAt,
  });
  cachedJwt = { token, issuedAt };
  return token;
}

function hostFor(environment: PushEnvironment | undefined): string {
  return environment === "sandbox" ? SANDBOX_HOST : PRODUCTION_HOST;
}

/** L'environnement à essayer après un refus, pour départager le jeton du build. */
function otherEnvironment(environment: PushEnvironment | undefined): PushEnvironment {
  return environment === "sandbox" ? "production" : "sandbox";
}

type StreamResult = { status: number; body: unknown };

function sendOne(
  session: http2.ClientHttp2Session,
  token: string,
  body: string,
  headers: Record<string, string>
): Promise<StreamResult> {
  return new Promise((resolve, reject) => {
    const stream = session.request({
      ...headers,
      [http2.constants.HTTP2_HEADER_METHOD]: "POST",
      [http2.constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
    });

    let status = 0;
    // `setEncoding` ci-dessous fait émettre des chaînes, pas des `Buffer` : on
    // les accumule telles quelles. Les concaténer comme des tampons lèverait
    // un `TypeError`, et aucune réponse d'Apple ne serait jamais lue.
    const chunks: string[] = [];

    stream.on("response", (responseHeaders) => {
      status = Number(responseHeaders[http2.constants.HTTP2_HEADER_STATUS] ?? 0);
    });
    stream.on("data", (chunk: string) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => {
      const raw = chunks.join("");
      let parsed: unknown = null;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          // Apple répond parfois en texte brut sur une erreur d'infrastructure.
          parsed = { reason: raw.slice(0, 120) };
        }
      }
      resolve({ status, body: parsed });
    });

    stream.setEncoding("utf8");
    stream.end(body);
  });
}

async function openSession(host: string): Promise<http2.ClientHttp2Session> {
  return new Promise((resolve, reject) => {
    const session = http2.connect(host);
    const onError = (error: Error) => {
      session.destroy();
      reject(error);
    };
    session.once("error", onError);
    session.once("connect", () => {
      session.off("error", onError);
      resolve(session);
    });
  });
}

/** Découpe en tranches pour ne pas dépasser le nombre de flux qu'APNs accepte. */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function sendToHost(
  config: ApnsConfig,
  host: string,
  targets: ApnsTarget[],
  payload: ApnsPayload,
  options: { collapseId?: string }
): Promise<PushSendResult[]> {
  if (targets.length === 0) return [];

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    authorization: `bearer ${providerToken(config)}`,
    "apns-topic": config.bundleId,
    // Obligatoire depuis iOS 13 : sans lui, APNs refuse la requête.
    "apns-push-type": "alert",
    "apns-priority": "10",
    "apns-expiration": String(Math.floor(Date.now() / 1000) + EXPIRATION_SECONDS),
    ...(options.collapseId ? { "apns-collapse-id": options.collapseId.slice(0, 64) } : {}),
  };

  const session = await openSession(host);
  const results: PushSendResult[] = [];

  try {
    for (const slice of chunk(targets, MAX_CONCURRENT_STREAMS)) {
      const settled = await Promise.all(
        slice.map(async (target): Promise<PushSendResult> => {
          try {
            const { status, body: responseBody } = await sendOne(session, target.token, body, {
              ...headers,
              // Un identifiant par message : c'est ce qu'on retrouve dans les
              // journaux d'Apple quand il faut expliquer une non-réception.
              "apns-id": crypto.randomUUID(),
            });
            const reason =
              responseBody && typeof responseBody === "object" && "reason" in responseBody
                ? String((responseBody as { reason?: unknown }).reason)
                : undefined;
            return { token: target.token, outcome: classifyApnsResponse(status, responseBody), status, reason };
          } catch (error) {
            // Un flux coupé n'est pas un jeton mort : c'est le réseau.
            return { token: target.token, outcome: "retry", reason: (error as Error).message };
          }
        })
      );
      results.push(...settled);
    }
  } finally {
    session.close();
  }

  return results;
}

/**
 * Envoie une alerte aux appareils iOS donnés.
 *
 * Le second passage mérite un mot. Un jeton issu d'un build de développement ne
 * vaut que sur le bac à sable d'Apple, celui d'un build TestFlight que sur la
 * production — et le croisement se solde par un `BadDeviceToken`, indiscernable
 * d'un jeton invalide. Plutôt que de supprimer l'appareil sur ce seul indice,
 * on rejoue une fois sur l'autre point d'entrée. Ce qui marche là est un jeton
 * valide dont on avait mal noté l'environnement ; l'appelant le retient, et le
 * second passage n'aura plus lieu.
 */
export async function sendApns(
  config: ApnsConfig,
  targets: ApnsTarget[],
  payload: ApnsPayload,
  options: { collapseId?: string } = {}
): Promise<PushSendResult[]> {
  if (targets.length === 0) return [];

  const byEnvironment = new Map<string, ApnsTarget[]>();
  for (const target of targets) {
    const host = hostFor(target.environment);
    byEnvironment.set(host, [...(byEnvironment.get(host) ?? []), target]);
  }

  const first = (
    await Promise.all(
      [...byEnvironment].map(([host, hostTargets]) =>
        sendToHost(config, host, hostTargets, payload, options)
      )
    )
  ).flat();

  const misplaced = first.filter((result) => result.outcome === "wrong-environment");
  if (misplaced.length === 0) return first;

  const retryTargets = misplaced.map((result) => {
    const original = targets.find((target) => target.token === result.token);
    return { token: result.token, environment: otherEnvironment(original?.environment) };
  });

  const retried = (
    await Promise.all(
      [...new Set(retryTargets.map((target) => hostFor(target.environment)))].map((host) =>
        sendToHost(
          config,
          host,
          retryTargets.filter((target) => hostFor(target.environment) === host),
          payload,
          options
        )
      )
    )
  ).flat();

  const retryEnvironments = new Map(retryTargets.map((target) => [target.token, target.environment]));

  const retriedByToken = new Map(
    retried.map((result) => [
      result.token,
      result.outcome === "wrong-environment"
        ? // Refusé des deux côtés : cette fois, c'est bien un jeton mort.
          { ...result, outcome: "drop-token" as const }
        : // Accepté ailleurs : on avait mal noté son environnement. L'appelant
          // le corrige en base, et le second passage n'aura plus lieu.
          { ...result, environment: retryEnvironments.get(result.token) },
    ])
  );

  return first.map((result) => retriedByToken.get(result.token) ?? result);
}
