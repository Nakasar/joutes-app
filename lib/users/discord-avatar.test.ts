import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDiscordImageUrl, shouldRefreshDiscordImage } from "./discord-avatar";

/**
 * Tests du remplacement de l'avatar Discord à la connexion.
 *
 * Exécution : `npm run test`.
 */

const OLD = "https://cdn.discordapp.com/avatars/123456789/aaaa1111.png";
const NEW = "https://cdn.discordapp.com/avatars/123456789/bbbb2222.png";
const DEFAULT = "https://cdn.discordapp.com/embed/avatars/3.png";

describe("isDiscordImageUrl", () => {
  it("reconnaît les adresses du CDN de Discord", () => {
    assert.equal(isDiscordImageUrl(OLD), true);
    assert.equal(isDiscordImageUrl(DEFAULT), true);
  });

  it("refuse le reste", () => {
    assert.equal(isDiscordImageUrl("https://abc.public.blob.vercel-storage.com/users/1/avatar.png"), false);
    assert.equal(isDiscordImageUrl("http://cdn.discordapp.com/avatars/1/a.png"), false);
    assert.equal(isDiscordImageUrl("https://cdn.discordapp.com.example.com/a.png"), false);
    assert.equal(isDiscordImageUrl(""), false);
    assert.equal(isDiscordImageUrl(undefined), false);
    assert.equal(isDiscordImageUrl("pas une adresse"), false);
  });
});

describe("shouldRefreshDiscordImage", () => {
  it("remplace un ancien avatar Discord par le nouveau", () => {
    assert.equal(shouldRefreshDiscordImage(OLD, NEW), true);
    assert.equal(shouldRefreshDiscordImage(OLD, DEFAULT), true);
  });

  it("ne réécrit pas une image inchangée", () => {
    assert.equal(shouldRefreshDiscordImage(NEW, NEW), false);
  });

  it("ne touche pas une image qui ne vient pas de Discord", () => {
    assert.equal(shouldRefreshDiscordImage("https://example.test/a.png", NEW), false);
  });

  it("ne donne pas d'image à un compte qui n'en a pas", () => {
    assert.equal(shouldRefreshDiscordImage(undefined, NEW), false);
    assert.equal(shouldRefreshDiscordImage("", NEW), false);
  });

  it("ignore une image reçue invalide", () => {
    assert.equal(shouldRefreshDiscordImage(OLD, undefined), false);
    assert.equal(shouldRefreshDiscordImage(OLD, "https://example.test/a.png"), false);
  });
});
