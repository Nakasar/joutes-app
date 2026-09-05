import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { contentEntry, deckEntry, feedGameScope, newsEntry, socialEntry, sortFeedEntries } from "./entries";
import type { Deck } from "@/lib/types/Deck";
import type { News } from "@/lib/types/News";
import type { UserContent } from "@/lib/types/UserContent";
import type { GameSocialPost } from "@/lib/types/GameSocialPost";

/**
 * La conversion des quatre sources en entrées du fil, et ce qu'un client
 * tiers en attend : des identifiants, des dates ISO, une provenance de
 * vignette pour les decks, et le bon repli de titre pour une publication.
 *
 * Exécution : `npm run test`.
 */

describe("newsEntry", () => {
  const news = {
    id: "n1",
    title: "Titre",
    translations: [{ lang: "en", title: "Title" }],
    author: { displayName: "Rédaction" },
    gameIds: ["g1", "g2"],
    createdAt: new Date("2026-09-01T10:00:00Z"),
    banner: "https://img/banner.jpg",
  } as unknown as News;

  it("prend le titre de la langue demandée, et retombe sur la VO", () => {
    assert.equal(newsEntry(news, "en").title, "Title");
    assert.equal(newsEntry(news, "de").title, "Titre");
  });

  it("porte le premier jeu, la date en ISO et la bannière en vignette", () => {
    const entry = newsEntry(news, "fr");
    assert.equal(entry.type, "news");
    assert.equal(entry.gameId, "g1");
    assert.equal(entry.publishedAt, "2026-09-01T10:00:00.000Z");
    assert.equal(entry.thumbnail, "https://img/banner.jpg");
    assert.equal(entry.source, "Rédaction");
  });
});

describe("contentEntry", () => {
  it("garde le genre, l'auteur et l'adresse d'une vidéo", () => {
    const entry = contentEntry({
      id: "c1",
      authorId: "u1",
      kind: "video",
      visibility: "public",
      title: "Vidéo",
      summary: "Un résumé",
      url: "https://youtu.be/x",
      duration: "12 min",
      gameId: "g1",
      publishedAt: "2026-09-02T00:00:00.000Z",
    } as UserContent);

    assert.equal(entry.type, "content");
    assert.equal(entry.kind, "video");
    assert.equal(entry.authorId, "u1");
    assert.equal(entry.url, "https://youtu.be/x");
    assert.equal(entry.duration, "12 min");
    assert.equal(entry.source, "Un résumé");
  });
});

describe("deckEntry", () => {
  const base = {
    id: "d1",
    gameId: "g1",
    name: "Mon deck",
    creatorName: "Alice",
    updatedAt: new Date("2026-09-03T00:00:00Z"),
  };

  it("cadre en haut une couverture qui est une carte", () => {
    const entry = deckEntry({ ...base, coverCardId: "card", coverImage: "https://img/card.jpg" } as Deck);
    assert.equal(entry.thumbnail, "https://img/card.jpg");
    assert.equal(entry.framing, "top");
  });

  it("cadre au centre une image déposée", () => {
    const entry = deckEntry({ ...base, coverImageUrl: "https://blob/x.jpg" } as Deck);
    assert.equal(entry.thumbnail, "https://blob/x.jpg");
    assert.equal(entry.framing, "center");
  });
});

describe("socialEntry", () => {
  const post = {
    id: "s1",
    gameId: "g1",
    platform: "youtube",
    kind: "video",
    url: "https://youtube.com/watch?v=1",
    account: { key: "UC1", handle: "@chaine", displayName: "La chaîne", url: "https://youtube.com/@chaine" },
    publishedAt: "2026-09-04T00:00:00.000Z",
    durationSeconds: 754,
  } as GameSocialPost;

  it("titre par le texte, sinon par le nom du compte, sinon par le handle", () => {
    assert.equal(socialEntry({ ...post, text: "Bonjour" }).title, "Bonjour");
    assert.equal(socialEntry({ ...post, text: "  " }).title, "La chaîne");
    assert.equal(socialEntry(post).title, "La chaîne");
    assert.equal(socialEntry({ ...post, account: { ...post.account, displayName: undefined } }).title, "@chaine");
  });

  it("porte la plateforme, le compte et la durée formatée", () => {
    const entry = socialEntry(post);
    assert.equal(entry.platform, "youtube");
    assert.equal(entry.source, "@chaine");
    assert.equal(entry.accountUrl, "https://youtube.com/@chaine");
    assert.equal(entry.duration, "12:34");
  });
});

describe("sortFeedEntries", () => {
  it("range de la plus récente à la plus ancienne, sans réordonner les ex æquo", () => {
    const sorted = sortFeedEntries([
      { id: "a", publishedAt: "2026-01-01T00:00:00Z" },
      { id: "b", publishedAt: "2026-03-01T00:00:00Z" },
      { id: "c", publishedAt: "2026-03-01T00:00:00Z" },
      { id: "d", publishedAt: "pas une date" },
    ]);
    assert.deepEqual(sorted.map((e) => e.id), ["b", "c", "a", "d"]);
  });
});

describe("feedGameScope", () => {
  it("un jeu choisi l'emporte, sinon les suivis, sinon rien", () => {
    assert.deepEqual(feedGameScope("g9", ["g1"]), ["g9"]);
    assert.deepEqual(feedGameScope(null, ["g1", "g2"]), ["g1", "g2"]);
    assert.equal(feedGameScope(null, []), undefined);
    assert.equal(feedGameScope(undefined, undefined), undefined);
  });
});
