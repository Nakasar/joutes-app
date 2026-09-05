import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";

import { auth } from "@/lib/auth.ts";
import { getUserById } from "@/lib/db/users.ts";
import { getFeaturedDecks, searchDecks } from "@/lib/db/decks.ts";
import { getPlayGroupsForUser } from "@/lib/db/play-groups.ts";
import { listPlayGroupSessions } from "@/lib/db/play-group-sessions.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import type { Event } from "@/lib/types/Event";
import type { Lair } from "@/lib/types/Lair";
import type { User } from "@/lib/types/User";
import type { PlayGroupSession } from "@/lib/types/PlayGroupSession";
import type { Deck } from "@/lib/types/Deck";
import type { SocialPlatform } from "@/lib/social/platforms.ts";
import type { Game } from "@/lib/types/Game";
import {
  JOURS_A_VENIR,
  MAX_DECKS,
  MAX_EVENEMENTS,
  MAX_FIL,
  MAX_LIEUX,
  PLAFONDS_FIL as PLAFONDS_FIL_API,
  RAYON_DEFAUT_KM,
} from "@/lib/home/constants.ts";
import type { FeedEntry } from "@/lib/home/entries.ts";
import {
  readGameScope,
  readHomeAgenda,
  readHomeFeed,
  readHomeLairs,
  readHomeLives,
  readPosition,
  type Position as HomePosition,
} from "@/lib/home/read.ts";

/**
 * Ce que l'accueil a besoin de savoir, lu une seule fois par rendu.
 *
 * Les lectures elles-mêmes vivent dans `lib/home/read.ts`, que `GET /feed`
 * appelle aussi pour l'application mobile : la règle de chaque tuile n'est
 * écrite qu'une fois. Ce module y ajoute ce qui n'appartient qu'à la page — la
 * session, la mémoïsation par rendu (`cache` de React, à la manière de
 * `lair-data.ts`), et les chemins du site sur chaque entrée.
 *
 * Chaque lecture reste cependant SÉPARÉE : c'est ce qui permet à chaque tuile
 * d'avoir sa propre frontière `<Suspense>` et de ne pas retenir les autres.
 */

export { JOURS_A_VENIR, MAX_DECKS, MAX_EVENEMENTS, MAX_FIL, MAX_LIEUX, RAYON_DEFAUT_KM };

export type TypeContenu = "actu" | "video" | "deck" | "social";

/** Un onglet du fil, et ce qu'il garde. */
export const TYPES_CONTENU: TypeContenu[] = ["actu", "video", "deck", "social"];

/**
 * Ce qu'une source au plus peut prendre dans l'onglet « Tout » — la même table
 * que l'API, sous les genres de la page. Voir `lib/content/feed-mix.ts`.
 */
export const PLAFONDS_FIL: Partial<Record<TypeContenu, number>> = { social: PLAFONDS_FIL_API.social };

/**
 * Une entrée du fil, quelle que soit son origine — celle de l'API, avec le
 * chemin du site en plus et les noms de la page.
 */
export type EntreeFil = {
  id: string;
  type: TypeContenu;
  titre: string;
  href: string;
  source: string;
  gameId?: string;
  /** ISO 8601 — le tri du fil, et l'ancienneté affichée. */
  publieLe: string;
  vignette?: string;
  /** Le cadrage de la vignette : seuls les decks ont un avis là-dessus. */
  cadrage?: "top" | "center";
  duree?: string;
  /** La plateforme d'origine, pour les seules entrées `social`. */
  plateforme?: SocialPlatform;
};

/**
 * Un direct en cours, quelle que soit son origine : celui d'un lieu
 * (`options.live`) ou celui d'un éditeur, détecté sur sa chaîne YouTube.
 */
export type Direct = {
  /** `lieu:<id>` ou `jeu:<id>` : deux sources, une seule clé de rendu. */
  cle: string;
  /** Où mène le clic : la vitrine du lieu, ou la fiche du jeu. */
  href: string;
  titre: string;
  /** Ce qui diffuse — le nom du lieu, ou celui du jeu. */
  source: string;
  /** La vignette servie par la plateforme, quand il y en a une. */
  vignette?: string;
  viewers?: number;
  /** Vrai pour un direct d'éditeur : le bandeau change alors de titre. */
  jeu?: boolean;
};

/** La position que la page regarde, et d'où elle la tient. */
export type Position = {
  latitude: number;
  longitude: number;
  rayonKm: number;
  /** Le nom de la localité, quand elle en a un. */
  nom?: string;
};

function versPosition(position: Position | null): HomePosition | null {
  return position
    ? { latitude: position.latitude, longitude: position.longitude, radiusKm: position.rayonKm, name: position.nom }
    : null;
}

/**
 * La session, lue une fois.
 *
 * `connection()` avant tout : la page d'accueil se prérend, mais tout ce qui
 * dépend de qui regarde doit attendre la requête. C'est la même précaution que
 * prend `EventsCalendarWrapper`.
 */
export const lireViewer = cache(async (): Promise<User | null> => {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return null;
  }

  return getUserById(session.user.id);
});

/**
 * La position retenue, par ordre de précision décroissante : celle que l'URL
 * demande, puis celle que le compte a enregistrée.
 */
export function lirePosition(
  params: { lat?: string; lon?: string; rayon?: string; lieu?: string },
  viewer: User | null,
): Position | null {
  const position = readPosition(
    { lat: params.lat, lon: params.lon, radius: params.rayon, name: params.lieu },
    viewer,
  );
  return position
    ? { latitude: position.latitude, longitude: position.longitude, rayonKm: position.radiusKm, nom: position.name }
    : null;
}

/** Le jeu demandé par l'URL, ramené à ceux que la plateforme connaît. */
export const lireJeuChoisi = cache(async (demande: string | undefined) => {
  if (!demande) {
    return null;
  }

  const jeux = await readAllGames();
  return jeux.find((jeu) => jeu.id === demande || jeu.slug === demande) ?? null;
});

/** Les lieux que la page a le droit de montrer — voir `readHomeLairs`. */
export const lireLieux = cache(async (position: Position | null): Promise<Lair[]> => {
  const viewer = await lireViewer();
  return (await readHomeLairs(viewer, versPosition(position))).lairs;
});

/** Les directs en cours : ceux des éditeurs, puis ceux des lieux — voir `readHomeLives`. */
export const lireDirects = cache(async (position: Position | null): Promise<Direct[]> => {
  const [lieux, viewer, jeux] = await Promise.all([lireLieux(position), lireViewer(), readAllGames()]);

  return (await readHomeLives(viewer, lieux, jeux)).map((direct) => ({
    cle: direct.kind === "game" ? `jeu:${direct.id}` : `lieu:${direct.id}`,
    href:
      direct.kind === "game"
        ? `/games/${jeux.find((jeu) => jeu.id === direct.id)?.slug ?? direct.id}`
        : `/lairs/${direct.id}`,
    titre: direct.title,
    source: direct.source,
    vignette: direct.thumbnail,
    viewers: direct.viewers,
    jeu: direct.kind === "game" ? true : undefined,
  }));
});

/** Ce qui vient dans les sept prochains jours — voir `readHomeAgenda`. */
export const lireAgenda = cache(
  async (position: Position | null, jeu: Game | null): Promise<Event[]> => {
    const viewer = await lireViewer();
    return readHomeAgenda(viewer, versPosition(position), jeu);
  },
);

/**
 * Le fil : actualités, vidéos de membres, listes et publications des réseaux,
 * quatre sources mêlées sur une seule file et triées par date — voir
 * `readHomeFeed` pour la règle des jeux. Ici, chaque entrée reçoit son chemin.
 */
export const lireFil = cache(
  async (gameId: string | null, locale: string): Promise<EntreeFil[]> => {
    const viewer = gameId ? null : await lireViewer();
    const jeux = readGameScope(viewer, gameId ? ({ id: gameId } as Game) : null);

    return (await readHomeFeed(jeux, locale, MAX_FIL)).map(versEntreeFil);
  },
);

function versEntreeFil(entree: FeedEntry): EntreeFil {
  const base = {
    id: entree.id,
    titre: entree.title,
    source: entree.source,
    gameId: entree.gameId,
    publieLe: entree.publishedAt,
    vignette: entree.thumbnail,
  };

  switch (entree.type) {
    case "news":
      return { ...base, type: "actu", href: `/news/${entree.id}` };
    case "content":
      return {
        ...base,
        type: entree.kind === "article" ? "actu" : "video",
        href: entree.url ?? `/users/${entree.authorId}`,
        duree: entree.duration,
      };
    case "deck":
      return { ...base, type: "deck", href: `/decks/${entree.id}`, cadrage: entree.framing };
    case "social":
      return {
        ...base,
        type: "social",
        href: entree.url,
        duree: entree.duration,
        plateforme: entree.platform,
      };
  }
}

/** Les decks de la personne, les plus récemment touchés d'abord. */
export const lireMesDecks = cache(async (): Promise<Deck[]> => {
  const viewer = await lireViewer();
  if (!viewer) {
    return [];
  }

  const resultat = await searchDecks({ playerId: viewer.id, page: 1, limit: MAX_DECKS });
  return resultat.decks;
});

/** Les listes mises en avant, pour qui n'a pas encore les siennes. */
export const lireDecksEnVedette = cache(async (gameId: string | null): Promise<Deck[]> =>
  getFeaturedDecks(gameId ?? undefined, MAX_DECKS),
);

/**
 * Le sondage de session en attente, s'il y en a un.
 *
 * La tuile ne s'affiche que dans ce cas : un groupe sans question ouverte n'a
 * rien à dire ici, et l'Établi du groupe montre déjà le reste.
 */
export const lireSondageEnAttente = cache(
  async (): Promise<{ session: PlayGroupSession; groupe: string } | null> => {
    const viewer = await lireViewer();
    if (!viewer) {
      return null;
    }

    const groupes = await getPlayGroupsForUser(viewer.id);
    if (groupes.length === 0) {
      return null;
    }

    /*
     * On s'arrête au premier groupe qui a une question ouverte : la tuile n'en
     * montre qu'une, et lire les sondages des autres groupes ne servirait à
     * rien. `listPlayGroupSessions` place déjà les sondages en tête.
     */
    for (const groupe of groupes) {
      const sessions = await listPlayGroupSessions(groupe.id, { statuses: ["poll"] });
      const sondage = sessions[0];
      if (sondage) {
        return { session: sondage, groupe: groupe.name };
      }
    }

    return null;
  },
);
