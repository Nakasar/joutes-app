import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import { webhookMembersUpdate } from "./__fixtures__/identity";
import { isPatreonTrigger, patreonSignature, verifyPatreonSignature } from "./webhook";

/**
 * Vérification de la signature des webhooks Patreon.
 *
 * Le test qui compte vraiment est celui du corps re-sérialisé : c'est l'erreur
 * commise par le webhook Discord de ce dépôt, et celle qu'on ne veut pas voir
 * réapparaître ici par imitation.
 *
 * Exécution : `npm run test`.
 */

const SECRET = "secret-de-test";
const CORPS = '{"data":{"id":"member-1"}}';

describe("patreonSignature", () => {
  it("produit l'empreinte HMAC-MD5 hexadécimale attendue", () => {
    // Calculée indépendamment de l'implémentation, pour que le test échoue si
    // l'algorithme ou l'encodage changent.
    const attendue = crypto.createHmac("md5", SECRET).update(CORPS, "utf8").digest("hex");

    assert.equal(patreonSignature(CORPS, SECRET), attendue);
    assert.equal(patreonSignature(CORPS, SECRET).length, 32);
  });
});

describe("verifyPatreonSignature", () => {
  it("accepte une signature valide", () => {
    assert.equal(verifyPatreonSignature(CORPS, patreonSignature(CORPS, SECRET), SECRET), true);
  });

  it("refuse un corps modifié d'un seul caractère", () => {
    const signature = patreonSignature(CORPS, SECRET);

    assert.equal(verifyPatreonSignature(CORPS.replace("member-1", "member-2"), signature, SECRET), false);
  });

  it("refuse une signature produite avec un autre secret", () => {
    assert.equal(verifyPatreonSignature(CORPS, patreonSignature(CORPS, "autre"), SECRET), false);
  });

  it("refuse un en-tête absent ou vide", () => {
    assert.equal(verifyPatreonSignature(CORPS, null, SECRET), false);
    assert.equal(verifyPatreonSignature(CORPS, undefined, SECRET), false);
    assert.equal(verifyPatreonSignature(CORPS, "", SECRET), false);
  });

  it("ferme quand le secret n'est pas configuré", () => {
    // Un aperçu sans secret ne doit pas accepter n'importe quoi : il refuse.
    assert.equal(verifyPatreonSignature(CORPS, patreonSignature(CORPS, SECRET), null), false);
    assert.equal(verifyPatreonSignature(CORPS, patreonSignature(CORPS, SECRET), ""), false);
  });

  it("refuse une signature de longueur invalide sans jeter", () => {
    // `timingSafeEqual` lève sur des longueurs différentes : sans le contrôle
    // préalable, un en-tête malformé deviendrait une erreur 500 au lieu d'un
    // refus propre.
    assert.doesNotThrow(() => verifyPatreonSignature(CORPS, "abc", SECRET));
    assert.equal(verifyPatreonSignature(CORPS, "abc", SECRET), false);
    assert.equal(verifyPatreonSignature(CORPS, "z".repeat(64), SECRET), false);
  });

  it("distingue un corps brut d'un corps re-sérialisé", () => {
    // LE test de non-régression. `app/discord/route.ts` vérifie
    // `JSON.stringify(await req.json())` : un aller-retour par JSON.parse qui
    // ne conserve ni les espaces ni l'ordre d'origine. Ici, la charge utile
    // reçue est indentée comme Patreon l'envoie, et sa re-sérialisation compacte
    // donne une autre empreinte — donc un refus.
    const recu = JSON.stringify(webhookMembersUpdate, null, 2);
    const reserialise = JSON.stringify(JSON.parse(recu));

    assert.notEqual(recu, reserialise);
    assert.notEqual(patreonSignature(recu, SECRET), patreonSignature(reserialise, SECRET));

    const signature = patreonSignature(recu, SECRET);
    assert.equal(verifyPatreonSignature(recu, signature, SECRET), true);
    assert.equal(verifyPatreonSignature(reserialise, signature, SECRET), false);
  });
});

describe("isPatreonTrigger", () => {
  it("reconnaît les déclencheurs v2", () => {
    assert.equal(isPatreonTrigger("members:update"), true);
    assert.equal(isPatreonTrigger("members:pledge:delete"), true);
  });

  it("refuse les déclencheurs v1, retirés le 7 octobre 2026", () => {
    assert.equal(isPatreonTrigger("pledges:create"), false);
    assert.equal(isPatreonTrigger("pledges:delete"), false);
  });

  it("refuse une propriété héritée du prototype", () => {
    assert.equal(isPatreonTrigger("toString"), false);
  });
});
