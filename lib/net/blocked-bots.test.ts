import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBlockedBot } from "./blocked-bots";

/**
 * Robots refusés par le proxy : les robots d'IA hors MCP, et SE Ranking.
 *
 * Exécution : `npm run test`.
 */

const AI = {
  metaTraining: "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  gpt: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  chatgptUser: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
  claude: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  claudeUser: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
  perplexity: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  ccbot: "CCBot/2.0 (https://commoncrawl.org/faq/)",
  bytespider: "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
  amazon: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot) Chrome/119.0.6045.214 Safari/537.36",
};

const ALLOWED = {
  google: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  bing: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36",
  apple: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  duckduckgo: "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)",
  metaPreview: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  firefox: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
};

const SERANKING = "Mozilla/5.0 (compatible; SERankingBacklinksBot/1.0; +https://seranking.com/backlinks-crawler)";

const PAGES = ["/en/games/riftbound/cards/OGN-001", "/fr", "/en/login", "/api/games/riftbound/cards"];
const MCP = ["/mcp", "/.well-known/oauth-protected-resource/mcp", "/api/auth/oauth2/token", "/api/auth/oauth2/register"];

describe("isBlockedBot", () => {
  it("refuse les robots d'IA sur les pages et l'API", () => {
    for (const [name, agent] of Object.entries(AI)) {
      for (const path of PAGES) assert.ok(isBlockedBot(path, agent), `${name} admis sur ${path}`);
    }
    assert.ok(isBlockedBot("/en", AI.metaTraining.replace("meta-externalagent", "Meta-ExternalAgent")));
  });

  it("laisse aux robots d'IA le serveur MCP et sa connexion OAuth", () => {
    for (const [name, agent] of Object.entries(AI)) {
      for (const path of MCP) assert.ok(!isBlockedBot(path, agent), `${name} refusé sur ${path}`);
    }
    assert.ok(isBlockedBot("/mcpx", AI.gpt), "préfixe /mcp trop large");
  });

  it("garde les moteurs de recherche, les aperçus de liens et les navigateurs", () => {
    for (const [name, agent] of Object.entries(ALLOWED)) {
      for (const path of [...PAGES, ...MCP]) assert.ok(!isBlockedBot(path, agent), `${name} refusé sur ${path}`);
    }
  });

  it("refuse SE Ranking partout, MCP compris", () => {
    for (const path of [...PAGES, ...MCP]) assert.ok(isBlockedBot(path, SERANKING), path);
  });

  it("laisse passer une requête sans agent (l'app mobile n'en envoie pas toujours)", () => {
    assert.ok(!isBlockedBot("/en", null));
    assert.ok(!isBlockedBot("/en", ""));
  });
});
