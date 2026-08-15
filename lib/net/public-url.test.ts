import test from "node:test";
import assert from "node:assert/strict";
import { isBlockedIpAddress, parsePublicHttpUrl } from "@/lib/net/public-url";

test("isBlockedIpAddress refuse la boucle locale et les réseaux privés", () => {
  for (const address of [
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "0.0.0.0",
    "100.64.0.1",
    "255.255.255.255",
  ]) {
    assert.equal(isBlockedIpAddress(address), true, address);
  }
});

test("isBlockedIpAddress refuse le service de métadonnées de l'hébergeur", () => {
  // L'adresse que vise une attaque SSRF sur presque tous les hébergeurs.
  assert.equal(isBlockedIpAddress("169.254.169.254"), true);
});

test("isBlockedIpAddress refuse une IPv4 déguisée en IPv6", () => {
  assert.equal(isBlockedIpAddress("::ffff:127.0.0.1"), true);
  assert.equal(isBlockedIpAddress("::ffff:169.254.169.254"), true);
});

test("isBlockedIpAddress refuse les adresses IPv6 locales", () => {
  for (const address of ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "[::1]"]) {
    assert.equal(isBlockedIpAddress(address), true, address);
  }
});

test("isBlockedIpAddress accepte les adresses publiques", () => {
  for (const address of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1", "2001:4860:4860::8888"]) {
    assert.equal(isBlockedIpAddress(address), false, address);
  }
});

test("isBlockedIpAddress refuse ce qu'il ne sait pas lire", () => {
  for (const address of ["", "  ", "pas-une-ip", "999.1.1.1", "1.2.3"]) {
    assert.equal(isBlockedIpAddress(address), true, JSON.stringify(address));
  }
});

test("parsePublicHttpUrl accepte une adresse publique en http(s)", () => {
  const result = parsePublicHttpUrl("https://playriftbound.com/fr-fr/news/faq/");

  assert.ok("url" in result);
  assert.equal(result.url.hostname, "playriftbound.com");
});

test("parsePublicHttpUrl refuse les protocoles autres que http(s)", () => {
  for (const raw of ["file:///etc/passwd", "ftp://exemple.com/x", "gopher://exemple.com"]) {
    const result = parsePublicHttpUrl(raw);
    assert.ok("rejection" in result, raw);
    assert.equal(result.rejection, "protocol");
  }
});

test("parsePublicHttpUrl refuse la machine elle-même et les noms internes", () => {
  for (const raw of ["http://localhost:3000/x", "http://mongo.internal/x", "http://nas.local/x"]) {
    const result = parsePublicHttpUrl(raw);
    assert.ok("rejection" in result, raw);
    assert.equal(result.rejection, "private");
  }
});

test("parsePublicHttpUrl refuse une adresse IP privée écrite en clair", () => {
  for (const raw of ["http://127.0.0.1:8080/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/"]) {
    const result = parsePublicHttpUrl(raw);
    assert.ok("rejection" in result, raw);
    assert.equal(result.rejection, "private");
  }
});

test("parsePublicHttpUrl juge une IPv6 littérale sans passer par le DNS", () => {
  // Écrite entre crochets, elle se reconnaît à coup sûr — un test sur les
  // seuls caractères confondrait `face.be` avec de l'hexadécimal.
  const blocked = parsePublicHttpUrl("http://[fe80::1]/");
  assert.ok("rejection" in blocked);
  assert.equal(blocked.rejection, "private");

  const allowed = parsePublicHttpUrl("http://[2001:4860:4860::8888]/");
  assert.ok("url" in allowed);
});

test("parsePublicHttpUrl démasque les IPv4 écrites autrement", () => {
  // `2130706433` et `0x7f.1` valent 127.0.0.1 : l'analyseur d'URL les ramène
  // en notation pointée, c'est elle qu'on juge.
  for (const raw of ["http://2130706433/", "http://0x7f.1/"]) {
    const result = parsePublicHttpUrl(raw);
    assert.ok("rejection" in result, raw);
    assert.equal(result.rejection, "private");
  }
});

test("parsePublicHttpUrl ne prend pas un domaine hexadécimal pour une IP", () => {
  const result = parsePublicHttpUrl("https://face.be/news");

  assert.ok("url" in result);
});

test("parsePublicHttpUrl refuse ce qui n'est pas une URL", () => {
  const result = parsePublicHttpUrl("pas une adresse");

  assert.ok("rejection" in result);
  assert.equal(result.rejection, "invalid");
});
