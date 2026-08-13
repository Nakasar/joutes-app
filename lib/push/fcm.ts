import 'server-only';

import type { FcmConfig } from "@/lib/push/config";
import { GCP_TOKEN_ENDPOINT, buildGcpAssertion } from "@/lib/push/gcp-jwt";
import { classifyFcmResponse } from "@/lib/push/errors";
import type { PushSendResult } from "@/lib/push/apns";
import type { FcmMessage } from "@/lib/push/payload";

/**
 * L'envoi à Google.
 *
 * Rien de la gymnastique d'APNs ici : FCM sert en HTTP/1.1, `fetch` suffit. En
 * revanche l'API en version 1 n'a plus d'équivalent au `sendMulticast`
 * d'autrefois — c'est **une requête par appareil**, et c'est la raison des
 * paquets ci-dessous.
 */

/** Assez pour ne pas traîner, pas assez pour se faire limiter. */
const CONCURRENCY = 50;

/**
 * Le jeton d'accès, mémorisé. Google le donne pour une heure ; on le reprend un
 * peu avant, pour ne pas se faire refuser au dernier moment.
 */
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function accessToken(config: FcmConfig): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const response = await fetch(GCP_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildGcpAssertion({ clientEmail: config.clientEmail, privateKey: config.privateKey }),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Jeton d'accès FCM refusé (${response.status}) : ${detail.slice(0, 200)}`);
  }

  const body = (await response.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };

  return body.access_token;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function sendFcm(
  config: FcmConfig,
  tokens: string[],
  message: FcmMessage,
  options: { collapseId?: string } = {}
): Promise<PushSendResult[]> {
  if (tokens.length === 0) return [];

  const token = await accessToken(config);
  const endpoint = `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`;
  const results: PushSendResult[] = [];

  for (const slice of chunk(tokens, CONCURRENCY)) {
    const settled = await Promise.all(
      slice.map(async (deviceToken): Promise<PushSendResult> => {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: deviceToken,
                ...message,
                // Le regroupement d'Android passe par une étiquette, là où
                // Apple a un en-tête. Même intention : un rappel de ronde
                // remplace le précédent au lieu de s'empiler.
                ...(options.collapseId
                  ? { android: { ...message.android, collapse_key: options.collapseId } }
                  : {}),
              },
            }),
          });

          const body = await response.json().catch(() => null);
          const reason =
            body && typeof body === "object" && "error" in body
              ? String((body as { error?: { status?: unknown } }).error?.status ?? "")
              : undefined;

          return {
            token: deviceToken,
            outcome: classifyFcmResponse(response.status, body),
            status: response.status,
            reason: reason || undefined,
          };
        } catch (error) {
          // Une requête qui n'aboutit pas n'est pas un jeton mort.
          return { token: deviceToken, outcome: "retry", reason: (error as Error).message };
        }
      })
    );
    results.push(...settled);
  }

  return results;
}
