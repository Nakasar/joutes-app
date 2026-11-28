/**
 * L'adresse qui identifie un appelant pour une limite de débit.
 *
 * Une adresse IPv4 désigne un client (ou un réseau entier derrière une box).
 * En IPv6, un client reçoit couramment un préfixe /64 entier et peut changer
 * d'adresse à chaque requête : limiter par adresse complète ne limiterait
 * rien, chaque adresse ouvrant un compteur neuf. On compte donc par /64.
 */
export function rateLimitAddress(address: string): string {
  const ip = address.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (!ip.includes(":")) return ip;

  // IPv4 portée en IPv6 (`::ffff:203.0.113.7`) : c'est l'adresse IPv4 qui compte.
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1];

  // Forme développée : `::` remplace autant de groupes nuls qu'il en manque.
  const [head, tail] = ip.split("::") as [string, string | undefined];
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups =
    tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  if (groups.length < 4) return ip;

  return `${groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * L'adresse de l'appelant, telle que Vercel la transmet. `x-forwarded-for`
 * peut porter plusieurs adresses : la première est celle du client.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for");
  const address = forwarded?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim();
  return address ? rateLimitAddress(address) : "unknown";
}
