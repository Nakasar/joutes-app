import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import type { AddressInfo } from "node:net";
import type { CardnexusFeedMetadata } from "./cardnexus";
import { streamCardnexusFeed } from "./cardnexus-feed";

/**
 * Lecture d'un feed CardNexus : un NDJSON gzippé, servi par un lien signé.
 *
 * Le fichier est du gzip **comme format**, et non comme encodage de transport :
 * le client HTTP n'est pas censé le décompresser tout seul, mais il arrive
 * qu'il le fasse. Les deux cas se lisent ici — une ligne perdue à la
 * décompression ne se verrait qu'à l'import suivant, sur des milliers de
 * cartes à la fois.
 *
 * Exécution : `npm run test`.
 */

const LINES = [{ id: 1, name: "Ahri" }, { id: 2, name: "Jinx" }, { id: 3, name: "Lux" }];

/** Le fichier tel que CardNexus le publie, ligne à ligne. */
const ndjson = LINES.map((line) => JSON.stringify(line)).join("\n") + "\n";

let server: Server;
let origin: string;

before(async () => {
  server = createServer((request, response) => {
    if (request.url === "/gzip") {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(gzipSync(ndjson));
    } else if (request.url === "/plain") {
      // Le stockage a annoncé l'encodage, et le client a décompressé pour nous.
      response.writeHead(200, { "content-type": "application/x-ndjson" });
      response.end(ndjson);
    } else if (request.url === "/empty") {
      response.writeHead(200).end();
    } else {
      response.writeHead(403).end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

function feed(path: string, overrides: Partial<CardnexusFeedMetadata> = {}): CardnexusFeedMetadata {
  return {
    feedType: "catalog",
    url: `${origin}${path}`,
    urlExpiresAt: "2099-01-01T00:00:00.000Z",
    checksum: "9f2c",
    sizeBytes: 1,
    recordCount: LINES.length,
    format: "ndjson",
    encoding: "gzip",
    lastRefreshedAt: "2026-06-08T14:04:11.000Z",
    generatedAt: "2026-06-08T03:22:09.000Z",
    ...overrides,
  };
}

async function read(metadata: CardnexusFeedMetadata): Promise<unknown[]> {
  const records: unknown[] = [];
  for await (const record of streamCardnexusFeed(metadata)) {
    records.push(record);
  }
  return records;
}

describe("streamCardnexusFeed", () => {
  it("décompresse le fichier et rend une ligne à la fois", async () => {
    assert.deepEqual(await read(feed("/gzip")), LINES);
  });

  it("lit tout aussi bien un fichier déjà décompressé", async () => {
    assert.deepEqual(await read(feed("/plain")), LINES);
  });

  it("ne rend rien d'un fichier vide", async () => {
    assert.deepEqual(await read(feed("/empty")), []);
  });

  it("dit que le lien a expiré plutôt que de rendre un feed tronqué", async () => {
    await assert.rejects(
      read(feed("/refuse", { urlExpiresAt: "2020-01-01T00:00:00.000Z" })),
      /expiré/
    );
  });

  it("s'arrête sur une erreur de téléchargement", async () => {
    await assert.rejects(read(feed("/refuse")), /403/);
  });
});
