import {Game} from "@/lib/types/Game";
import {User} from "@/lib/types/User";
import type {LairSectionKey} from "@/lib/lairs/sections";
import type {LairPosterSettings} from "@/lib/posters/styles";

// Type GeoJSON Point pour MongoDB
export type GeoJSONPoint = {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
};

// Type pour le mapping des champs depuis un JSON externe
export type EventFieldsMapping = {
  id?: string;
  name?: string;
  startDateTime?: string;
  endDateTime?: string;
  gameName?: string;
  price?: string;
  status?: string;
  url?: string;
};

// Type pour les valeurs par défaut des champs
export type EventFieldsValues = {
  name?: string;
  startDateTime?: string;
  endDateTime?: string;
  gameName?: string;
  price?: number;
  status?: 'available' | 'sold-out' | 'cancelled';
  url?: string;
};

// Type pour la configuration de mapping JSON
export type EventMappingConfig = {
  eventsPath: string;
  eventsBaseUrl?: string;
  eventsFieldsMapping: EventFieldsMapping;
  eventsFieldsValues?: EventFieldsValues;
};

/**
 * Où lire un champ dans l'élément d'un événement : un sélecteur CSS relatif à
 * cet élément (vide : l'élément lui-même), et le texte de la cible ou l'un
 * de ses attributs.
 */
export type HtmlFieldRule = {
  selector?: string;
  attribute?: string;
};

/**
 * Une page lue par sélecteurs, sans modèle.
 *
 * `title` est le titre composé de l'événement — « Jeu - Nom - JJ/MM/AAAA -
 * HHhMM » — d'où se lisent le jeu, le nom, la date et l'heure quand la page
 * ne les donne pas champ par champ. Un champ dédié, s'il est renseigné,
 * l'emporte sur ce que le titre en dit.
 */
export type EventHtmlConfig = {
  /** Le sélecteur de chaque événement de la page. */
  itemSelector: string;
  fields: {
    id?: HtmlFieldRule;
    title?: HtmlFieldRule;
    name?: HtmlFieldRule;
    gameName?: HtmlFieldRule;
    /** Une date seule — « mercredi 02 septembre », « 03/09/2026 » — quand la page la donne à part. */
    date?: HtmlFieldRule;
    /** Une heure, ou une plage — « 19h30 », « 13:30 - 18:30 » — quand la page la donne à part. */
    time?: HtmlFieldRule;
    startDateTime?: HtmlFieldRule;
    endDateTime?: HtmlFieldRule;
    price?: HtmlFieldRule;
    status?: HtmlFieldRule;
    url?: HtmlFieldRule;
    /** Le lieu ou la ville de l'événement, pour `venues`. */
    venue?: HtmlFieldRule;
  };
  /** Ce qui sépare les segments du titre composé. « - » par défaut. */
  titleSeparator?: string;
  /**
   * Les villes à inclure, à la casse et aux accents près : une page qui liste
   * plusieurs villes ne donne au lieu que les siennes. Vide : tout est gardé.
   *
   * Quand un champ de formulaire porte `{ville}`, la page est demandée une
   * fois **par ville** de cette liste, le mot remplacé — c'est ainsi qu'un
   * site qui ne rend qu'une ville à la fois rend toutes celles du lieu.
   */
  venues?: string[];
  /**
   * Où la page liste les villes qu'elle sait servir — les `<option>` de son
   * formulaire, en général. Ne sert qu'au test : proposer les villes à cocher.
   */
  venueOptionsSelector?: string;
};

// Type pour une source d'événements
export type EventSource = {
  url: string;
  type: 'IA' | 'MAPPING' | 'HTML';
  instructions?: string;
  mappingConfig?: EventMappingConfig;
  htmlConfig?: EventHtmlConfig;
  /**
   * Les champs d'un formulaire à envoyer pour obtenir la page — la ville à
   * afficher, un filtre. Quand ils sont là, la page est demandée en POST
   * (`application/x-www-form-urlencoded`) plutôt qu'en GET. Vaut pour tous
   * les types de source.
   */
  formFields?: Record<string, string>;
  /**
   * Les noms de jeu de la source qui ne sont pas ceux de la plateforme :
   * « MTG » → « Magic: The Gathering ». Les clés se comparent à la casse et
   * aux accents près. Vaut pour tous les types de source.
   */
  gameAliases?: Record<string, string>;
  /**
   * `"owner"` : la source que le gérant du lieu a connectée lui-même, depuis
   * son écran de gestion. Il ne voit et ne modifie que celle-là ; les autres
   * sont l'affaire de l'équipe.
   */
  managedBy?: "owner";
};

/** Le rythme auquel Joutes relit les sources d'un lieu. */
export type LairEventsRefreshFrequency = "weekly" | "daily";

/**
 * Une demande d'aide d'un gérant pour connecter son site : la page que Joutes
 * ne sait pas encore lire, et un mot pour aider. L'équipe la voit dans
 * l'administration du lieu et la clôt une fois la source configurée.
 */
export type LairEventsSourceRequest = {
  url?: string;
  note?: string;
  requestedBy: User['id'];
  /** ISO 8601. */
  requestedAt: string;
  status: "pending" | "done";
};

/** Ce qu'une source a rendu au dernier rafraîchissement. */
export type EventSourceRefreshResult = {
  url: string;
  ok: boolean;
  /** Pourquoi la lecture a échoué — « HTTP 503 », un JSON illisible… */
  error?: string;
  /** Ce qui a été lu mais mal compris : un statut inconnu, une date illisible. */
  warnings: string[];
  /** Le nombre d'événements que la source a rendus. */
  count: number;
};

/**
 * Le compte rendu du dernier rafraîchissement automatique d'un lieu.
 *
 * Écrit par `refreshEvents` à chaque tour, du cron comme du bouton de
 * l'administration, pour qu'une source en panne se voie sans aller lire les
 * journaux du serveur. Sort du lieu par `getLairEventsRefreshReport`, et
 * seulement là : ses messages d'erreur n'ont rien à faire sur l'API publique.
 */
export type LairEventsRefreshReport = {
  /** ISO 8601. */
  at: string;
  sources: EventSourceRefreshResult[];
  inserted: number;
  updated: number;
  unchanged: number;
  cancelled: number;
  removed: number;
};

/** Un réseau ou un site du lieu, affiché dans la colonne « Suivre le lieu ». */
export type LairLink = {
  type: 'website' | 'instagram' | 'facebook' | 'discord' | 'twitch' | 'youtube' | 'x' | 'other';
  url: string;
  /** Libellé affiché à la place de l'URL — « @antretemps », « Discord du lieu »… */
  label?: string;
};

/** Une annonce du lieu, publiée depuis l'écran de gestion. */
export type LairNewsItem = {
  id: string;
  title: string;
  /** Résumé affiché sur la carte ; le corps complet vit dans `content`. */
  summary?: string;
  /** Markdown, rendu par `AnnotatedMarkdown`. */
  content?: string;
  /** Catégorie libre du lieu — « Promotion », « Nouveauté »… */
  category?: string;
  banner?: string;
  /** ISO 8601. */
  publishedAt: string;
  /** Une seule annonce épinglée est mise en tête ; les autres suivent par date. */
  pinned?: boolean;
  /** Lien contextuel optionnel, affiché sous l'annonce épinglée. */
  link?: string;
  linkLabel?: string;
};

/**
 * Une plage d'ouverture, un jour de la semaine.
 *
 * `day` suit la numérotation ISO de luxon : 1 = lundi … 7 = dimanche. Un jour
 * absent de la liste — ou sans `open` — est fermé.
 *
 * Un même jour peut porter **plusieurs plages** : c'est ainsi que se décrivent
 * les horaires coupés, « mardi 10h — 12h puis 14h — 19h ». Deux entrées de même
 * `day` plutôt qu'une liste de créneaux imbriquée, parce que les horaires déjà
 * en base sont exactement ce format à une plage par jour, et qu'aucun n'a donc
 * à être réécrit.
 *
 * Les horaires les plus anciens portent `0` pour le dimanche ; `isoDay`, dans
 * `lib/lairs/opening-hours.ts`, les ramène sur `7` à la lecture.
 */
export type LairOpeningHours = {
  day: number;
  /** "10:00" */
  open?: string;
  /** "19:00" */
  close?: string;
};

/** Le direct en cours du lieu, affiché en tête de l'onglet « Actualités ». */
export type LairLiveStream = {
  /** URL Twitch ou YouTube. */
  url: string;
  title?: string;
  /** ISO 8601 — sert à afficher « depuis 42 min ». */
  startedAt?: string;
  viewers?: number;
};

/** Un membre de l'équipe du lieu, affiché dans l'onglet « À propos ». */
export type LairOrganizer = {
  name: string;
  role?: string;
  avatar?: string;
};

/**
 * La marque blanche du lieu.
 *
 * `accentColor` est une des cinq valeurs de la palette fermée proposée à la
 * configuration ; elle devient `--lair-accent` sur le conteneur de la page.
 */
export type LairTheme = {
  logo?: string;
  accentColor?: string;
  /** Teinte les cartes et les boutons au-delà des seuls titres. */
  tintSurfaces?: boolean;
};

export type LairAbout = {
  /** Markdown. */
  description?: string;
  /** Badge de type de lieu affiché sous le titre — « Boutique & salle de jeu ». */
  category?: string;
  /** Équipements, rendus en puces : « 8 tables », « Accès PMR »… */
  amenities?: string[];
  /** Galerie, quatre photos au maximum dans la maquette. */
  photos?: string[];
  /** Vidéo de présentation (YouTube / Twitch). */
  videoUrl?: string;
  /** Accès en transports en commun. */
  transit?: string;
  parking?: string;
  organizers?: LairOrganizer[];
  /** Le rythme habituel du lieu : « Vendredi soir » → « Riftbound ». */
  rhythm?: { label: string; value: string }[];
};

/**
 * Un accès Joutes Pro offert à un lieu par l'équipe.
 *
 * Vit sur le lieu et non dans un abonnement : il n'y a précisément **personne**
 * à qui le rattacher — c'est le lieu qu'on équipe, pas un compte. Forger un
 * siège sur l'abonnement de quelqu'un aurait menti sur ses sièges consommés, et
 * la projection Patreon, réécrite à chaque signal, l'aurait effacé.
 *
 * Hors de `options` à dessein : `options` est la surface que le gérant du lieu
 * écrit lui-même. Un droit ne doit jamais se trouver là où celui à qui il
 * profite peut écrire.
 *
 * **Absent du type `Lair`, et c'est voulu.** Le motif est du texte libre écrit
 * par l'équipe et `grantedBy` un identifiant interne : les rendre sur `Lair`
 * les faisait sortir par `GET /api/lairs`, qui n'exige aucune session, et par
 * la charge cliente de la page d'index. Ils se lisent par `getLairProGrant`, appelé
 * du seul écran d'administration ; partout ailleurs, `lairHasProGrant` ne rend
 * qu'un booléen.
 */
export type LairProGrant = {
  grantedAt: Date;
  /** Le compte administrateur qui a accordé l'accès. */
  grantedBy: User['id'];
  /** Motif libre : « boutique partenaire », « lieu pilote »… */
  reason: string;
};

export type Lair = {
  id: string;
  name: string;
  banner?: string;

  games: Game['id'][];

  owners: User['id'][];

  /**
   * Le compte qui a ouvert la fiche, quand elle vient de l'application.
   *
   * Distinct de `owners`, qui dit qui la gère **aujourd'hui** : c'est sur cette
   * trace que porte le plafond de lieux publics, de sorte que recevoir la
   * gestion d'un lieu existant n'entame pas le droit d'en ouvrir un. Absent des
   * lieux créés par l'administration, qui ne se comptent contre personne.
   *
   * Sort avec le lieu comme `owners`, dont le créateur fait partie : rien n'y
   * est divulgué que la liste des propriétaires ne dise déjà.
   */
  createdBy?: User['id'];

  
  eventsSourceUrls?: EventSource[];

  /**
   * Hebdomadaire par défaut. Le quotidien est réservé aux lieux Pro : un lieu
   * qui l'a choisi puis a perdu son Pro est relu le mercredi, sans rien à
   * réécrire (voir `isRefreshDue`).
   */
  eventsRefreshFrequency?: LairEventsRefreshFrequency;
  
  /** @deprecated Utilisez les instructions dans chaque EventSource */
  eventsSourceInstructions?: string;
  
  location?: GeoJSONPoint;
  
  address?: string;
  
  website?: string;
  
  isPrivate?: boolean;
  
  invitationCode?: string;

  
  options?: {
    calendar?: {
      mode?: 'CALENDAR' | 'AGENDA' | 'CONFERENCE';
    };

    /**
     * La personnalisation de la page publique.
     *
     * Tout y est facultatif : un lieu qui n'a rien configuré retombe sur la
     * page nue — bannière, informations pratiques, jeux et agenda —, sans
     * onglet vide ni carte à moitié remplie.
     */
    theme?: LairTheme;

    /**
     * L'ordre et l'activation des sections de la vitrine.
     *
     * Une liste partielle est admise : `readLairSections` complète avec les
     * clés manquantes, à leur place par défaut.
     */
    sections?: { key: LairSectionKey; enabled: boolean }[];

    live?: LairLiveStream | null;

    news?: LairNewsItem[];

    /** L'événement mis en avant dans le bloc « À la une ». */
    featuredEventId?: string;

    links?: LairLink[];

    contact?: {
      phone?: string;
      email?: string;
    };

    openingHours?: LairOpeningHours[];

    about?: LairAbout;

    /**
     * Les réglages de l'affiche des événements : style, fréquentation, logos.
     * Voir `lib/posters/styles.ts` et `docs/EVENT_POSTER.md`.
     */
    poster?: LairPosterSettings;
  };
};
