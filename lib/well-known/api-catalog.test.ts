import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ADVERTISED_PATHS,
  buildApiCatalog,
  HOMEPAGE_LINK_HEADER,
} from "./api-catalog";

/**
 * Ce que Joutes annonce aux agents : l'en-tête `Link` de l'accueil (RFC 8288)
 * et le catalogue d'API (RFC 9727).
 *
 * L'enjeu tient en une phrase : une annonce fausse est pire que pas d'annonce.
 * Un agent qui suit un `rel` inconnu ou une URL morte perd son temps là où il
 * aurait fait sans nous.
 *
 * Exécution : `npm run test`.
 */

/** Chaque lien de l'en-tête, découpé en cible et paramètres. */
function parseLinkHeader(header: string) {
  // Les virgules de séparation ne peuvent pas apparaître ailleurs : nos cibles
  // sont entre chevrons et nos titres n'en contiennent pas.
  return header.split(", ").map((entry) => {
    const [, target, rawParams = ""] = entry.match(/^<([^>]+)>(.*)$/) ?? [];
    assert.ok(target, `lien mal formé : ${entry}`);

    const params = new Map<string, string>();
    for (const param of rawParams.split(";").slice(1)) {
      const [, key, value] = param.trim().match(/^([^=]+)="?([^"]*)"?$/) ?? [];
      if (key) params.set(key, value);
    }

    return { target, params };
  });
}

/**
 * Ce qui, dans `app/`, prouve qu'un chemin annoncé existe : une route, une
 * page, ou le dossier lui-même — `/api` est une ancre, l'identifiant de l'API
 * au sens de la RFC 9727, et pas une adresse qui répond.
 */
function routeFilesFor(path: string): string[] {
  const base = `app${path}`;
  return [`${base}/route.ts`, `${base}/page.tsx`, base];
}

describe("HOMEPAGE_LINK_HEADER", () => {
  it("n'annonce que des relations enregistrées à l'IANA", () => {
    // Un `rel` inventé ne dit rien à personne : l'agent le laisse tomber, et
    // l'annonce ne vaut pas mieux que son absence.
    const registered = new Set([
      "api-catalog",
      "service-desc",
      "service-doc",
      "service-meta",
      "describedby",
      "terms-of-service",
      "privacy-policy",
      "author",
      "license",
      "help",
    ]);

    const rels = parseLinkHeader(HOMEPAGE_LINK_HEADER).map((link) => link.params.get("rel"));

    assert.ok(rels.length >= 3, `liens annoncés : ${rels.length}`);
    for (const rel of rels) {
      assert.ok(rel && registered.has(rel), `relation non enregistrée : ${rel}`);
    }
  });

  it("mène au catalogue et à la description de l'API", () => {
    // Garde-fou du garde-fou : un en-tête vidé passerait le test précédent.
    const byRel = new Map(
      parseLinkHeader(HOMEPAGE_LINK_HEADER).map((link) => [link.params.get("rel"), link])
    );

    assert.equal(byRel.get("api-catalog")?.target, ADVERTISED_PATHS.catalog);
    assert.equal(byRel.get("api-catalog")?.params.get("type"), "application/linkset+json");
    assert.equal(byRel.get("service-desc")?.target, ADVERTISED_PATHS.openapi);
    assert.equal(byRel.get("service-doc")?.target, ADVERTISED_PATHS.apiDoc);
  });

  it("tient dans l'ASCII", () => {
    // Un en-tête HTTP ne transporte pas d'accents sans le détour de `title*`
    // et de l'encodage RFC 8187 : un titre français y arriverait en bouillie.
    // eslint-disable-next-line no-control-regex
    const offenders = HOMEPAGE_LINK_HEADER.match(/[^\x20-\x7e]/g);
    assert.equal(offenders, null, `caractères hors ASCII : ${offenders?.join(", ")}`);
  });
});

describe("buildApiCatalog", () => {
  it("ancre chaque service sur l'origine qui le sert", () => {
    // Le catalogue est servi aussi en préproduction et en local, où le domaine
    // de production ne mènerait nulle part.
    const catalog = buildApiCatalog("https://preview.joutes.app");
    const [restApi, mcp] = catalog.linkset;

    assert.equal(restApi.anchor, "https://preview.joutes.app/api");
    assert.equal(mcp.anchor, "https://preview.joutes.app/mcp");
    assert.deepEqual(restApi["service-desc"], [
      {
        href: "https://preview.joutes.app/api/docs",
        type: "application/json",
        title: "Description OpenAPI 3.1 de l'API Joutes",
      },
    ]);
  });

  it("dit de chaque service où en lire l'état", () => {
    // Sans la relation `status`, un agent qui reçoit une erreur ne peut pas
    // distinguer sa faute de la nôtre : il réessaie à l'aveugle ou renonce.
    const catalog = buildApiCatalog("https://www.joutes.app");

    for (const entry of catalog.linkset) {
      const status = entry.status;
      assert.ok(Array.isArray(status), `pas de relation status : ${entry.anchor}`);
      assert.equal(status[0].href, "https://www.joutes.app/api/health");
      assert.equal(status[0].type, "application/health+json");
    }
  });

  it("n'écrit que des URI absolues", () => {
    const catalog = buildApiCatalog("https://www.joutes.app");

    for (const entry of catalog.linkset) {
      const { anchor, ...relations } = entry;
      assert.ok(anchor.startsWith("https://"), `ancre relative : ${anchor}`);

      for (const [rel, links] of Object.entries(relations)) {
        assert.ok(Array.isArray(links), `relation mal formée : ${rel}`);
        for (const link of links) {
          assert.ok(link.href.startsWith("https://"), `lien relatif : ${rel} → ${link.href}`);
        }
      }
    }
  });
});

describe("ADVERTISED_PATHS", () => {
  it("ne pointe que vers des routes qui existent", () => {
    // La dérive est le risque réel : renommer une page casse l'annonce en
    // silence, et l'agent tombe sur un 404 après nous avoir crus sur parole.
    for (const [name, path] of Object.entries(ADVERTISED_PATHS)) {
      const candidates = routeFilesFor(path);
      assert.ok(
        candidates.some((file) => existsSync(file)),
        `${name} (${path}) n'a ni route ni page : ${candidates.join(", ")}`
      );
    }
  });
});
