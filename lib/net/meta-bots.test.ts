import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBlockedMetaBot } from "./meta-bots";

/**
 * Refus des robots sur la méta : les pages concernées, et les agents.
 *
 * Exécution : `npm run test`.
 */

const PERPLEXITY = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)";
const SERANKING = "Mozilla/5.0 (compatible; SERankingBacklinksBot/1.0; +https://seranking.com/backlinks-crawler)";
const GOOGLE = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("isBlockedMetaBot", () => {
  it("refuse les robots sur toutes les pages de méta", () => {
    for (const path of [
      "/en/games/riftbound/meta",
      "/fr/games/riftbound/meta",
      "/games/riftbound/meta",
      "/en/games/riftbound/meta/tournois/2026-11-01/rc-europe",
      "/fr/games/riftbound/meta/tournois/2026-11-01/rc-europe/joueurs/42",
    ]) {
      for (const agent of [PERPLEXITY, SERANKING, GOOGLE, null, ""]) {
        assert.ok(isBlockedMetaBot(path, agent), `${path} ouvert à ${agent}`);
      }
    }
  });

  it("laisse passer les navigateurs", () => {
    for (const agent of [FIREFOX, IPHONE]) {
      assert.ok(!isBlockedMetaBot("/en/games/riftbound/meta", agent));
      assert.ok(!isBlockedMetaBot("/fr/games/riftbound/meta/tournois/2026-11-01/rc-europe", agent));
    }
  });

  it("ne touche pas aux autres pages", () => {
    for (const path of ["/en/games/riftbound", "/en/games/riftbound/cards/OGN-001", "/fr/decks/meta/manage", "/en/games/riftbound/metagame"]) {
      assert.ok(!isBlockedMetaBot(path, PERPLEXITY), path);
    }
  });
});
