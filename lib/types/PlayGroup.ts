import type { ObjectId } from "mongodb";

export type PlayGroupMemberRole = "owner" | "admin" | "member";

/**
 * Qui peut trouver le groupe.
 *
 * `public` — le groupe paraît au rôle d'armes, où n'importe qui peut le
 * découvrir. C'est la valeur par défaut, et l'absence du champ la vaut : les
 * groupes créés avant ce réglage restent visibles, comme ils l'ont toujours été.
 *
 * `private` — le groupe disparaît du rôle pour tout le monde sauf ses membres.
 * Sa vitrine reste ouverte à qui en a l'adresse — c'est ce qui permet d'inviter
 * quelqu'un à la regarder — mais elle demande aux moteurs de ne pas l'indexer :
 * un groupe privé qui ressort d'une recherche ne serait pas privé.
 *
 * Ce n'est pas un réglage de personnalisation : il ne vit pas dans `options`,
 * qui ne porte que de l'apparence, mais sur le groupe lui-même, où une requête
 * peut le filtrer avec un index.
 */
export type PlayGroupVisibility = "public" | "private";

export type PlayGroupMember = {
  userId: string;
  role: PlayGroupMemberRole;
  joinedAt: string;
};

/** Un réseau ou un site du groupe, affiché sur la vitrine sous « Nous suivre ». */
export type PlayGroupLinkType =
  | "website"
  | "twitch"
  | "youtube"
  | "discord"
  | "instagram"
  | "facebook"
  | "x"
  | "other";

export type PlayGroupLink = {
  type: PlayGroupLinkType;
  url: string;
  /** Libellé affiché à la place de l'URL — « @lescorbeaux », « Notre Discord »… */
  label?: string;
};

/**
 * La marque blanche du groupe, sur le modèle de celle des lieux.
 *
 * `accentColor` est une des cinq valeurs de la palette fermée ; elle devient
 * `--group-accent` sur le conteneur des pages du groupe.
 */
export type PlayGroupTheme = {
  logo?: string;
  banner?: string;
  accentColor?: string;
  /** La phrase sous le nom, sur la vitrine — « Groupe de jeu · Thionville ». */
  tagline?: string;
};

export type PlayGroupAnnouncementScope = "group" | "public";

/**
 * Une annonce du groupe.
 *
 * La portée décide de tout : `group` ne sort jamais de l'Établi, `public` est
 * reprise dans les actualités de la vitrine. Il n'y a pas de troisième état —
 * une annonce mal cadrée se corrige en changeant sa portée.
 */
export type PlayGroupAnnouncement = {
  id: string;
  title: string;
  /** Corps libre, une poignée de lignes ; les articles vivent dans `contents`. */
  body?: string;
  scope: PlayGroupAnnouncementScope;
  authorId: string;
  /** ISO 8601. */
  publishedAt: string;
  updatedAt?: string;
};

export type PlayGroupContentKind = "video" | "article" | "replay";

/**
 * Un contenu publié par le groupe, montré sur la vitrine.
 *
 * Un article porte son corps en markdown ; une vidéo et un replay portent une
 * URL Twitch ou YouTube. Les trois partagent la même carte, d'où le type unique.
 */
export type PlayGroupContentItem = {
  id: string;
  kind: PlayGroupContentKind;
  title: string;
  summary?: string;
  /** Markdown — les articles seulement. */
  body?: string;
  /** URL de la vidéo ou du replay. */
  url?: string;
  thumbnail?: string;
  /** Durée affichée telle quelle — « 12 min », « 1 h 04 ». */
  duration?: string;
  gameId?: string;
  authorId: string;
  /** ISO 8601. */
  publishedAt: string;
  updatedAt?: string;
};

/**
 * Le direct d'un membre.
 *
 * Jusqu'à trois simultanés sur la vitrine : au-delà, la grille de vignettes
 * devient une liste, et plus personne ne sait lequel regarder.
 */
export type PlayGroupLiveStream = {
  id: string;
  /** URL Twitch ou YouTube. */
  url: string;
  title?: string;
  gameId?: string;
  /** Le membre qui diffuse. */
  memberId: string;
  /** ISO 8601 — sert à afficher « depuis 42 min ». */
  startedAt: string;
  viewers?: number;
};

export const PLAY_GROUP_MAX_LIVES = 3;

export type PlayGroupPlaceKind = "joutes" | "free" | "member";

/**
 * Le lieu d'une session.
 *
 * Un lieu Joutes hérite de sa fiche — adresse, horaires, itinéraire — et n'a
 * donc besoin que de son identifiant. Un lieu libre (« Chez Yann », « MJC de
 * Yutz ») n'est qu'un nom et, au mieux, une précision saisie par le groupe.
 */
export type PlayGroupPlace = {
  kind: PlayGroupPlaceKind;
  /** Renseigné pour `kind: "joutes"` seulement. */
  lairId?: string;
  /** Le nom affiché — hérité de la fiche pour un lieu Joutes, saisi sinon. */
  label?: string;
  /** Adresse, étage, code d'entrée… ce que le groupe veut préciser. */
  detail?: string;
};

/** Le rythme habituel du groupe : ce que la vitrine annonce, et ce que les nouvelles sessions préremplissent. */
export type PlayGroupRhythm = {
  /** Libellé libre — « Tous les jeudis à 19h30 ». */
  label?: string;
  defaultPlace?: PlayGroupPlace;
};

/**
 * La personnalisation du groupe.
 *
 * Tout y est facultatif : un groupe qui n'a rien configuré garde l'accent de
 * Joutes, une vitrine sans bloc vide, et un Établi qui n'affiche que ce qui
 * existe vraiment.
 */
export type PlayGroupOptions = {
  theme?: PlayGroupTheme;
  links?: PlayGroupLink[];
  rhythm?: PlayGroupRhythm;
  announcements?: PlayGroupAnnouncement[];
  contents?: PlayGroupContentItem[];
  lives?: PlayGroupLiveStream[];
};

export type PlayGroup = {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  /** Absent vaut `public` — voir `readPlayGroupVisibility`. */
  visibility?: PlayGroupVisibility;
  members: PlayGroupMember[];
  /** Game ids enabled for this group's collection/wishlists. `null`/`undefined` means every game is allowed. */
  enabledGameIds?: string[] | null;
  options?: PlayGroupOptions;
  createdAt: string;
  updatedAt: string;
};

export type PlayGroupInvitation = {
  id: string;
  playGroupId: string;
  playGroupName: string;
  invitedUserId: string;
  invitedById: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  updatedAt: string;
};

export type PlayGroupMemberDocument = PlayGroupMember;

export type PlayGroupDocument = {
  _id: ObjectId;
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  visibility?: PlayGroupVisibility;
  members: PlayGroupMemberDocument[];
  enabledGameIds?: string[] | null;
  options?: PlayGroupOptions;
  createdAt: string;
  updatedAt: string;
};

export type PlayGroupInvitationDocument = {
  _id: ObjectId;
  id: string;
  playGroupId: string;
  playGroupName: string;
  invitedUserId: string;
  invitedById: string;
  status: PlayGroupInvitation["status"];
  createdAt: string;
  updatedAt: string;
};

/** Un abonné de la vitrine : il suit le groupe sans en être membre. */
export type PlayGroupFollowerDocument = {
  _id: ObjectId;
  playGroupId: string;
  userId: string;
  createdAt: string;
};
