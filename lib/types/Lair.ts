import {Game} from "@/lib/types/Game";
import {User} from "@/lib/types/User";
import type {LairSectionKey} from "@/lib/lairs/sections";

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

// Type pour une source d'événements
export type EventSource = {
  url: string;
  type: 'IA' | 'MAPPING';
  instructions?: string;
  mappingConfig?: EventMappingConfig;
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

export type Lair = {
  id: string;
  name: string;
  banner?: string;

  games: Game['id'][];

  owners: User['id'][];
  
  eventsSourceUrls?: EventSource[];
  
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
  };
};
