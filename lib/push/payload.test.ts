import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_PUSH_BODY_LENGTH,
  MAX_PUSH_TITLE_LENGTH,
  buildApnsPayload,
  buildFcmMessage,
  truncatePushText,
} from "./payload";

/**
 * Tests des enveloppes de push.
 *
 * Deux choses s'y jouent : ne jamais couper un caractère en deux — un emoji
 * tranché s'affiche en losange noir — et ne mettre que des chaînes dans le
 * `data` de FCM, qui rejette le message entier au premier nombre.
 *
 * Exécution : `npm run test`.
 */

const content = {
  title: "Coupe de printemps — intervalle 3",
  body: "Vous affrontez Nakasar. Organisez votre partie avant vendredi.",
  link: "/tournaments/t1",
  notificationId: "n1",
};

describe("truncatePushText", () => {
  it("laisse passer ce qui tient", () => {
    assert.equal(truncatePushText("Court", 50), "Court");
  });

  it("normalise les espaces", () => {
    assert.equal(truncatePushText("  deux   lignes\net un retour ", 50), "deux lignes et un retour");
  });

  it("coupe au dernier mot entier et marque la coupure", () => {
    const text = `${"mot ".repeat(40)}fin`;
    const cut = truncatePushText(text, 60);

    assert.ok(cut.length <= 60, `longueur : ${cut.length}`);
    assert.ok(/mot…$/.test(cut), cut);
  });

  it("ne coupe pas un emoji en deux", () => {
    // Un drapeau tient en quatre unités de code : un `slice` naïf le laisserait
    // à moitié, et le système afficherait le losange noir à point
    // d'interrogation.
    const cut = truncatePushText(`${"a".repeat(18)} 🇫🇷🇩🇪🇮🇹`, 20);

    assert.ok(!cut.includes("�"), cut);
    assert.ok([...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(cut)].length <= 20);
  });

  it("coupe un mot plus long que la limite plutôt que de ne rien rendre", () => {
    const cut = truncatePushText("Anticonstitutionnellement", 10);

    assert.equal(cut.length, 10);
    assert.ok(cut.endsWith("…"));
  });
});

describe("buildApnsPayload", () => {
  it("porte l'alerte, le son et de quoi retrouver la notification", () => {
    assert.deepEqual(buildApnsPayload(content), {
      aps: {
        alert: { title: content.title, body: content.body },
        sound: "default",
        "mutable-content": 1,
      },
      joutes: { id: "n1", link: "/tournaments/t1" },
    });
  });

  it("ne porte pas de badge", () => {
    // Absence délibérée : le compte des non-lues demande une agrégation par
    // destinataire, impensable dans un fan-out. L'app pose le sien à
    // l'ouverture.
    assert.ok(!("badge" in buildApnsPayload(content).aps));
  });

  it("tronque le titre et le corps", () => {
    const payload = buildApnsPayload({
      ...content,
      title: "t ".repeat(200),
      body: "b ".repeat(400),
    });

    assert.ok(payload.aps.alert.title.length <= MAX_PUSH_TITLE_LENGTH);
    assert.ok(payload.aps.alert.body.length <= MAX_PUSH_BODY_LENGTH);
  });
});

describe("buildFcmMessage", () => {
  it("ne met que des chaînes dans data", () => {
    // FCM rejette le message entier au premier nombre ou `null`.
    const message = buildFcmMessage(content);

    for (const [key, value] of Object.entries(message.data)) {
      assert.equal(typeof value, "string", `data.${key} n'est pas une chaîne`);
    }
  });

  it("rend une chaîne vide plutôt qu'un lien absent", () => {
    assert.equal(buildFcmMessage({ ...content, link: null }).data.link, "");
  });

  it("demande la priorité haute à Android", () => {
    assert.equal(buildFcmMessage(content).android.priority, "high");
  });
});
