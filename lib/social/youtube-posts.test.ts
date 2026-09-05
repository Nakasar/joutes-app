import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isShortDuration,
  readIsoDurationSeconds,
  readYouTubeSocialPosts,
  SHORT_MAX_SECONDS,
  youtubeThumbnailUrl,
} from "./youtube-posts";
import type { YouTubeVideo } from "@/lib/streams/youtube-api";
import type { YouTubeFeedEntry } from "@/lib/streams/youtube-websub";

/**
 * Le tri des publications d'une chaîne YouTube.
 *
 * Ce que ces cas verrouillent : la frontière entre un short et une vidéo, le
 * fait qu'une durée inconnue penche vers la vidéo, et surtout le rejet des
 * directs — le flux d'une chaîne les contient, et sans ce tri un direct
 * apparaîtrait dans la grille en doublon du lecteur affiché juste au-dessus.
 *
 * Exécution : `npm run test`.
 */

const CHANNEL = "UCuAXFkgsw1L7xaCfnd5JJOw";

const ACCOUNT = {
  channelId: CHANNEL,
  title: "Riftbound",
  handle: "@riftbound",
  url: `https://www.youtube.com/channel/${CHANNEL}`,
};

function entry(videoId: string, overrides: Partial<YouTubeFeedEntry> = {}): YouTubeFeedEntry {
  return {
    videoId,
    channelId: CHANNEL,
    title: `Titre de ${videoId}`,
    publishedAt: "2026-09-04T18:25:36+00:00",
    ...overrides,
  };
}

function video(videoId: string, overrides: Partial<YouTubeVideo> = {}): YouTubeVideo {
  return {
    videoId,
    channelId: CHANNEL,
    state: "none",
    title: `Titre de ${videoId}`,
    duration: "PT12M30S",
    ...overrides,
  };
}

function read(entries: YouTubeFeedEntry[], videos: YouTubeVideo[]) {
  return readYouTubeSocialPosts(entries, new Map(videos.map((v) => [v.videoId, v])), ACCOUNT);
}

describe("readIsoDurationSeconds", () => {
  it("lit les formes que YouTube emploie", () => {
    assert.equal(readIsoDurationSeconds("PT3M1S"), 181);
    assert.equal(readIsoDurationSeconds("PT2M45S"), 165);
    assert.equal(readIsoDurationSeconds("PT1H2M3S"), 3723);
    assert.equal(readIsoDurationSeconds("PT45S"), 45);
    assert.equal(readIsoDurationSeconds("P0D"), 0);
  });

  it("rend undefined plutôt que NaN sur une valeur illisible", () => {
    for (const value of ["", "nope", "3 minutes", undefined, null]) {
      assert.equal(readIsoDurationSeconds(value), undefined, `attendu undefined pour ${String(value)}`);
    }
  });
});

describe("isShortDuration", () => {
  it("place la frontière à trois minutes", () => {
    assert.equal(isShortDuration(SHORT_MAX_SECONDS), true);
    assert.equal(isShortDuration(SHORT_MAX_SECONDS + 1), false);
  });

  /*
   * Se tromper vers la vidéo est le sens qui ne surprend personne : une vignette
   * de vidéo qui dure trente secondes étonne moins qu'un « Short » de vingt
   * minutes.
   */
  it("fait pencher l'inconnu vers la vidéo", () => {
    assert.equal(isShortDuration(undefined), false);
    assert.equal(isShortDuration(0), false);
  });
});

describe("readYouTubeSocialPosts", () => {
  it("classe par la durée", () => {
    const posts = read(
      [entry("court"), entry("long")],
      [video("court", { duration: "PT2M45S" }), video("long", { duration: "PT3M1S" })],
    );

    assert.equal(posts.find((p) => p.externalId === "court")?.kind, "short");
    assert.equal(posts.find((p) => p.externalId === "long")?.kind, "video");
  });

  it("classe en vidéo ce dont la durée est absente", () => {
    const posts = read([entry("sansduree")], [video("sansduree", { duration: undefined })]);

    assert.equal(posts[0].kind, "video");
    assert.equal(posts[0].durationSeconds, undefined);
  });

  /*
   * Le rejet le plus utile du module : `GameLiveSection` affiche déjà le direct
   * en cours, en grand, juste au-dessus de la grille sur la même page.
   */
  it("écarte un direct en cours ou programmé", () => {
    const posts = read(
      [entry("direct"), entry("programme"), entry("ordinaire")],
      [
        video("direct", { state: "live" }),
        video("programme", { state: "upcoming" }),
        video("ordinaire"),
      ],
    );

    assert.deepEqual(
      posts.map((p) => p.externalId),
      ["ordinaire"],
    );
  });

  it("écarte une vidéo dont on ignore l'état — supprimée, privée", () => {
    assert.deepEqual(read([entry("disparue")], []), []);
  });

  it("écarte une entrée venue d'une autre chaîne", () => {
    assert.deepEqual(read([entry("etrangere", { channelId: "UCautrechaine0000000000" })], [video("etrangere")]), []);
  });

  it("écarte une entrée qu'on ne sait pas dater", () => {
    assert.deepEqual(read([entry("sansdate", { publishedAt: undefined })], [video("sansdate")]), []);
  });

  it("normalise la date du flux Atom, dont la forme diffère de celle de Bluesky", () => {
    const posts = read([entry("v", { publishedAt: "2026-09-04T20:25:36+02:00" })], [video("v")]);

    assert.equal(posts[0].publishedAt, "2026-09-04T18:25:36.000Z");
  });

  it("nomme le compte et pose une miniature à URL stable", () => {
    const posts = read([entry("v")], [video("v")]);

    assert.deepEqual(posts[0].account, {
      key: CHANNEL,
      handle: "@riftbound",
      displayName: "Riftbound",
      url: ACCOUNT.url,
    });
    assert.equal(posts[0].thumbnail, youtubeThumbnailUrl("v"));
    assert.equal(posts[0].url, "https://www.youtube.com/watch?v=v");
    assert.equal(posts[0].platform, "youtube");
  });

  it("préfère le titre de l'API à celui du flux, qui peut être plus ancien", () => {
    const posts = read([entry("v", { title: "Ancien titre" })], [video("v", { title: "Titre corrigé" })]);

    assert.equal(posts[0].text, "Titre corrigé");
  });
});
