import "server-only";

import {
  deleteGameStreamsExcept,
  listGameStreams,
  setGameStreamLive,
  setGameStreamWatched,
  touchGameStream,
  upsertGameStream,
} from "@/lib/db/game-streams";
import { getAllGames } from "@/lib/db/games";
import { youtubeApiKey } from "@/lib/streams/config";
import { fetchYouTubeChannelFeed, getYouTubeVideos, resolveYouTubeChannel } from "@/lib/streams/youtube-api";
import { readYouTubeChannelRef } from "@/lib/streams/youtube-channels";
import { mergeWatchedVideos, youtubeWatchUrl } from "@/lib/streams/youtube-websub";
import type { WatchedVideo } from "@/lib/types/StreamLink";

/**
 * Les directs des éditeurs, une fois par heure.
 *
 * ## Pourquoi un sondage, alors que les chaînes liées ont un hub
 *
 * Le hub WebSub de YouTube pousse le flux d'une chaîne **à qui s'y abonne** —
 * et un abonnement se pose avec une adresse de rappel que YouTube retient. Le
 * faire pour les chaînes d'éditeurs ajouterait des abonnements à renouveler
 * tous les cinq jours, une route à sécuriser et un bail à réparer, pour gagner
 * quoi ? Rien de ce que le hub apporte n'a de valeur ici : il ne dit pas
 * « direct », il ne dit rien au démarrage d'un direct programmé, il ne dit rien
 * à la fin. `docs/STREAM_LINKING.md` le note déjà — pour YouTube, **le cron est
 * le mécanisme**. Autant l'assumer et n'avoir que lui.
 *
 * ## Ce que coûte un tour
 *
 * Deux lectures par chaîne, dont une seule est facturée :
 *
 * 1. **le flux Atom public** — les quinze dernières publications. Zéro unité de
 *    quota, et c'est ce qui rend l'affaire tenable ;
 * 2. **`videos.list`** — l'état réel de ces vidéos. Une unité par lot de
 *    cinquante identifiants, **tous jeux confondus** : un seul appel couvre
 *    tout le catalogue.
 *
 * Soit environ 24 unités par jour pour l'ensemble du site, contre 10 000
 * disponibles. `search.list`, qui répondrait pourtant directement à la
 * question, en coûterait 100 par chaîne et par tour — 4 800 par jour pour deux
 * jeux. Elle reste délibérément absente, ici comme ailleurs.
 *
 * La résolution d'une adresse en identifiant `UC…` coûte une unité de plus,
 * mais **une seule fois par chaîne** : le résultat est rangé sur le document et
 * n'est redemandé que si l'administration change le lien.
 *
 * ## La limite connue
 *
 * Un direct doit apparaître dans le flux de la chaîne pour être vu. C'est le
 * cas d'un direct programmé, publié à sa création, et c'est ce sur quoi repose
 * déjà toute la surveillance des chaînes liées. Un direct démarré sans aucune
 * annonce préalable peut n'y entrer qu'avec un retard de quelques minutes ; le
 * tour suivant le rattrape. La granularité est de toute façon l'heure.
 */

export type GameLivesReport = {
  /** Jeux portant une adresse de chaîne lisible. */
  channels: number;
  resolved: number;
  started: number;
  stopped: number;
  removed: number;
  failed: number;
};

export async function refreshGameLives(): Promise<GameLivesReport> {
  const report: GameLivesReport = {
    channels: 0,
    resolved: 0,
    started: 0,
    stopped: 0,
    removed: 0,
    failed: 0,
  };

  // La clé de l'API Data suffit : ce cron ne pose aucun abonnement chez Google,
  // il lit un flux public et interroge `videos.list`. Exiger en plus le secret
  // WebSub — ce que fait `youtubeConfig()` — l'éteindrait pour une valeur qu'il
  // n'emploie nulle part.
  if (!youtubeApiKey()) {
    return report;
  }

  // La base, et non `readGameBySlugOrId` : le catalogue en cache est fait pour
  // les pages publiques, et un cron qui le lit se verrait servir le catalogue
  // d'hier sans jamais le savoir.
  const games = await getAllGames();

  const declared = games.flatMap((game) => {
    const sourceUrl = game.links?.youtube?.trim();
    const ref = readYouTubeChannelRef(sourceUrl);

    return ref && sourceUrl ? [{ gameId: game.id, ref, sourceUrl }] : [];
  });

  report.channels = declared.length;

  // Ménage d'abord : un jeu dont on vient d'effacer le lien ne doit pas être
  // interrogé ce tour-ci, ni continuer d'afficher son dernier direct.
  report.removed = await deleteGameStreamsExcept("youtube", declared.map((entry) => entry.gameId));

  const known = new Map((await listGameStreams("youtube")).map((stream) => [stream.gameId, stream]));

  // 1. Résoudre ce qui ne l'est pas encore, et seulement cela.
  for (const { gameId, ref, sourceUrl } of declared) {
    const existing = known.get(gameId);

    if (existing && existing.sourceUrl === sourceUrl && existing.channelId) {
      continue;
    }

    const channel = await resolveYouTubeChannel(ref);

    if (!channel) {
      report.failed += 1;
      console.error("Chaîne YouTube introuvable pour le jeu", gameId, sourceUrl);

      /*
       * Une adresse qui a changé et que YouTube ne sait pas résoudre — un
       * handle mal recopié, une chaîne supprimée, une panne passagère de l'API.
       * Le document existant pointe alors une chaîne que la fiche du jeu **ne
       * désigne plus** : la laisser dans le tour ferait interroger l'ancienne
       * chaîne et, pire, afficher son direct sur un jeu qui ne la revendique
       * pas. On éteint donc ce qu'elle affichait et on la sort de ce tour.
       *
       * Le document, lui, reste : `sourceUrl` y est toujours l'ancienne, si
       * bien que le tour suivant retentera la résolution. Une panne passagère
       * se répare toute seule, et `lastError` dit à l'administration ce qui
       * cloche en attendant.
       */
      if (existing) {
        if (existing.live) {
          await setGameStreamLive(existing.id, null);
          report.stopped += 1;
        }

        await touchGameStream(existing.id, `chaine-non-resolue: ${sourceUrl}`);
        known.delete(gameId);
      }

      continue;
    }

    known.set(
      gameId,
      await upsertGameStream({
        gameId,
        platform: "youtube",
        sourceUrl,
        channelId: channel.id,
        channelTitle: channel.title,
        handle: channel.handle,
      }),
    );

    report.resolved += 1;
  }

  const streams = [...known.values()];

  if (streams.length === 0) {
    return report;
  }

  // 2. Ce que chaque chaîne a publié récemment. Gratuit, mais un aller-retour
  //    réseau par chaîne : les jeux se comptent en dizaines, pas en milliers.
  const now = new Date().toISOString();
  const watchedByStream = new Map<string, WatchedVideo[]>();

  for (const stream of streams) {
    const entries = await fetchYouTubeChannelFeed(stream.channelId);

    watchedByStream.set(
      stream.id,
      mergeWatchedVideos(
        stream.watched,
        // Le flux d'une chaîne ne parle en principe que d'elle ; on le vérifie
        // quand même, une redirection de chaîne renvoyant le flux d'une autre.
        entries.filter((entry) => entry.channelId === stream.channelId).map((entry) => entry.videoId),
        now,
      ),
    );
  }

  // 3. L'état réel, en un appel pour tout le monde.
  const currentlyLive = streams
    .map((stream) => stream.live?.videoId)
    .filter((videoId): videoId is string => Boolean(videoId));

  const videos = await getYouTubeVideos([
    ...new Set([
      ...[...watchedByStream.values()].flat().map((item) => item.videoId),
      ...currentlyLive,
    ]),
  ]);

  for (const stream of streams) {
    const watched = watchedByStream.get(stream.id) ?? [];
    const started = watched
      .map((item) => videos.get(item.videoId))
      .find((video) => video?.state === "live");

    if (started && stream.live?.videoId !== started.videoId) {
      await setGameStreamLive(stream.id, {
        url: youtubeWatchUrl(started.videoId),
        title: started.title,
        startedAt: started.startedAt ?? now,
        videoId: started.videoId,
        detectedAt: now,
      });

      report.started += 1;
    } else if (!started && stream.live) {
      // Absente de la réponse — supprimée, privée — ou plus en direct : dans les
      // deux cas la fiche du jeu ne doit plus l'afficher.
      await setGameStreamLive(stream.id, null);
      report.stopped += 1;
    }

    // Ce qui n'est ni en direct ni programmé a fini sa vie de vidéo surveillée.
    // Sans cet oubli, la liste ne contiendrait bientôt que des rediffusions —
    // le flux d'une chaîne active en publie quinze pour un direct.
    const stillWorthWatching = watched.filter((item) => {
      const video = videos.get(item.videoId);
      return !video || video.state !== "none";
    });

    if (
      stillWorthWatching.length !== stream.watched.length ||
      stillWorthWatching.some((item, index) => item.videoId !== stream.watched[index]?.videoId)
    ) {
      await setGameStreamWatched(stream.id, stillWorthWatching);
    }

    await touchGameStream(stream.id);
  }

  return report;
}