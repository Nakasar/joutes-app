import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";
import { DateTime } from "luxon";

import { auth } from "@/lib/auth.ts";
import { getUserById } from "@/lib/db/users.ts";
import { getLairIdsNearLocation, getLairsByIds } from "@/lib/db/lairs.ts";
import { getAllEvents, getEventsByLairIds, getEventsForUser } from "@/lib/db/events.ts";
import { getNews } from "@/lib/db/news.ts";
import { listRecentPublicContents } from "@/lib/db/user-contents.ts";
import { listRecentSocialPosts } from "@/lib/db/game-social-posts.ts";
import { getFeaturedDecks, searchDecks } from "@/lib/db/decks.ts";
import { deckCoverPosition, resolveDeckCover } from "@/lib/decks/cover.ts";
import { getPlayGroupsForUser } from "@/lib/db/play-groups.ts";
import { listLiveGameStreams } from "@/lib/db/game-streams.ts";
import { listPlayGroupSessions } from "@/lib/db/play-group-sessions.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { readLiveEmbed } from "@/lib/media/live-embed.ts";
import type { Event } from "@/lib/types/Event";
import type { Lair } from "@/lib/types/Lair";
import type { User } from "@/lib/types/User";
import type { PlayGroupSession } from "@/lib/types/PlayGroupSession";
import type { Deck } from "@/lib/types/Deck";
import type { News } from "@/lib/types/News";
import type { UserContent } from "@/lib/types/UserContent";
import type { GameSocialPost } from "@/lib/types/GameSocialPost";
import type { SocialPlatform } from "@/lib/social/platforms.ts";
import { formatSocialDuration } from "@/lib/social/youtube-posts.ts";
import type { Game } from "@/lib/types/Game";

/**
 * Ce que l'accueil a besoin de savoir, lu une seule fois par rendu.
 *
 * Six sources alimentent la page, et plusieurs tuiles posent la même question.
 * Le bandeau des directs et la colonne « mes lieux » veulent les mêmes lieux ;
 * l'agenda et le fil veulent le même jeu choisi. Sans mémoïsation, la page
 * interrogerait la base deux à trois fois pour rien — `cache` de React s'en
 * charge, à la manière de `lair-data.ts`.
 *
 * Chaque lecture reste cependant SÉPARÉE : c'est ce qui permet à chaque tuile
 * d'avoir sa propre frontière `<Suspense>` et de ne pas retenir les autres.
 */

/** La fenêtre que l'accueil regarde : d'aujourd'hui à sept jours. */
export const JOURS_A_VENIR = 7;

/** Ce qu'une tuile montre au plus, avant de renvoyer vers sa page. */
export const MAX_EVENEMENTS = 3;
export const MAX_LIEUX = 3;
export const MAX_DECKS = 3;
export const MAX_FIL = 6;

/** Rayon par défaut d'une recherche « autour de moi », comme au calendrier. */
export const RAYON_DEFAUT_KM = 15;

export type TypeContenu = "actu" | "video" | "deck" | "social";

/** Un onglet du fil, et ce qu'il garde. */
export const TYPES_CONTENU: TypeContenu[] = ["actu", "video", "deck", "social"];

/**
 * Ce qu'une source au plus peut prendre dans l'onglet « Tout ».
 *
 * Les trois premières sources publient au rythme d'une rédaction : une
 * actualité par semaine, un deck de temps en temps. Les publications
 * rapatriées des réseaux d'un éditeur, non — un compte actif poste plusieurs
 * fois par jour, et un tri par date seul lui donnerait les six places.
 *
 * Le plafond garantit qu'**aucune autre source n'est évincée** ; il ne laisse
 * pas le fil à moitié vide pour autant, les places qu'aucune autre ne prend
 * revenant aux publications. Voir `lib/content/feed-mix.ts`.
 */
export const PLAFONDS_FIL: Partial<Record<TypeContenu, number>> = { social: 2 };

/**
 * Une entrée du fil, quelle que soit son origine.
 *
 * Actualités, vidéos et decks n'ont ni la même forme ni la même collection ;
 * la page, elle, les met sur la même carte. La conversion se fait ici, une
 * fois, plutôt que dans le gabarit.
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
  /*
   * Le cadrage de la vignette. Une illustration de carte porte son sujet en
   * haut ; la centrer dans une vignette panoramique la décapite. Seuls les
   * decks ont un avis là-dessus, et c'est `deckCoverPosition` qui le donne.
   */
  cadrage?: "top" | "center";
  duree?: string;
  /**
   * La plateforme d'origine, pour les seules entrées `social`.
   *
   * Elle porte le logo affiché à côté du compte — la même exigence que sur la
   * fiche du jeu : on doit voir d'où vient une publication sans la lire.
   */
  plateforme?: SocialPlatform;
};

/**
 * Un direct en cours, quelle que soit son origine.
 *
 * Deux sources n'ayant rien en commun se rejoignent sur cette carte : le direct
 * posé sur un **lieu** (`options.live`, voir `docs/STREAM_LINKING.md`) et celui
 * d'un **éditeur**, détecté sur sa chaîne YouTube (`docs/GAME_LIVES.md`). La
 * conversion se fait ici, une fois, plutôt que dans le gabarit — comme pour les
 * trois collections du fil.
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
 *
 * Un visiteur sans compte et sans paramètre n'a pas de position, et la page ne
 * lui en invente pas : elle lui montre ce qui se passe partout, et lui propose
 * de dire où il est.
 */
export function lirePosition(
  params: { lat?: string; lon?: string; rayon?: string; lieu?: string },
  viewer: User | null,
): Position | null {
  const latitude = Number.parseFloat(params.lat ?? "");
  const longitude = Number.parseFloat(params.lon ?? "");

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const rayon = Number.parseInt(params.rayon ?? "", 10);
    return {
      latitude,
      longitude,
      rayonKm: Number.isFinite(rayon) && rayon > 0 ? rayon : RAYON_DEFAUT_KM,
      nom: params.lieu,
    };
  }

  const enregistree = viewer?.location;
  if (enregistree?.latitude != null && enregistree?.longitude != null) {
    /*
     * Le compte garde le point et son étiquette, jamais le rayon : celui-ci
     * appartient à la recherche, pas au lieu de vie. Il retombe donc sur celui
     * du calendrier, que l'URL peut toujours élargir.
     */
    return {
      latitude: enregistree.latitude,
      longitude: enregistree.longitude,
      rayonKm: RAYON_DEFAUT_KM,
      nom: enregistree.label ?? enregistree.city,
    };
  }

  return null;
}

/** Le jeu demandé par l'URL, ramené à ceux que la plateforme connaît. */
export const lireJeuChoisi = cache(async (demande: string | undefined) => {
  if (!demande) {
    return null;
  }

  const jeux = await readAllGames();
  return jeux.find((jeu) => jeu.id === demande || jeu.slug === demande) ?? null;
});

/**
 * Les lieux que la page a le droit de montrer.
 *
 * Connecté, ce sont les lieux suivis : un choix explicite vaut mieux qu'une
 * proximité devinée. Sinon, les lieux autour de la position — et rien du tout
 * si l'on ne sait pas où l'on est.
 */
export const lireLieux = cache(async (position: Position | null): Promise<Lair[]> => {
  const viewer = await lireViewer();

  const suivis = viewer?.lairs ?? [];
  if (suivis.length > 0) {
    return getLairsByIds(suivis);
  }

  if (!position) {
    return [];
  }

  const proches = await getLairIdsNearLocation(
    position.longitude,
    position.latitude,
    position.rayonKm * 1000,
  );

  // `getLairIdsNearLocation` rend déjà les lieux du plus proche au plus
  // lointain : on garde cet ordre, que `getLairsByIds` ne promet pas.
  const lieux = await getLairsByIds(proches);
  const rang = new Map(proches.map((id, index) => [id, index]));
  return lieux.sort((a, b) => (rang.get(a.id) ?? 0) - (rang.get(b.id) ?? 0));
});

/**
 * Les directs en cours : ceux des lieux, puis ceux des éditeurs.
 *
 * Les premiers ne coûtent aucune requête — un direct est posé sur le lieu
 * (`options.live`), et la page vient de lire les lieux pour sa colonne de
 * droite. Les seconds en coûtent une, sur une collection où le cas courant est
 * qu'il n'y ait aucune ligne.
 *
 * **Qui voit quoi.** Connecté, les jeux suivis : c'est le même principe que les
 * lieux juste au-dessus — un choix explicite vaut mieux qu'une devinette. Un
 * visiteur, lui, n'a rien à personnaliser, et les directs d'éditeurs sont
 * publics et peu nombreux : il les voit tous, comme il voit les lieux autour de
 * lui faute de lieux suivis.
 *
 * Les directs de jeux passent **en tête** : ils sont rares, et un direct
 * d'éditeur relégué sous trois boutiques ne serait jamais vu.
 */
export const lireDirects = cache(async (position: Position | null): Promise<Direct[]> => {
  const [lieux, viewer] = await Promise.all([lireLieux(position), lireViewer()]);

  const directs: Direct[] = [];

  for (const stream of await listLiveGameStreams(viewer ? (viewer.games ?? []) : undefined)) {
    const live = stream.live;
    if (!live?.url) continue;

    const jeu = await lireJeu(stream.gameId);
    if (!jeu) continue;

    directs.push({
      cle: `jeu:${stream.gameId}`,
      href: `/games/${jeu.slug ?? jeu.id}`,
      titre: live.title ?? jeu.name,
      source: stream.channelTitle ?? jeu.name,
      // L'hôte ne sert qu'au `parent` du lecteur Twitch ; la vignette, elle, ne
      // dépend de rien. La reconnaissance d'URL reste commune aux deux.
      vignette: readLiveEmbed(live.url, "localhost")?.thumbnailUrl,
      jeu: true,
    });
  }

  for (const lieu of lieux) {
    const live = lieu.options?.live;
    if (!live?.url) continue;

    directs.push({
      cle: `lieu:${lieu.id}`,
      href: `/lairs/${lieu.id}`,
      titre: live.title ?? lieu.name,
      source: lieu.name,
      viewers: live.viewers ?? undefined,
    });
  }

  return directs;
});

/** Un jeu du catalogue par son identifiant, sans requête de plus. */
const lireJeu = cache(async (gameId: string): Promise<Game | null> => {
  const jeux = await readAllGames();
  return jeux.find((jeu) => jeu.id === gameId) ?? null;
});

/**
 * Ce qui vient dans les sept prochains jours.
 *
 * Trois chemins, du plus personnel au plus général :
 *
 *  1. connecté — `getEventsForUser` sait déjà croiser les lieux suivis, les
 *     événements privés où l'on est inscrit et ceux mis en favori ;
 *  2. visiteur situé — les lieux dans le rayon ;
 *  3. visiteur sans position — tout ce qui se passe, faute de mieux. La
 *     fenêtre pouvant chevaucher deux mois, on lit les deux et on recolle.
 */
export const lireAgenda = cache(
  async (position: Position | null, jeu: Game | null): Promise<Event[]> => {
    const viewer = await lireViewer();

    const debut = DateTime.now();
    const fin = debut.plus({ days: JOURS_A_VENIR });
    const bornes = { afterDate: debut.toISO() ?? undefined, beforeDate: fin.toISO() ?? undefined };

    let evenements: Event[];

    if (viewer) {
      evenements = await getEventsForUser(
        viewer.id,
        /*
         * `"followed"` et non `"all"` : sans jeu choisi, l'agenda montre les
         * jeux qu'on suit, pas tout ce qui se passe. `getEventsForUser` porte
         * ce mode depuis toujours — c'est même sa valeur par défaut, et ce que
         * passent déjà le push et l'e-mail hebdomadaires. Seul l'accueil
         * demandait `"all"`, ce qui désactivait le filtre et proposait des
         * événements de jeux qu'on ne suit pas.
         *
         * Le mode garde les événements privés dont on est l'auteur ou un
         * participant, et ceux mis en favori, quel que soit leur jeu : ce sont
         * des choix explicites, ils passent avant le filtre.
         */
        jeu?.id ?? "followed",
        undefined,
        undefined,
        position ? { latitude: position.latitude, longitude: position.longitude } : undefined,
        position?.rayonKm,
        bornes,
      );
    } else if (position) {
      const proches = await getLairIdsNearLocation(
        position.longitude,
        position.latitude,
        position.rayonKm * 1000,
      );
      evenements = await getEventsByLairIds(proches, {
        ...bornes,
        gameIds: jeu ? [jeu.id] : undefined,
      });
    } else {
      const mois = await getAllEvents({ year: debut.year, month: debut.month });
      const suivant =
        fin.month === debut.month && fin.year === debut.year
          ? []
          : await getAllEvents({ year: fin.year, month: fin.month });
      evenements = [...mois, ...suivant];
    }

    const debutMs = debut.toMillis();
    const finMs = fin.toMillis();

    return evenements
      .filter((evenement) => {
        if (evenement.status === "cancelled") return false;
        /*
         * Les deux premiers chemins filtrent déjà en base. Ce garde-fou ne
         * sert qu'au troisième — le visiteur sans position, qui lit tout le
         * mois. Un événement moissonné n'a souvent qu'un `gameName` : on
         * accepte donc l'identifiant joint OU le nom.
         */
        if (jeu) {
          // Le sous-document `game` d'un événement ne porte pas d'identifiant :
          // on rapproche par le slug quand il est joint, par le nom sinon.
          const correspond =
            (jeu.slug != null && evenement.game?.slug === jeu.slug) ||
            evenement.gameName === jeu.name;
          if (!correspond) return false;
        }
        const debutEvenement = DateTime.fromISO(evenement.startDateTime).toMillis();
        return debutEvenement >= debutMs && debutEvenement <= finMs;
      })
      .sort(
        (a, b) =>
          DateTime.fromISO(a.startDateTime).toMillis() -
          DateTime.fromISO(b.startDateTime).toMillis(),
      )
      .slice(0, MAX_EVENEMENTS);
  },
);

/**
 * Le fil : actualités, vidéos de membres, listes et publications des réseaux,
 * quatre sources mêlées sur une seule file et triées par date.
 *
 * Les directs n'y sont pas. Ils ont leur bandeau en haut de page, et les
 * répéter ici montrerait deux fois la même chose à trois cents pixels d'écart.
 * Le fil garde ce qui se lit après coup.
 *
 * ## Sur quels jeux
 *
 * Un jeu choisi dans les onglets l'emporte sur tout. Sinon, **les jeux qu'on
 * suit** — ce que l'onglet promet déjà en s'appelant « Tous les miens ». Il ne
 * le tenait pas : le fil lisait tous les jeux, et proposait donc des decks et
 * des actualités de jeux auxquels on ne joue pas.
 *
 * Le repli reste « tout » pour un visiteur, et pour qui ne suit encore aucun
 * jeu : à ceux-là, un fil vide n'apprendrait rien, alors que le fil est
 * justement ce par quoi on découvre.
 *
 * Le filtrage est fait **en base**, chaque source acceptant une liste de jeux.
 * Lire une fenêtre large puis filtrer en mémoire aurait vidé le fil de qui suit
 * un jeu discret parmi des jeux bavards.
 */
export const lireFil = cache(
  async (gameId: string | null, locale: string): Promise<EntreeFil[]> => {
    const viewer = gameId ? null : await lireViewer();
    const suivis = viewer?.games ?? [];

    // Un jeu choisi ; sinon les jeux suivis ; sinon rien, ce qui ne filtre pas.
    const jeux = gameId ? [gameId] : suivis.length > 0 ? suivis : undefined;

    const [actus, contenus, decks, publications] = await Promise.all([
      getNews({ gameId: jeux, limit: MAX_FIL }),
      listRecentPublicContents({ gameId: jeux, limit: MAX_FIL }),
      getFeaturedDecks(jeux, MAX_FIL),
      // La même fenêtre que les trois autres : le fil n'en montre que six, et
      // le compteur de chaque onglet doit dire ce que l'onglet montrera.
      listRecentSocialPosts({ gameIds: jeux, limit: MAX_FIL }),
    ]);

    const entrees: EntreeFil[] = [
      ...actus.news.map(versEntreeActu(locale)),
      ...contenus.map(versEntreeContenu),
      ...decks.map(versEntreeDeck),
      ...publications.map(versEntreeSocial),
    ];

    return entrees.sort(
      (a, b) => DateTime.fromISO(b.publieLe).toMillis() - DateTime.fromISO(a.publieLe).toMillis(),
    );
  },
);

function versEntreeActu(locale: string) {
  return (actu: News): EntreeFil => ({
    id: actu.id,
    type: "actu",
    titre: lireTitreActu(actu, locale),
    href: `/news/${actu.id}`,
    source: actu.author?.displayName ?? "",
    gameId: actu.gameIds?.[0],
    publieLe: (actu.createdAt instanceof Date ? actu.createdAt : new Date(actu.createdAt)).toISOString(),
    vignette: actu.banner,
  });
}

/**
 * Le titre dans la langue de la page, sans dépendre de `localizeNews` : le fil
 * n'a besoin que du titre, là où la page d'une actualité lit tout le document.
 */
function lireTitreActu(actu: News, locale: string): string {
  const traduction = actu.translations?.find((entree) => entree.lang === locale);
  return traduction?.title ?? actu.title;
}

function versEntreeContenu(contenu: UserContent): EntreeFil {
  return {
    id: contenu.id,
    type: contenu.kind === "article" ? "actu" : "video",
    titre: contenu.title,
    href: contenu.url ?? `/users/${contenu.authorId}`,
    source: contenu.summary ?? "",
    gameId: contenu.gameId,
    publieLe: contenu.publishedAt,
    vignette: contenu.thumbnail,
    duree: contenu.duration,
  };
}

/**
 * Une publication d'un réseau, ramenée à une entrée du fil.
 *
 * Le **texte est le titre** : une publication n'en a pas d'autre, et celui
 * d'une vidéo YouTube est déjà son propos. Sans texte — une publication qui
 * n'est qu'une image — on écrit le compte, que la vignette accompagne ; un
 * titre vide laisserait une carte muette.
 *
 * `source` porte le compte et non la plateforme : celle-ci est dite par le
 * logo, et la répéter en toutes lettres à côté volerait la place du handle,
 * qui est l'information.
 */
function versEntreeSocial(post: GameSocialPost): EntreeFil {
  return {
    id: post.id,
    type: "social",
    titre: post.text ?? post.account.displayName ?? post.account.handle,
    href: post.url,
    source: post.account.handle,
    gameId: post.gameId,
    publieLe: post.publishedAt,
    vignette: post.thumbnail,
    duree: formatSocialDuration(post.durationSeconds),
    plateforme: post.platform,
  };
}

function versEntreeDeck(deck: Deck): EntreeFil {
  const couverture = resolveDeckCover(deck);

  return {
    id: deck.id,
    type: "deck",
    titre: deck.name,
    href: `/decks/${deck.id}`,
    source: deck.creatorName ?? "",
    gameId: deck.gameId,
    publieLe: (deck.updatedAt instanceof Date ? deck.updatedAt : new Date(deck.updatedAt)).toISOString(),
    /*
     * La couverture du deck, résolue comme partout ailleurs : l'image que
     * l'auteur a déposée, la carte qu'il a désignée, ou la légende qui donne
     * déjà son identité au deck. Sans catalogue — le fil est une liste, et
     * `coverImage` est justement la valeur dénormalisée que les listes lisent,
     * écrite à l'enregistrement du deck.
     *
     * La provenance voyage avec l'adresse, parce qu'elle décide du cadrage :
     * sans elle, le même deck serait cadré ici autrement que dans la
     * librairie, ce que `resolveDeckCover` existe précisément pour empêcher.
     */
    vignette: couverture.image,
    cadrage: deckCoverPosition(couverture.source),
  };
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
