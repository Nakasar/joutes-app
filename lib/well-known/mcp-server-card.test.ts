import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildMcpServerCard, MCP_SERVER_INFO } from "./mcp-server-card";

/**
 * La carte du serveur MCP (SEP-1649).
 *
 * Une carte qui se trompe coûte plus qu'une carte absente : le client la lit
 * avant de se connecter, et décide sur elle. Ce qui est vérifié ici, ce sont
 * les deux façons dont elle peut mentir — annoncer un serveur qui n'est pas
 * celui qui répondra, et dériver de la poignée de main.
 *
 * Exécution : `npm run test`.
 */

const ORIGIN = "https://www.joutes.app";

describe("buildMcpServerCard", () => {
  it("dit le même nom et la même version que la poignée de main", () => {
    // `app/mcp/route.ts` passe `MCP_SERVER_INFO` à `createMcpHandler` : un
    // client qui compare `initialize` et la carte doit lire deux fois la même
    // chose, sans avoir à trancher.
    const card = buildMcpServerCard(ORIGIN);

    assert.deepEqual(card.serverInfo, { ...MCP_SERVER_INFO });
    assert.equal(card.version, MCP_SERVER_INFO.version);
  });

  it("est effectivement branchée sur le serveur", () => {
    // Garde-fou du précédent : ce test ne vaut que si `route.ts` lit bien la
    // même constante au lieu d'en garder une copie.
    const route = readFileSync("app/mcp/route.ts", "utf8");

    assert.match(route, /serverInfo:\s*MCP_SERVER_INFO/);
  });

  it("porte ce que le scanner et le schéma exigent", () => {
    const card = buildMcpServerCard(ORIGIN);

    assert.ok(card.name.length >= 3, `nom trop court : ${card.name}`);
    assert.ok(card.serverInfo.name, "serverInfo.name manquant");
    assert.ok(card.description.length <= 100, `description trop longue : ${card.description.length}`);
    assert.ok(card.$schema.startsWith("https://"));
  });

  it("mène au transport, en streamable-http", () => {
    const card = buildMcpServerCard(ORIGIN);
    const [remote] = card.remotes;

    assert.equal(remote.type, "streamable-http");
    assert.equal(remote.url, "https://www.joutes.app/mcp");
  });

  it("suit l'origine qui la sert", () => {
    // Servie aussi en préproduction et en local : y annoncer le transport de
    // production enverrait le client parler à une autre instance.
    const card = buildMcpServerCard("http://localhost:3000");

    assert.equal(card.remotes[0].url, "http://localhost:3000/mcp");
    assert.equal(card.websiteUrl, "http://localhost:3000/");
    for (const link of Object.values(card.documentation)) {
      assert.ok(link.startsWith("http://localhost:3000/"), `lien hors origine : ${link}`);
    }
  });

  it("annonce les capacités que la poignée de main annonce", () => {
    // Relevé sur le serveur : `initialize` renvoie
    // `{"tools":{"listChanged":true}}`. Un client qui compare la carte et la
    // poignée de main ne doit pas trouver deux réponses.
    //
    // Ni ressource ni prompt n'est enregistré : leurs clés absentes se lisent
    // « non pris en charge », alors qu'une clé vide se lirait l'inverse.
    const card = buildMcpServerCard(ORIGIN);

    assert.deepEqual(Object.keys(card.capabilities), ["tools"]);
    assert.equal(card.capabilities.tools.listChanged, true);
  });

  it("ne recopie pas la liste des outils", () => {
    // La spécification les écarte, et pour une bonne raison : recopiés ici,
    // ils seraient faux au premier outil ajouté. `tools/list` fait foi.
    const card = buildMcpServerCard(ORIGIN);
    const serialised = JSON.stringify(card);

    for (const tool of ["search_events", "get_collection", "create_tournament"]) {
      assert.ok(!serialised.includes(tool), `outil recopié dans la carte : ${tool}`);
    }
  });
});
