import { externalUrl } from "@/lib/lairs/urls";

/**
 * Les liens d'un profil : ce qu'on affiche, et avec quelle icône.
 *
 * **L'icône est déduite du domaine, jamais choisie.** Un menu de plus serait un
 * choix de plus à se tromper, et un lien Twitch portant une icône YouTube ment
 * plus qu'il n'informe.
 *
 * Trois champs se sont succédé pour dire la même chose : `website` (un seul
 * lien), `socialLinks[]` (dix), et maintenant `showcase.links[]` (dix, avec un
 * libellé). Les trois sont lus et fondus ici tant que tous les comptes n'ont
 * pas enregistré leur vitrine une fois — la vitrine replie les anciens champs
 * au premier enregistrement, mais rien ne force personne à enregistrer.
 *
 * Tout ce qui n'est pas une adresse http(s) est **écarté**, pas rendu : ces
 * valeurs finissent dans des `href`, et la page de profil tombait entière sur
 * un `new URL()` non gardé pour une seule adresse malformée en base.
 */

export const USER_LINK_KINDS = [
  "twitch",
  "youtube",
  "discord",
  "bluesky",
  "instagram",
  "tiktok",
  "x",
  "mastodon",
  "facebook",
  "reddit",
  "website",
] as const;

export type UserLinkKind = (typeof USER_LINK_KINDS)[number];

export type UserLink = {
  /** L'adresse normalisée, prête pour un `href`. */
  url: string;
  kind: UserLinkKind;
  /** L'hôte sans son `www.` — ce qu'on écrit à côté de l'icône faute de libellé. */
  host: string;
  label?: string;
};

/**
 * Les domaines reconnus.
 *
 * Une correspondance par suffixe, pour que `www.youtube.com`, `m.youtube.com`
 * et `youtu.be` mènent tous à la même icône. La liste est volontairement courte :
 * une plateforme qui n'y figure pas prend le globe, ce qui est correct plutôt
 * qu'approximatif.
 */
const DOMAINS: { suffixes: string[]; kind: UserLinkKind }[] = [
  { suffixes: ["twitch.tv"], kind: "twitch" },
  { suffixes: ["youtube.com", "youtu.be"], kind: "youtube" },
  { suffixes: ["discord.gg", "discord.com", "discordapp.com"], kind: "discord" },
  { suffixes: ["bsky.app", "bsky.social"], kind: "bluesky" },
  { suffixes: ["instagram.com"], kind: "instagram" },
  { suffixes: ["tiktok.com"], kind: "tiktok" },
  { suffixes: ["x.com", "twitter.com"], kind: "x" },
  { suffixes: ["mastodon.social", "piaille.fr"], kind: "mastodon" },
  { suffixes: ["facebook.com", "fb.com"], kind: "facebook" },
  { suffixes: ["reddit.com"], kind: "reddit" },
];

/** Le domaine sans son `www.`, en minuscules. */
export function readLinkHost(url: string): string | null {
  const safe = externalUrl(url);
  if (!safe) {
    return null;
  }

  return new URL(safe).hostname.toLowerCase().replace(/^www\./, "");
}

/** La plateforme désignée par l'adresse, ou `website` faute de la reconnaître. */
export function readLinkKind(url: string): UserLinkKind {
  const host = readLinkHost(url);
  if (!host) {
    return "website";
  }

  const match = DOMAINS.find((domain) =>
    // Le suffixe doit couvrir un domaine entier : `notyoutube.com` ne doit pas
    // passer pour YouTube.
    domain.suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)),
  );

  return match?.kind ?? "website";
}

/** Ce que la lecture a besoin de connaître du compte. */
export type UserLinksSource = {
  website?: string;
  socialLinks?: string[];
  showcase?: { links?: { url: string; label?: string }[] };
};

/** Le nombre de liens qu'une vitrine affiche. */
export const MAX_USER_LINKS = 10;

/**
 * Les liens du profil, fondus, nettoyés, dédoublonnés et bornés.
 *
 * L'ordre suit l'intention : ce que le compte a rangé dans sa vitrine passe
 * avant les champs hérités, qui n'ont jamais eu d'ordre choisi.
 */
export function readUserLinks(user: UserLinksSource): UserLink[] {
  const candidates: { url: string; label?: string }[] = [
    ...(user.showcase?.links ?? []),
    ...(user.website ? [{ url: user.website }] : []),
    ...(user.socialLinks ?? []).map((url) => ({ url })),
  ];

  const seen = new Set<string>();
  const links: UserLink[] = [];

  for (const candidate of candidates) {
    const url = externalUrl(candidate.url);
    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    links.push({
      url,
      kind: readLinkKind(url),
      host: readLinkHost(url) ?? url,
      label: candidate.label,
    });

    if (links.length >= MAX_USER_LINKS) {
      break;
    }
  }

  return links;
}

/**
 * L'adresse telle qu'on la donne à saisir : sans son protocole.
 *
 * Personne ne tape `https://` dans un champ « votre chaîne », et l'y laisser
 * afficher fait paraître le champ plus technique qu'il n'est.
 */
export function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
