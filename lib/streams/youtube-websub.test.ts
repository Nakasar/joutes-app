import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";

import {
  mergeWatchedVideos,
  readYouTubeFeed,
  verifyHubSignature,
  youtubeTopicUrl,
} from "./youtube-websub";

/**
 * Le hub WebSub, côté réception.
 *
 * Ce que ces cas verrouillent : seul un corps signé du bon secret est accepté —
 * et l'algorithme annoncé ne peut pas être n'importe lequel —, une entrée Atom
 * incomplète ne devient pas une vidéo surveillée, et la liste de surveillance
 * reste bornée dans le temps comme en nombre.
 *
 * Exécution : `npm run test`.
 */

const SECRET = "secret-du-hub";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <title>YouTube video feed</title>
  <entry>
    <id>yt:video:dQw4w9WgXcQ</id>
    <yt:videoId>dQw4w9WgXcQ</yt:videoId>
    <yt:channelId>UCuAXFkgsw1L7xaCfnd5JJOw</yt:channelId>
    <title>Draft Riftbound &amp; discussions</title>
    <published>2026-03-01T18:00:00+00:00</published>
  </entry>
</feed>`;

describe("verifyHubSignature", () => {
  it("accepte une signature SHA-1, celle que le hub de Google pose encore", () => {
    const digest = crypto.createHmac("sha1", SECRET).update(FEED, "utf8").digest("hex");

    assert.equal(verifyHubSignature({ rawBody: FEED, signature: `sha1=${digest}`, secret: SECRET }), true);
  });

  it("accepte une signature SHA-256", () => {
    const digest = crypto.createHmac("sha256", SECRET).update(FEED, "utf8").digest("hex");

    assert.equal(verifyHubSignature({ rawBody: FEED, signature: `sha256=${digest}`, secret: SECRET }), true);
  });

  it("refuse un algorithme hors de la liste fermée", () => {
    // Sans liste fermée, l'en-tête choisirait lui-même la fonction de hachage —
    // c'est-à-dire la plus faible que Node accepte.
    const digest = crypto.createHmac("md5", SECRET).update(FEED, "utf8").digest("hex");

    assert.equal(verifyHubSignature({ rawBody: FEED, signature: `md5=${digest}`, secret: SECRET }), false);
  });

  it("refuse un corps modifié", () => {
    const digest = crypto.createHmac("sha1", SECRET).update(FEED, "utf8").digest("hex");

    assert.equal(
      verifyHubSignature({ rawBody: `${FEED} `, signature: `sha1=${digest}`, secret: SECRET }),
      false,
    );
  });

  it("refuse plutôt que de jeter sur un en-tête malformé", () => {
    for (const signature of [null, "", "sha1=", "sha1", "=abcdef"]) {
      assert.equal(verifyHubSignature({ rawBody: FEED, signature, secret: SECRET }), false);
    }
  });

  it("refuse quand le secret manque", () => {
    const digest = crypto.createHmac("sha1", SECRET).update(FEED, "utf8").digest("hex");

    assert.equal(verifyHubSignature({ rawBody: FEED, signature: `sha1=${digest}`, secret: "" }), false);
  });
});

describe("readYouTubeFeed", () => {
  it("lit la vidéo et la chaîne d'une notification", () => {
    assert.deepEqual(readYouTubeFeed(FEED), [
      {
        videoId: "dQw4w9WgXcQ",
        channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
        title: "Draft Riftbound & discussions",
        publishedAt: "2026-03-01T18:00:00+00:00",
      },
    ]);
  });

  it("ignore une suppression, qui ne porte pas de vidéo", () => {
    // `at:deleted-entry` n'a pas de `yt:videoId` : une vidéo retirée n'éteint pas
    // un direct ici, c'est `videos.list` qui le fera au tour suivant du cron.
    const deletion = `<feed xmlns:at="http://purl.org/atompub/tombstones/1.0">
      <at:deleted-entry ref="yt:video:dQw4w9WgXcQ" when="2026-03-02T10:00:00+00:00"/>
    </feed>`;

    assert.deepEqual(readYouTubeFeed(deletion), []);
  });

  it("ne rend rien pour un corps qui n'est pas un flux", () => {
    assert.deepEqual(readYouTubeFeed(""), []);
    assert.deepEqual(readYouTubeFeed("<html><body>oups</body></html>"), []);
  });
});

describe("mergeWatchedVideos", () => {
  const now = "2026-03-01T12:00:00.000Z";

  it("place les nouvelles vidéos en tête", () => {
    const merged = mergeWatchedVideos(
      [{ videoId: "ancienne", seenAt: "2026-02-28T12:00:00.000Z" }],
      ["nouvelle"],
      now,
    );

    assert.deepEqual(
      merged.map((item) => item.videoId),
      ["nouvelle", "ancienne"],
    );
  });

  it("rafraîchit une vidéo déjà surveillée sans la dupliquer", () => {
    const merged = mergeWatchedVideos([{ videoId: "abc", seenAt: "2026-02-28T12:00:00.000Z" }], ["abc"], now);

    assert.deepEqual(merged, [{ videoId: "abc", seenAt: now }]);
  });

  it("oublie ce qui traîne depuis plus d'une semaine", () => {
    const merged = mergeWatchedVideos([{ videoId: "vieille", seenAt: "2026-02-01T12:00:00.000Z" }], [], now);

    assert.deepEqual(merged, []);
  });

  it("borne la liste", () => {
    const many = Array.from({ length: 40 }, (_, index) => `video-${index}`);

    assert.equal(mergeWatchedVideos([], many, now).length, 20);
  });
});

describe("youtubeTopicUrl", () => {
  it("compose le sujet du hub pour une chaîne", () => {
    assert.equal(
      youtubeTopicUrl("UCuAXFkgsw1L7xaCfnd5JJOw"),
      "https://www.youtube.com/xml/feeds/videos.xml?channel_id=UCuAXFkgsw1L7xaCfnd5JJOw",
    );
  });
});
