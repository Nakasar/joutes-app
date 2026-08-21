/**
 * Le nom de fichier qu'on accepte de recoller dans une clé Vercel Blob.
 *
 * Le nom vient du navigateur, donc du client : rien n'empêche un envoi
 * multipart fabriqué à la main d'annoncer `../../autre-groupe/logo.png`. La clé
 * Blob n'est pas un chemin de disque, mais elle se lit comme une arborescence —
 * un nom porteur de séparateurs sort du préfixe qu'on lui a choisi et va
 * polluer l'espace d'un autre groupe.
 *
 * D'où la règle : on ne garde que le dernier segment, et dans ce segment que
 * des caractères sans surprise. Tout le reste devient un tiret — ce qui règle
 * du même coup les espaces et l'unicode, qu'on ne veut pas voir dans une URL
 * publique.
 */
export function readBlobFilename(name: string, fallback: string): string {
  // Les deux séparateurs : un client Windows envoie parfois le chemin complet.
  const lastSegment = name.split(/[/\\]/).pop() ?? "";

  const safe = lastSegment
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    // Ni tiret ni point aux extrémités : `..` seul redeviendrait un segment de
    // remontée, et un nom qui commence par un point se cache dans les listings.
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);

  return safe.length > 0 ? safe : fallback;
}
