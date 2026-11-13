import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePlayGroupTheme, playGroupSettingsSchema } from "./settings.ts";

test("un réglage vide est refusé", () => {
  assert.equal(playGroupSettingsSchema.safeParse({}).success, false);
});

test("une clé inconnue est refusée", () => {
  assert.equal(playGroupSettingsSchema.safeParse({ accentColor: "red" }).success, false);
});

test("le nom ne peut pas être vidé", () => {
  assert.equal(playGroupSettingsSchema.safeParse({ name: "  " }).success, false);
});

test("une image doit être une adresse http(s) ou vide", () => {
  assert.equal(playGroupSettingsSchema.safeParse({ logo: "javascript:alert(1)" }).success, false);
  assert.equal(playGroupSettingsSchema.safeParse({ logo: "" }).success, true);
  assert.equal(playGroupSettingsSchema.safeParse({ logo: "https://x.test/a.png" }).success, true);
});

test("le thème garde l'accent et retire ce qui est vidé", () => {
  const input = playGroupSettingsSchema.parse({ logo: "", tagline: "Thionville" });
  assert.deepEqual(
    mergePlayGroupTheme({ logo: "https://x.test/a.png", accentColor: "teal", banner: "https://x.test/b.png" }, input),
    { accentColor: "teal", banner: "https://x.test/b.png", tagline: "Thionville" },
  );
});

test("sans clé de thème, le thème n'est pas réécrit", () => {
  const input = playGroupSettingsSchema.parse({ visibility: "private" });
  assert.equal(mergePlayGroupTheme({ logo: "https://x.test/a.png" }, input), null);
});
