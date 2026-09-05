/**
 * Les liens d'un jeu : le site de l'éditeur et ses réseaux.
 *
 * `Game.links` existait déjà — un objet aux clés nommées, rempli à la main en
 * base et affiché nulle part. Cette table lui donne ce qui lui manquait : une
 * liste de clés connues, saisissables depuis l'administration et rendues sur la
 * fiche du jeu, écrite **une seule fois** plutôt que trois (le type, le schéma,
 * le formulaire).
 *
 * L'objet garde sa signature d'index : une clé posée à la main en base n'est
 * pas effacée par un enregistrement, elle est seulement laissée hors du
 * formulaire. C'est ce qui permet d'ajouter un réseau ici sans migration.
 *
 * L'ordre de déclaration est celui du formulaire, et celui de la fiche.
 */

import { externalUrl } from "@/lib/lairs/urls";

export type GameLinkDefinition = {
  label: string;
  /** Un exemple réel, plus parlant qu'une consigne : « https://x.com/… ». */
  placeholder: string;
  /** Ce que le champ fait en plus d'être un lien. Un seul en porte une. */
  note?: string;
};

export const GAME_LINKS = {
  website: {
    label: "Site officiel",
    placeholder: "https://riftbound.leagueoflegends.com",
  },
  youtube: {
    label: "YouTube",
    placeholder: "https://www.youtube.com/@riftbound",
    /**
     * Seule adresse de la table à faire autre chose qu'un lien : c'est la
     * chaîne que le cron horaire interroge pour savoir si l'éditeur diffuse.
     * Voir `docs/GAME_LIVES.md`.
     */
    note: "La chaîne surveillée pour les directs de l'éditeur. Une adresse de chaîne (@handle, /channel/UC…), pas une vidéo.",
  },
  twitch: {
    label: "Twitch",
    placeholder: "https://www.twitch.tv/riftbound",
  },
  x: {
    label: "X",
    placeholder: "https://x.com/playriftbound",
  },
  instagram: {
    label: "Instagram",
    placeholder: "https://www.instagram.com/playriftbound/",
  },
  tiktok: {
    label: "TikTok",
    placeholder: "https://www.tiktok.com/@riftbound",
  },
  bluesky: {
    label: "Bluesky",
    placeholder: "https://bsky.app/profile/riftbound.bsky.social",
  },
  facebook: {
    label: "Facebook",
    placeholder: "https://www.facebook.com/riftbound",
  },
  discord: {
    label: "Discord",
    placeholder: "https://discord.gg/riftbound",
  },
  reddit: {
    label: "Reddit",
    placeholder: "https://www.reddit.com/r/Riftbound/",
  },
} as const satisfies Record<string, GameLinkDefinition>;

export type GameLinkKey = keyof typeof GAME_LINKS;

export const GAME_LINK_KEYS = Object.keys(GAME_LINKS) as GameLinkKey[];

/**
 * La définition d'une clé, sous son type déclaré.
 *
 * `as const` donne à chaque entrée son type littéral, et `GAME_LINKS[key]` sur
 * une clé variable devient donc une union dont une seule branche porte `note`.
 * Ce détour élargit la lecture au contrat commun, plutôt que de forcer la main
 * à l'appelant sur chaque accès.
 */
export function gameLink(key: GameLinkKey): GameLinkDefinition {
  return GAME_LINKS[key];
}

/**
 * Les liens connus d'un jeu, dans l'ordre de la table et sans les vides.
 *
 * Deux tris, pour deux raisons différentes :
 *
 * - **les clés inconnues** sont écartées : elles n'ont ni libellé ni place
 *   définie, et une ligne « ancien_champ » sur la fiche publique vaudrait moins
 *   que pas de ligne du tout. Elles restent en base ;
 * - **les adresses qui ne sont pas en http(s)** le sont aussi, par
 *   `externalUrl` : ces valeurs finissent dans un `href`, et un `javascript:`
 *   posé en base y trouverait une exécution au clic. Même règle que les liens
 *   d'un lieu, et pour la même raison.
 */
export function readGameLinks(
  links: Record<string, string | undefined> | undefined,
): { key: GameLinkKey; label: string; url: string }[] {
  if (!links) {
    return [];
  }

  return GAME_LINK_KEYS.flatMap((key) => {
    const url = externalUrl(links[key]);
    return url ? [{ key, label: GAME_LINKS[key].label, url }] : [];
  });
}
