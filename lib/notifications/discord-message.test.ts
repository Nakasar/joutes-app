import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discordNotificationMessage, joutesBaseUrl, JOUTES_EMBED_COLOR } from "./discord-message";

const base = {
  type: "user",
  title: "Une place s'est libérée",
  description: "Acceptez-la avant jeudi.",
  createdAt: "2026-09-23T10:00:00.000Z",
} as const;

describe("message privé Discord d'une notification", () => {
  it("mène à la destination de la notification, en adresse absolue", () => {
    const message = discordNotificationMessage({ ...base, link: "/events/abc" }, "https://joutes.app/");
    const [embed] = message.embeds;
    assert.equal(embed.url, "https://joutes.app/events/abc");
    assert.equal(embed.title, "Une place s'est libérée");
    assert.equal(embed.description, "Acceptez-la avant jeudi.");
    assert.equal(embed.color, JOUTES_EMBED_COLOR);
    assert.equal(embed.timestamp, base.createdAt);
  });

  it("retombe sur la liste des notifications sans destination", () => {
    const message = discordNotificationMessage(base, "https://joutes.app");
    assert.equal(message.embeds[0].url, "https://joutes.app/notifications");
  });

  it("n'envoie jamais un lien vers un autre domaine", () => {
    const message = discordNotificationMessage({ ...base, link: "https://evil.example" }, "https://joutes.app");
    assert.equal(message.embeds[0].url, "https://joutes.app/notifications");
  });

  it("borne titre et description aux limites de Discord", () => {
    const message = discordNotificationMessage(
      { ...base, title: "t".repeat(300), description: "d".repeat(5000) },
      "https://joutes.app"
    );
    assert.equal(message.embeds[0].title.length, 256);
    assert.equal(message.embeds[0].description?.length, 4096);
  });
});

describe("adresse du site", () => {
  it("préfère l'adresse publique, puis celle de l'authentification", () => {
    assert.equal(joutesBaseUrl({ NEXT_PUBLIC_BASE_URL: "https://a.test", BETTER_AUTH_URL: "https://b.test" }), "https://a.test");
    assert.equal(joutesBaseUrl({ BETTER_AUTH_URL: "https://b.test" }), "https://b.test");
    assert.equal(joutesBaseUrl({}), "https://joutes.app");
  });
});
