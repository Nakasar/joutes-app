import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readBlobFilename } from "./blob-filename";

/**
 * Le nom de fichier recollé dans une clé Vercel Blob.
 *
 * Ce que ces cas verrouillent : aucun nom, si tordu soit-il, ne fait sortir la
 * clé du préfixe qu'on lui a choisi. Le nom arrive du navigateur, donc du
 * client, et un envoi multipart se fabrique à la main.
 *
 * Exécution : `npm run test`.
 */

describe("readBlobFilename", () => {
  it("garde un nom ordinaire", () => {
    assert.equal(readBlobFilename("Logo-Final.PNG", "image"), "logo-final.png");
  });

  it("ne garde que le dernier segment d'un chemin", () => {
    assert.equal(readBlobFilename("../../autre-groupe/logo.png", "image"), "logo.png");
    assert.equal(readBlobFilename("C:\\Users\\moi\\banniere.jpg", "image"), "banniere.jpg");
  });

  it("neutralise une remontée déguisée en nom", () => {
    assert.equal(readBlobFilename("..", "image"), "image");
    assert.equal(readBlobFilename("....//....//logo.png", "image"), "logo.png");
  });

  it("remplace espaces et unicode par des tirets", () => {
    assert.equal(readBlobFilename("Mon emblème 2024.webp", "image"), "mon-embl-me-2024.webp");
  });

  it("retombe sur le nom de repli quand il ne reste rien", () => {
    assert.equal(readBlobFilename("", "image"), "image");
    assert.equal(readBlobFilename("///", "image"), "image");
    assert.equal(readBlobFilename("???", "image"), "image");
  });

  it("borne la longueur", () => {
    assert.equal(readBlobFilename(`${"a".repeat(200)}.png`, "image").length, 80);
  });
});
