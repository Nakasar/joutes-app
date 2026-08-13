import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyApnsResponse, classifyFcmResponse } from "./errors";

/**
 * Tests du classement des réponses, sur des corps réels.
 *
 * C'est le test qui empêche d'effacer la base d'appareils : une charge utile
 * fautive et un téléphone désinstallé se ressemblent beaucoup vus depuis une
 * réponse HTTP, et l'un se corrige quand l'autre est irréversible.
 *
 * Exécution : `npm run test`.
 */

describe("classifyApnsResponse", () => {
  it("un 200 est une livraison", () => {
    assert.equal(classifyApnsResponse(200, null), "delivered");
  });

  it("un 410 Unregistered est un téléphone qui n'existe plus", () => {
    assert.equal(classifyApnsResponse(410, { reason: "Unregistered" }), "drop-token");
  });

  it("BadDeviceToken n'est pas un jeton mort", () => {
    // C'est aussi ce qu'Apple répond à un jeton de développement présenté à la
    // production. Le supprimer détruirait tout jeton issu d'un build local à la
    // première salve.
    assert.equal(classifyApnsResponse(400, { reason: "BadDeviceToken" }), "wrong-environment");
    assert.equal(classifyApnsResponse(400, { reason: "DeviceTokenNotForTopic" }), "wrong-environment");
  });

  it("un service qui hoquette se réessaie", () => {
    assert.equal(classifyApnsResponse(429, { reason: "TooManyProviderTokenUpdates" }), "retry");
    assert.equal(classifyApnsResponse(503, { reason: "ServiceUnavailable" }), "retry");
  });

  it("notre configuration en cause ne touche pas à l'appareil", () => {
    assert.equal(classifyApnsResponse(403, { reason: "InvalidProviderToken" }), "failed");
    assert.equal(classifyApnsResponse(400, { reason: "BadTopic" }), "failed");
    assert.equal(classifyApnsResponse(400, { reason: "PayloadTooLarge" }), "failed");
  });
});

describe("classifyFcmResponse", () => {
  it("un 200 est une livraison", () => {
    assert.equal(classifyFcmResponse(200, { name: "projects/joutes/messages/1" }), "delivered");
  });

  it("UNREGISTERED est un téléphone qui n'existe plus", () => {
    assert.equal(
      classifyFcmResponse(404, {
        error: {
          code: 404,
          status: "NOT_FOUND",
          details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "UNREGISTERED" }],
        },
      }),
      "drop-token"
    );
  });

  it("INVALID_ARGUMENT avec un FcmError est un jeton mort", () => {
    assert.equal(
      classifyFcmResponse(400, {
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "INVALID_ARGUMENT" }],
        },
      }),
      "drop-token"
    );
  });

  it("INVALID_ARGUMENT avec un BadRequest est NOTRE faute", () => {
    // Le piège. Un champ `data` non textuel produit exactement ceci, pour tous
    // les appareils à la fois : le confondre avec un jeton mort supprimerait
    // toute la base en une salve.
    assert.equal(
      classifyFcmResponse(400, {
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          message: "Invalid JSON payload received.",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.BadRequest",
              fieldViolations: [{ field: "message.data[0].value", description: "Invalid value" }],
            },
          ],
        },
      }),
      "failed"
    );
  });

  it("un service qui hoquette se réessaie", () => {
    assert.equal(classifyFcmResponse(503, { error: { status: "UNAVAILABLE" } }), "retry");
    assert.equal(classifyFcmResponse(429, { error: { status: "RESOURCE_EXHAUSTED" } }), "retry");
  });

  it("un jeton d'accès refusé ne touche pas à l'appareil", () => {
    assert.equal(classifyFcmResponse(401, { error: { status: "UNAUTHENTICATED" } }), "failed");
    assert.equal(classifyFcmResponse(403, { error: { status: "PERMISSION_DENIED" } }), "failed");
  });
});
