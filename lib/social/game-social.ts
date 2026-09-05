import "server-only";

import {
  deleteGameSocialPostsOfOtherAccounts,
  deleteUndeclaredGameSocialPosts,
  listGameSocialExternalIds,
  purgeGameSocialPosts,
  upsertGameSocialPosts,
} from "@/lib/db/game-social-posts";
import { getGameStream } from "@/lib/db/game-streams";
import { getAllGames } from "@/lib/db/games";
import { BLUESKY_FEED_LIMIT, fetchBlueskyAuthorFeed } from "@/lib/social/bluesky-api";
import { readBlueskyActor } from "@/lib/social/bluesky-actors";
import { readBlueskyFeed } from "@/lib/social/bluesky-feed";
import { socialLinkOf, type SocialPlatform } from "@/lib/social/platforms";
import { readYouTubeSocialPosts } from "@/lib/social/youtube-posts";
import { youtubeApiKey } from "@/lib/streams/config";
import { fetchYouTubeChannelFeed, getYouTubeVideos, resolveYouTubeChannel } from "@/lib/streams/youtube-api";
import { readYouTubeChannelRef } from "@/lib/streams/youtube-channels";
import { youtubeChannelUrl } from "@/lib/streams/youtube-websub";
import type { CollectedSocialPost } from "@/lib/types/GameSocialPost";

/**
 * Les publications des réseaux des éditeurs, deux fois par jour.
 *
 * ## Pourquoi il n'y a pas de registre de collecteurs
 *
 * Les deux passes ci-dessous ne se ressemblent pas, et c'est irréductible :
 * Bluesky demande un aller-retour par compte, YouTube un flux gratuit par
 * chaîne **plus un unique `videos.list` pour tout le catalogue**. C'est ce lot
 * partagé qui rend son quota tenable, et aucune interface `collect(compte)` ne
 * sait l'exprimer sans se scinder en `gather()` puis `enrich()` — un cadre
 * inventé pour un seul cas. L'orchestration est donc écrite en clair, comme
 * celle de `refreshGameLives()`.
 *
 * Le point d'extension est déclaratif : `lib/social/platforms.ts`.
 *
 * ## Ce que coûte un tour
 *
 * | Appel | Quota |
 * | --- | --- |
 * | `getAuthorFeed` (Bluesky), un par compte | aucun, l'API est publique |
 * | flux Atom d'une chaîne, un par chaîne | aucun |
 * | `videos.list`, **un pour tout le catalogue** | 1 unité par lot de 50 |
 *
 * Soit deux unités par jour pour l'ensemble du site, et encore : on
 * n'interroge que les vidéos **inconnues**, si bien que le régime permanent
 * tombe à presque rien. `search.list` reste bannie, ici comme ailleurs.
 *
 * ## Le ménage se fait en deux fois, et c'est délibéré
 *
 * `refreshGameLives` fait tout le sien avant le réseau. Ici, seul le ménage
 * **sûr** — ce dont plus aucune fiche ne parle, information qui vient de notre
 * base et ne peut pas être fausse — passe avant. Celui qui dépend de ce qu'une
 * plateforme a répondu passe après, et ne s'applique qu'aux comptes qu'on a
 * effectivement su lire : effacer l'historique d'un jeu parce que l'AppView a
 * rendu un 502 pendant deux secondes coûterait bien plus que d'afficher douze
 * heures de plus la publication d'un compte qui vient de changer. Un direct
 * périmé ment ; une publication de la veille, non.
 *
 * Voir `docs/GAME_SOCIAL.md`.
 */

export type GameSocialReport = {
  /** Jeux dont le fanion est allumé et qui déclarent au moins un compte lisible. */
  games: number;
  accounts: number;
  /** Publications retenues après filtrage, doublons des tours précédents compris. */
  collected: number;
  /** Documents réellement créés. Un second tour à catalogue inchangé doit rendre 0. */
  inserted: number;
  removed: number;
  purged: number;
  /** Comptes qu'on n'a pas su lire ce tour-ci. */
  failed: number;
};

type DeclaredAccount = {
  gameId: string;
  platform: SocialPlatform;
  /** L'adresse telle qu'elle est écrite sur la fiche. */
  sourceUrl: string;
};

export async function refreshGameSocialPosts(): Promise<GameSocialReport> {
  const report: GameSocialReport = {
    games: 0,
    accounts: 0,
    collected: 0,
    inserted: 0,
    removed: 0,
    purged: 0,
    failed: 0,
  };

  /*
   * Pas de sortie globale, contrairement à `refreshGameLives` : Bluesky ne
   * demande aucune configuration, ce cron a donc toujours quelque chose à
   * faire. Seule la passe YouTube est conditionnée à sa clé.
   */
  const games = await getAllGames();

  // Le fanion **puis** les liens : le fanion est l'autorisation de republier,
  // les liens sont les sources. Un jeu qui a les uns sans l'autre ne collecte
  // rien, dans les deux sens.
  const eligible = games.filter((game) => game.features?.socialFeed === true);

  const declared: DeclaredAccount[] = [];

  for (const game of eligible) {
    const bluesky = socialLinkOf(game.links, "bluesky");
    if (bluesky && readBlueskyActor(bluesky)) {
      declared.push({ gameId: game.id, platform: "bluesky", sourceUrl: bluesky });
    }

    const youtube = socialLinkOf(game.links, "youtube");
    if (youtube && readYouTubeChannelRef(youtube)) {
      declared.push({ gameId: game.id, platform: "youtube", sourceUrl: youtube });
    }
  }

  report.accounts = declared.length;
  report.games = new Set(declared.map((entry) => entry.gameId)).size;

  // 1. Le ménage sûr, avant tout appel réseau.
  report.removed = await deleteUndeclaredGameSocialPosts(
    declared.map(({ gameId, platform }) => ({ gameId, platform })),
  );

  // 2. Bluesky, compte par compte.
  for (const entry of declared.filter((item) => item.platform === "bluesky")) {
    await collectBluesky(entry, report);
  }

  // 3. YouTube, dont l'appel facturé est mutualisé.
  if (youtubeApiKey()) {
    await collectYouTube(declared.filter((item) => item.platform === "youtube"), report);
  }

  // 4. La rétention, une fois par jeu concerné.
  for (const gameId of new Set(declared.map((entry) => entry.gameId))) {
    report.purged += await purgeGameSocialPosts(gameId);
  }

  return report;
}

async function collectBluesky(entry: DeclaredAccount, report: GameSocialReport): Promise<void> {
  const ref = readBlueskyActor(entry.sourceUrl);
  if (!ref) return;

  const payload = await fetchBlueskyAuthorFeed(ref.actor, BLUESKY_FEED_LIMIT);

  // `null` dit « on n'a pas su lire », ce qui n'autorise aucun ménage. Une
  // liste vide dirait « ce compte n'a rien publié », ce qui n'est pas pareil.
  if (payload === null) {
    report.failed += 1;
    return;
  }

  const all = readBlueskyFeed(payload, {
    // Quand la fiche porte un DID, on l'impose ; quand elle porte un handle, on
    // ne connaît pas encore le DID et c'est la réponse qui l'apprend.
    expectedDid: ref.actor.startsWith("did:") ? ref.actor : undefined,
  });

  if (all.length === 0) {
    return;
  }

  /*
   * Un flux d'auteur ne devrait porter qu'un auteur, reposts écartés. On s'en
   * assure quand même, et pour une raison précise : le ménage ci-dessous
   * supprime tout ce qui ne vient pas de `accountKey`. Si la réponse mêlait
   * deux auteurs, on rangerait les deux puis on en effacerait un — deux
   * écritures par tour, indéfiniment.
   */
  const accountKey = all[0].account.key;
  const posts = all.filter((post) => post.account.key === accountKey);

  report.collected += posts.length;
  report.inserted += await upsertGameSocialPosts(entry.gameId, posts);

  // Le compte a répondu : on peut retirer ce qui vient d'un autre.
  report.removed += await deleteGameSocialPostsOfOtherAccounts(entry.gameId, "bluesky", accountKey);
}

/**
 * La passe YouTube, en trois temps pour n'appeler `videos.list` qu'une fois.
 *
 * Le `channelId` **n'est pas re-résolu** quand `game_streams` le porte déjà :
 * le cron horaire des directs le tient à jour, avec la `sourceUrl` qui dit si
 * le lien a changé. On applique la même garde que lui, et `resolveYouTubeChannel`
 * n'est appelée que dans l'heure qui suit une correction de lien en
 * administration.
 */
async function collectYouTube(
  entries: DeclaredAccount[],
  report: GameSocialReport,
): Promise<void> {
  type Channel = {
    entry: DeclaredAccount;
    channelId: string;
    title?: string;
    handle?: string;
    feed: Awaited<ReturnType<typeof fetchYouTubeChannelFeed>>;
    known: Set<string>;
  };

  const channels: Channel[] = [];

  for (const entry of entries) {
    const ref = readYouTubeChannelRef(entry.sourceUrl);
    if (!ref) continue;

    const stream = await getGameStream(entry.gameId, "youtube");

    const resolved =
      stream?.channelId && stream.sourceUrl === entry.sourceUrl
        ? { id: stream.channelId, title: stream.channelTitle, handle: stream.handle }
        : await resolveYouTubeChannel(ref);

    if (!resolved) {
      report.failed += 1;
      console.error("Chaîne YouTube introuvable pour le jeu", entry.gameId, entry.sourceUrl);
      continue;
    }

    const feed = await fetchYouTubeChannelFeed(resolved.id);

    // Un flux vide n'est pas distinguable d'un flux injoignable — les deux
    // rendent `[]`. On s'abstient donc de tout ménage pour cette chaîne,
    // conformément à la règle : on ne défait que sur une réponse sûre.
    if (feed.length === 0) {
      report.failed += 1;
      continue;
    }

    channels.push({
      entry,
      channelId: resolved.id,
      title: resolved.title,
      handle: resolved.handle,
      feed,
      known: await listGameSocialExternalIds(entry.gameId, "youtube"),
    });
  }

  if (channels.length === 0) {
    return;
  }

  /*
   * Un seul appel pour tout le catalogue, et seulement sur ce qu'on ne connaît
   * pas : une publication déjà rangée porte sa durée, valeur immuable qu'il
   * serait absurde de redemander deux fois par jour. C'est la résolution
   * paresseuse de `game-lives`, appliquée aux vidéos.
   */
  const unknown = new Set<string>();
  for (const channel of channels) {
    for (const item of channel.feed) {
      if (!channel.known.has(item.videoId)) {
        unknown.add(item.videoId);
      }
    }
  }

  const videos = await getYouTubeVideos([...unknown]);

  for (const channel of channels) {
    const posts: CollectedSocialPost[] = readYouTubeSocialPosts(
      channel.feed.filter((item) => !channel.known.has(item.videoId)),
      videos,
      {
        channelId: channel.channelId,
        title: channel.title,
        handle: channel.handle,
        url: youtubeChannelUrl(channel.channelId),
      },
    );

    report.collected += posts.length;

    if (posts.length > 0) {
      report.inserted += await upsertGameSocialPosts(channel.entry.gameId, posts);
    }

    // La chaîne a répondu : le ménage d'après réseau est permis, qu'elle ait
    // publié du neuf ou non.
    report.removed += await deleteGameSocialPostsOfOtherAccounts(
      channel.entry.gameId,
      "youtube",
      channel.channelId,
    );
  }
}
