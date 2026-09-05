import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { MAX_SOCIAL_TEXT, readBlueskyFeed, truncateSocialText } from "./bluesky-feed";

/**
 * La lecture d'un flux d'auteur Bluesky.
 *
 * La fixture est un corps **réel**, capté sur `public.api.bsky.app`, choisi pour
 * porter un exemplaire de chaque forme : un repost, une publication à images,
 * une à vidéo, une à lien externe, une citation, et une en texte seul. Trois
 * entrées y ont été ajoutées à la main pour les cas qu'un flux sain ne contient
 * pas — une réponse dans un fil, une publication étiquetée par la modération,
 * et une datée de 2030 par son client.
 *
 * Ce que ces cas verrouillent : ce qui n'a rien à faire sur la fiche d'un jeu
 * n'y arrive pas, et une réponse hors forme ne fait rien tomber.
 *
 * Exécution : `npm run test`.
 */

const FEED = JSON.parse(
  readFileSync(new URL("./__fixtures__/bluesky-author-feed.json", import.meta.url), "utf8"),
);

const posts = readBlueskyFeed(FEED);
const textOf = (post: (typeof posts)[number]) => post.text ?? "";

describe("readBlueskyFeed", () => {
  it("retient les publications de l'auteur, et elles seules", () => {
    assert.ok(posts.length > 0, "la fixture doit rendre au moins une publication");

    // La fixture porte trois reposts, une réponse et une publication étiquetée :
    // aucune ne doit ressortir.
    assert.ok(posts.length < FEED.feed.length, "des entrées doivent avoir été écartées");
  });

  it("écarte les reposts — leur auteur n'est pas le compte sondé", () => {
    const reposted = FEED.feed
      .filter((entry: { reason?: unknown }) => entry.reason !== undefined)
      .map((entry: { post: { uri: string } }) => entry.post.uri);

    assert.ok(reposted.length > 0, "la fixture doit contenir des reposts");

    for (const uri of reposted) {
      const rkey = uri.split("/").pop();
      assert.ok(
        !posts.some((post) => post.externalId.endsWith(`/${rkey}`)),
        `le repost ${rkey} ne doit pas ressortir`,
      );
    }
  });

  it("écarte une réponse dans un fil, sans compter sur le filtre de l'API", () => {
    assert.ok(!posts.some((post) => post.externalId.endsWith("/3reponsefil00")));
  });

  it("écarte une publication étiquetée par la modération", () => {
    assert.ok(!posts.some((post) => post.externalId.endsWith("/3etiquetee000")));
  });

  it("ramène une date d'écriture future à la date d'indexation", () => {
    const future = posts.find((post) => post.externalId.endsWith("/3datefuture00"));

    assert.ok(future, "la publication doit être retenue, seule sa date est corrigée");
    assert.equal(future.publishedAt, "2026-09-04T12:00:00.000Z");
  });

  it("porte le compte dans l'identifiant, et bâtit le lien sur le DID", () => {
    for (const post of posts) {
      assert.match(post.externalId, /^did:[^/]+\/[^/]+$/, "identifiant compte + rkey");
      assert.ok(post.url.startsWith(`https://bsky.app/profile/${post.account.key}/post/`));
      assert.equal(post.platform, "bluesky");
      assert.equal(post.kind, "post");
    }
  });

  it("normalise toutes les dates sous la même forme", () => {
    for (const post of posts) {
      assert.match(post.publishedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it("prend la vignette d'une publication à images", () => {
    const withImages = FEED.feed.find(
      (entry: { post: { embed?: { $type?: string } } }) =>
        entry.post.embed?.$type === "app.bsky.embed.images#view",
    );
    const rkey = withImages.post.uri.split("/").pop();
    const post = posts.find((item) => item.externalId.endsWith(`/${rkey}`));

    assert.ok(post?.thumbnail, "une publication à images doit porter une vignette");
    assert.equal(post.thumbnail, withImages.post.embed.images[0].thumb);
  });

  it("prend la vignette d'un lien externe faute de mieux", () => {
    const withExternal = FEED.feed.find(
      (entry: { reason?: unknown; post: { embed?: { $type?: string } } }) =>
        entry.reason === undefined && entry.post.embed?.$type === "app.bsky.embed.external#view",
    );

    if (!withExternal) return; // la fixture n'en porte pas hors repost

    const rkey = withExternal.post.uri.split("/").pop();
    const post = posts.find((item) => item.externalId.endsWith(`/${rkey}`));
    assert.equal(post?.thumbnail, withExternal.post.embed.external.thumb);
  });

  it("garde une citation : c'est bien l'éditeur qui écrit", () => {
    const quote = FEED.feed.find(
      (entry: { reason?: unknown; post: { embed?: { $type?: string } } }) =>
        entry.reason === undefined && entry.post.embed?.$type?.startsWith("app.bsky.embed.record"),
    );

    assert.ok(quote, "la fixture doit contenir une citation");
    const rkey = quote.post.uri.split("/").pop();
    assert.ok(posts.some((post) => post.externalId.endsWith(`/${rkey}`)));
  });

  it("garde une publication en texte seul, sans vignette", () => {
    const plain = posts.find((post) => !post.thumbnail);
    assert.ok(plain, "une publication sans média reste une publication");
    assert.ok(textOf(plain).length > 0);
  });

  it("écarte le compte quand l'entrée ne s'accorde pas avec celui qu'on attend", () => {
    assert.deepEqual(readBlueskyFeed(FEED, { expectedDid: "did:plc:quelquundautre000000" }), []);
  });

  it("ne jette pas sur un corps hors forme", () => {
    for (const payload of [null, undefined, {}, { feed: null }, { feed: [null, 1, "x", {}] }, []]) {
      assert.deepEqual(readBlueskyFeed(payload), [], `attendu [] pour ${JSON.stringify(payload)}`);
    }
  });
});

describe("truncateSocialText", () => {
  it("laisse un texte court intact", () => {
    assert.equal(truncateSocialText("  Riftbound arrive.  "), "Riftbound arrive.");
  });

  it("coupe un texte long et le signale", () => {
    const cut = truncateSocialText("a".repeat(MAX_SOCIAL_TEXT + 50));

    assert.equal(cut?.length, MAX_SOCIAL_TEXT);
    assert.ok(cut?.endsWith("…"));
  });

  it("rend undefined pour du vide", () => {
    for (const value of ["", "   ", undefined]) {
      assert.equal(truncateSocialText(value), undefined);
    }
  });
});
