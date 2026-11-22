import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBlockedBot } from "./blocked-bots";

/**
 * Robots refusés sur tout le site.
 *
 * Exécution : `npm run test`.
 */

const META_TRAINING = "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)";
const META_PREVIEW = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const SERANKING = "Mozilla/5.0 (compatible; SERankingBacklinksBot/1.0; +https://seranking.com/backlinks-crawler)";
const GOOGLE = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";

describe("isBlockedBot", () => {
  it("refuse le robot d'entraînement de Meta et SE Ranking", () => {
    assert.ok(isBlockedBot(META_TRAINING));
    assert.ok(isBlockedBot(META_TRAINING.replace("meta-externalagent", "Meta-ExternalAgent")));
    assert.ok(isBlockedBot(SERANKING));
  });

  it("garde les aperçus de liens de Meta, les moteurs et les navigateurs", () => {
    for (const agent of [META_PREVIEW, GOOGLE, FIREFOX]) assert.ok(!isBlockedBot(agent), agent);
  });

  it("laisse passer une requête sans agent (l'app mobile n'en envoie pas toujours)", () => {
    assert.ok(!isBlockedBot(null));
    assert.ok(!isBlockedBot(""));
  });
});
