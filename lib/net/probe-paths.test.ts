import assert from "node:assert/strict";
import { test } from "node:test";

import { isProbePath } from "./probe-paths.ts";

test("les sondes de scanners sont reconnues", () => {
  for (const path of [
    "/xmlrpc.php",
    "/wp-login.php",
    "/wp-admin/setup-config.php",
    "/wp-content/plugins/x/readme.txt",
    "/.env",
    "/.env.production",
    "/.git/config",
    "/api/.env",
    "/backup.sql",
    "/config.yml",
    "/phpmyadmin/index.php",
    "/index.php7",
    "/cgi-bin/test.cgi",
    "/fr/admin.PHP",
  ]) {
    assert.equal(isProbePath(path), true, path);
  }
});

test("les adresses du site ne sont pas des sondes", () => {
  for (const path of [
    "/",
    "/en/games/riftbound/cards/OGN-001",
    "/games/riftbound/cards/ogn-001.5",
    "/.well-known/oauth-protected-resource",
    "/.well-known/mcp/server-card.json",
    "/robots.txt",
    "/sitemaps/riftbound---0.xml",
    "/auth.md",
    "/images/logo.png",
    "/manifest.webmanifest",
    "/users/john.doe",
    "/api/games/riftbound/cards",
    "/lairs/keys",
    "/environment",
  ]) {
    assert.equal(isProbePath(path), false, path);
  }
});
