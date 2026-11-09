import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { IMAGE_KINDS_WITH_GIF, readImageUpload, sniffImageKind, STILL_IMAGE_KINDS } from "./image-upload.ts";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];

function form(bytes: number[] | string, type: string, name = "image.png"): FormData {
  const data = new FormData();
  const body = typeof bytes === "string" ? bytes : new Uint8Array(bytes);
  data.set("file", new File([body], name, { type }));
  return data;
}

describe("sniffImageKind", () => {
  it("reconnaît les quatre formats à leur signature", () => {
    assert.equal(sniffImageKind(new Uint8Array(PNG)), "png");
    assert.equal(sniffImageKind(new Uint8Array(JPEG)), "jpeg");
    assert.equal(sniffImageKind(new Uint8Array(GIF)), "gif");
    assert.equal(sniffImageKind(new Uint8Array(WEBP)), "webp");
  });

  it("ne reconnaît ni du texte, ni un RIFF qui n'est pas du WebP, ni un fichier vide", () => {
    assert.equal(sniffImageKind(new TextEncoder().encode("<svg onload=alert(1)>")), null);
    assert.equal(sniffImageKind(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45])), null);
    assert.equal(sniffImageKind(new Uint8Array()), null);
  });
});

describe("readImageUpload", () => {
  const options = { kinds: STILL_IMAGE_KINDS, maxMegabytes: 1 };

  it("rend le fichier quand tout concorde", async () => {
    const upload = await readImageUpload(form(PNG, "image/png"), options);
    assert.ok("file" in upload);
  });

  it("refuse l'absence de fichier", async () => {
    assert.deepEqual(await readImageUpload(new FormData(), options), { error: "Aucun fichier fourni" });
    const text = new FormData();
    text.set("file", "pas un fichier");
    assert.deepEqual(await readImageUpload(text, options), { error: "Aucun fichier fourni" });
  });

  it("refuse un type annoncé hors liste", async () => {
    assert.deepEqual(await readImageUpload(form(GIF, "image/gif"), options), {
      error: "Type de fichier non autorisé. Utilisez JPG, PNG ou WebP.",
    });
    assert.ok("file" in (await readImageUpload(form(GIF, "image/gif"), { ...options, kinds: IMAGE_KINDS_WITH_GIF })));
  });

  it("refuse un contenu qui n'est pas ce que le type annonce", async () => {
    const upload = await readImageUpload(form("<html><script>alert(1)</script>", "image/png"), options);
    assert.deepEqual(upload, { error: "Type de fichier non autorisé. Utilisez JPG, PNG ou WebP." });
  });

  it("refuse un fichier trop lourd, avec la limite dans le message", async () => {
    const heavy = [...PNG, ...new Array(1024 * 1024).fill(0)];
    assert.deepEqual(await readImageUpload(form(heavy, "image/png"), options), {
      error: "Le fichier est trop volumineux (max 1 Mo)",
    });
  });
});
