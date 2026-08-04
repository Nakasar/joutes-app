import {NextResponse} from "next/server";
import {PassThrough} from "node:stream";
import {once} from "node:events";
import {put} from "@vercel/blob";
import {ObjectId} from "mongodb";
import db from "@/lib/mongodb";
import {getGameBySlugOrId} from "@/lib/db/games";
import {countErratasByGameId, getErratasByGameId} from "@/lib/db/erratas";
import {countAllPolicies, getAllPolicies} from "@/lib/db/policies";
import {getRawEntries} from "@/lib/rules/riftbound";
import {
  acquireGameExportLock,
  createGameExport,
  getRecentGameExport,
  releaseGameExportLock,
} from "@/lib/db/game-exports";
import {gameExportChunks} from "@/lib/games/export-document";

const EXPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Délai proposé au client avant de retenter, quand une génération est en cours. */
const RETRY_AFTER_SECONDS = 120;

function getRulesExport(gameSlug: string | undefined) {
  if (gameSlug !== 'riftbound') {
    return undefined;
  }

  return {
    en: {tr: getRawEntries('TR', 'en'), cr: getRawEntries('CR', 'en')},
    fr: {tr: getRawEntries('TR', 'fr'), cr: getRawEntries('CR', 'fr')},
  };
}

/**
 * Écrit dans le flux en respectant la contre-pression, et compte les octets
 * produits. Sans l'attente du `drain`, le `PassThrough` accumulerait tout le
 * document en mémoire dès que l'envoi est plus lent que la lecture en base —
 * exactement ce que la génération en flux cherche à éviter.
 */
class CountingWriter {
  bytes = 0;

  constructor(private readonly stream: PassThrough) {}

  async write(chunk: string): Promise<void> {
    this.bytes += Buffer.byteLength(chunk);
    if (!this.stream.write(chunk)) {
      // `once` rejette si le flux émet une erreur : c'est ce qui débloque
      // l'écriture quand l'envoi échoue en cours de route.
      await once(this.stream, "drain");
    }
  }
}

export async function GET(request: Request, {params}: { params: Promise<{ gameId: string }> }) {
  const {gameId} = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({error: "Game not found"}, {status: 404});
  }

  const existingExport = await getRecentGameExport(game.id, EXPORT_MAX_AGE_MS);
  if (existingExport) {
    return NextResponse.json({
      status: 'ready',
      url: existingExport.url,
      size: existingExport.size,
      generatedAt: existingExport.generatedAt,
    });
  }

  // Une seule génération à la fois par jeu. À l'expiration du cache, tous les
  // clients réveillés ensemble demandent l'export : sans verrou, chacun en
  // déclencherait une, et c'est la simultanéité — plus que le volume — qui
  // épuise la mémoire de l'instance.
  const lock = await acquireGameExportLock(game.id);
  if (!lock.acquired) {
    return NextResponse.json(
      {
        status: 'generating',
        startedAt: lock.startedAt.toISOString(),
        retryAfterSeconds: RETRY_AFTER_SECONDS,
        error: "La génération de l'export de ce jeu est déjà en cours. Réessayez dans quelques minutes.",
      },
      {status: 409, headers: {'Retry-After': String(RETRY_AFTER_SECONDS)}}
    );
  }

  try {
    // Une autre instance a pu terminer sa génération pendant qu'on attendait le
    // verrou : le document est alors tout frais, inutile de le refaire.
    const justGenerated = await getRecentGameExport(game.id, EXPORT_MAX_AGE_MS);
    if (justGenerated) {
      return NextResponse.json({
        status: 'ready',
        url: justGenerated.url,
        size: justGenerated.size,
        generatedAt: justGenerated.generatedAt,
      });
    }

    const erratasCount = await countErratasByGameId(game.id);
    const erratas = erratasCount > 0
      ? await getErratasByGameId({gameId: game.id, offset: 0, limit: erratasCount})
      : [];

    const policiesCount = await countAllPolicies({gameId: game.id});
    const policies = policiesCount > 0
      ? await getAllPolicies({gameId: game.id, offset: 0, limit: policiesCount})
      : [];

    const generatedAt = new Date();
    const pathname = `exports/${game.slug ?? game.id}/${generatedAt.getTime()}.json`;

    // Les cartes ne sont jamais rassemblées : le curseur les livre par lots et
    // chacune repart aussitôt dans le flux d'envoi.
    const cursor = db
      .collection("cards")
      .find({gameId: new ObjectId(game.id)}, {projection: {_id: 0}});

    const stream = new PassThrough();
    const upload = put(pathname, stream, {
      access: 'public',
      contentType: 'application/json',
      // Envoi découpé en parties réessayées indépendamment : un document de
      // plusieurs dizaines de mégaoctets ne part pas d'un seul tenant.
      multipart: true,
    });
    // Si l'envoi échoue pendant qu'on écrit, on coupe le flux : sans cela,
    // l'écriture attendrait un `drain` qui ne viendra plus.
    upload.catch((error: unknown) => {
      stream.destroy(error instanceof Error ? error : new Error(String(error)));
    });

    const writer = new CountingWriter(stream);
    try {
      for await (const chunk of gameExportChunks({
        game: {id: game.id, slug: game.slug, name: game.name},
        generatedAt,
        cards: cursor,
        erratas,
        policies,
        rules: getRulesExport(game.slug),
      })) {
        await writer.write(chunk);
      }
      stream.end();
    } catch (error) {
      // Couper le flux fait échouer l'envoi, dont la promesse est déjà surveillée
      // plus haut : on ne laisse pas de rejet en suspens derrière nous.
      stream.destroy(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      await cursor.close();
    }

    const blob = await upload;

    const gameExport = await createGameExport({
      gameId: game.id,
      url: blob.url,
      pathname: blob.pathname,
      size: writer.bytes,
      generatedAt,
    });

    return NextResponse.json({
      status: 'ready',
      url: gameExport.url,
      size: gameExport.size,
      generatedAt: gameExport.generatedAt,
    });
  } finally {
    await releaseGameExportLock(game.id, lock.token);
  }
}
