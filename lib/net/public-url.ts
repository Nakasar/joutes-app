/**
 * Ce qu'un serveur de Joutes a le droit d'aller chercher pour le compte d'un
 * utilisateur.
 *
 * Une route qui récupère une URL fournie de l'extérieur parle depuis le
 * réseau du serveur, pas depuis celui de l'appelant : sans garde-fou, elle
 * devient un moyen d'atteindre `localhost`, le service de métadonnées de
 * l'hébergeur (169.254.169.254) ou n'importe quelle machine du réseau privé.
 * Ce module dit ce qui est public, et donc atteignable.
 *
 * Les prédicats sont volontairement sans effet de bord ni accès réseau : la
 * résolution DNS, elle, appartient à l'appelant (`lib/news/fetch-source.ts`),
 * qui repasse ici chaque adresse obtenue.
 */

/** Adresses IPv4 qui ne sortent jamais du réseau local, par bloc. */
const BLOCKED_IPV4_BLOCKS: Array<{ base: string; bits: number }> = [
  { base: "0.0.0.0", bits: 8 }, // « cet hôte »
  { base: "10.0.0.0", bits: 8 }, // privé
  { base: "100.64.0.0", bits: 10 }, // CGNAT
  { base: "127.0.0.0", bits: 8 }, // boucle locale
  { base: "169.254.0.0", bits: 16 }, // lien-local, dont les métadonnées cloud
  { base: "172.16.0.0", bits: 12 }, // privé
  { base: "192.0.0.0", bits: 24 }, // affectations IETF
  { base: "192.0.2.0", bits: 24 }, // documentation
  { base: "192.168.0.0", bits: 16 }, // privé
  { base: "198.18.0.0", bits: 15 }, // bancs d'essai
  { base: "224.0.0.0", bits: 4 }, // multicast
  { base: "240.0.0.0", bits: 4 }, // réservé, dont 255.255.255.255
];

/** Noms d'hôtes qui désignent la machine elle-même ou un réseau interne. */
const BLOCKED_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".intranet", ".home.arpa"];

function ipv4ToInt(address: string): number | undefined {
  const parts = address.split(".");
  if (parts.length !== 4) return undefined;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const octet = Number(part);
    if (octet > 255) return undefined;
    value = value * 256 + octet;
  }
  return value;
}

/**
 * Vraie pour toute adresse IP qu'une requête sortante ne doit pas atteindre.
 * Une adresse illisible est traitée comme bloquée : mieux vaut refuser un
 * import qu'ouvrir un chemin vers l'intérieur.
 */
export function isBlockedIpAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized) return true;

  // Les adresses IPv4 déguisées en IPv6 (`::ffff:127.0.0.1`) doivent être
  // jugées sur leur partie IPv4, sans quoi la boucle locale passe.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  const candidate = mapped ? mapped[1] : normalized;

  if (candidate.includes(":")) return isBlockedIpv6Address(candidate);

  const value = ipv4ToInt(candidate);
  if (value === undefined) return true;

  return BLOCKED_IPV4_BLOCKS.some(({ base, bits }) => {
    const baseValue = ipv4ToInt(base);
    if (baseValue === undefined) return false;
    const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (baseValue & mask) >>> 0;
  });
}

function isBlockedIpv6Address(address: string): boolean {
  const withoutZone = address.split("%")[0];
  if (withoutZone === "::" || withoutZone === "::1") return true;

  const firstGroup = withoutZone.startsWith("::") ? "0" : withoutZone.split(":")[0];
  const prefix = Number.parseInt(firstGroup || "0", 16);
  if (Number.isNaN(prefix)) return true;

  // fc00::/7 — adresses locales uniques ; fe80::/10 — lien-local.
  if ((prefix & 0xfe00) === 0xfc00) return true;
  if ((prefix & 0xffc0) === 0xfe80) return true;

  return false;
}

export type PublicUrlRejection = "invalid" | "protocol" | "private";

/**
 * Analyse une URL saisie par un utilisateur et la rend seulement si elle
 * désigne une ressource publique en HTTP(S). Le nom d'hôte n'est pas encore
 * résolu à ce stade : `fetch-source.ts` vérifie en plus les adresses derrière
 * le nom, et chaque redirection.
 */
export function parsePublicHttpUrl(raw: string): { url: URL } | { rejection: PublicUrlRejection } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { rejection: "invalid" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { rejection: "protocol" };
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname) return { rejection: "invalid" };

  if (hostname === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return { rejection: "private" };
  }

  // Une URL écrite directement avec une IP se juge tout de suite ; un nom de
  // domaine attend sa résolution.
  const looksLikeIp = /^\[?[0-9a-f:.]+\]?$/i.test(hostname) && (/^\[|:/.test(hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(hostname));
  if (looksLikeIp && isBlockedIpAddress(hostname)) {
    return { rejection: "private" };
  }

  return { url };
}
