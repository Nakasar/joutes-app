import { test } from "node:test";
import assert from "node:assert/strict";
import { readNotificationSettings } from "./settings-view.ts";

const enabledOf = (settings: ReturnType<typeof readNotificationSettings>, channel: string, type: string) =>
  settings.find((s) => s.channel === channel && s.type === type)?.enabled;

test("sans réglage, seul le push est ouvert", () => {
  const settings = readNotificationSettings(undefined, false);
  assert.equal(settings.length, 5);
  assert.equal(enabledOf(settings, "app", "push"), true);
  assert.equal(enabledOf(settings, "emails", "weekly"), false);
  assert.equal(enabledOf(settings, "discord", "dm"), false);
});

test("Discord n'est ouvert qu'avec un compte lié", () => {
  const notifications = { discord: { dm: { enabled: true } } };
  assert.equal(enabledOf(readNotificationSettings(notifications, false), "discord", "dm"), false);
  assert.equal(readNotificationSettings(notifications, false).find((s) => s.channel === "discord")?.available, false);
  assert.equal(enabledOf(readNotificationSettings(notifications, true), "discord", "dm"), true);
});

test("le push coupé reste coupé", () => {
  assert.equal(enabledOf(readNotificationSettings({ app: { push: { enabled: false } } }, false), "app", "push"), false);
});
