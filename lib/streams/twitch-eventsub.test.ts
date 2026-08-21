import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";

import {
  readTwitchChallenge,
  readTwitchNotification,
  twitchSignature,
  verifyTwitchSignature,
} from "./twitch-eventsub";

/**
 * La porte d'entrée de Twitch chez nous.
 *
 * Ce que ces cas verrouillent : la signature porte sur les **octets reçus**
 * précédés de l'identifiant et de l'horodatage — un corps re-sérialisé ne passe
 * pas —, une livraison ancienne ne passe pas non plus, et une charge utile à
 * moitié remplie ne devient jamais un direct.
 *
 * Exécution : `npm run test`.
 */

const SECRET = "un-secret-de-webhook-assez-long";

function sign(messageId: string, timestamp: string, rawBody: string) {
  return twitchSignature({ messageId, timestamp, rawBody, secret: SECRET });
}

describe("verifyTwitchSignature", () => {
  const now = Date.parse("2026-03-01T12:00:00.000Z");
  const timestamp = "2026-03-01T11:59:30.000Z";
  const messageId = "8d8fa82b-9792-79da-4eb8-a9dd0d0f8b3d";
  const rawBody = '{"subscription":{"type":"stream.online"},"event":{"broadcaster_user_id":"1234"}}';

  it("accepte une livraison authentique et récente", () => {
    assert.equal(
      verifyTwitchSignature({
        messageId,
        timestamp,
        rawBody,
        signature: sign(messageId, timestamp, rawBody),
        secret: SECRET,
        now,
      }),
      true,
    );
  });

  it("refuse un corps re-sérialisé", () => {
    // L'erreur classique : vérifier `JSON.stringify(await req.json())` plutôt que
    // `await req.text()`. Les deux JSON disent la même chose, pas les mêmes octets.
    const reserialized = JSON.stringify(JSON.parse(rawBody), null, 2);

    assert.equal(
      verifyTwitchSignature({
        messageId,
        timestamp,
        rawBody: reserialized,
        signature: sign(messageId, timestamp, rawBody),
        secret: SECRET,
        now,
      }),
      false,
    );
  });

  it("refuse une livraison hors de la fenêtre de rejeu", () => {
    const old = "2026-03-01T11:00:00.000Z";

    assert.equal(
      verifyTwitchSignature({
        messageId,
        timestamp: old,
        rawBody,
        signature: sign(messageId, old, rawBody),
        secret: SECRET,
        now,
      }),
      false,
    );
  });

  it("refuse une signature d'un autre secret", () => {
    const forged = `sha256=${crypto
      .createHmac("sha256", "un-autre-secret")
      .update(`${messageId}${timestamp}${rawBody}`, "utf8")
      .digest("hex")}`;

    assert.equal(
      verifyTwitchSignature({ messageId, timestamp, rawBody, signature: forged, secret: SECRET, now }),
      false,
    );
  });

  it("refuse plutôt que de jeter sur des en-têtes malformés", () => {
    // `timingSafeEqual` jette sur deux tampons de longueurs différentes : sans le
    // contrôle préalable, un en-tête tronqué deviendrait une erreur 500.
    for (const signature of [null, "", "sha256=trop-court", "pas-du-tout-une-signature"]) {
      assert.equal(
        verifyTwitchSignature({ messageId, timestamp, rawBody, signature, secret: SECRET, now }),
        false,
      );
    }

    assert.equal(
      verifyTwitchSignature({
        messageId,
        timestamp: "pas-une-date",
        rawBody,
        signature: sign(messageId, "pas-une-date", rawBody),
        secret: SECRET,
        now,
      }),
      false,
    );
  });

  it("refuse quand le secret manque", () => {
    assert.equal(
      verifyTwitchSignature({
        messageId,
        timestamp,
        rawBody,
        signature: sign(messageId, timestamp, rawBody),
        secret: null,
        now,
      }),
      false,
    );
  });
});

describe("readTwitchNotification", () => {
  it("lit un début de direct", () => {
    const notification = readTwitchNotification({
      subscription: { type: "stream.online" },
      event: {
        id: "9001",
        broadcaster_user_id: "1234",
        broadcaster_user_login: "antretemps",
        broadcaster_user_name: "AntreTemps",
        started_at: "2026-03-01T11:58:00Z",
      },
    });

    assert.equal(notification.kind, "online");
    assert.deepEqual(notification.kind === "online" ? notification.event : null, {
      broadcasterUserId: "1234",
      broadcasterUserLogin: "antretemps",
      broadcasterUserName: "AntreTemps",
      startedAt: "2026-03-01T11:58:00Z",
      streamId: "9001",
    });
  });

  it("lit une fin de direct", () => {
    const notification = readTwitchNotification({
      subscription: { type: "stream.offline" },
      event: { broadcaster_user_id: "1234" },
    });

    assert.deepEqual(notification, { kind: "offline", broadcasterUserId: "1234" });
  });

  it("ne fabrique pas un direct sans nom de chaîne", () => {
    // Sans `login`, il n'y a pas d'URL de direct à annoncer : mieux vaut ignorer
    // que poser un lien vers nulle part sur la vitrine d'un lieu.
    const notification = readTwitchNotification({
      subscription: { type: "stream.online" },
      event: { broadcaster_user_id: "1234" },
    });

    assert.equal(notification.kind, "unknown");
  });

  it("ignore ce qu'elle ne connaît pas", () => {
    assert.equal(readTwitchNotification(null).kind, "unknown");
    assert.equal(readTwitchNotification("bonjour").kind, "unknown");
    assert.equal(
      readTwitchNotification({ subscription: { type: "channel.follow" }, event: { broadcaster_user_id: "1" } }).kind,
      "unknown",
    );
  });
});

describe("readTwitchChallenge", () => {
  it("rend le défi de vérification", () => {
    assert.equal(readTwitchChallenge({ challenge: "pogchamp" }), "pogchamp");
  });

  it("rend null quand il n'y en a pas", () => {
    assert.equal(readTwitchChallenge({}), null);
    assert.equal(readTwitchChallenge({ challenge: "" }), null);
    assert.equal(readTwitchChallenge(null), null);
  });
});
