import { ObjectId } from "mongodb";

/**
 * Types de contenus pouvant être signalés par les utilisateurs. Chaque type
 * doit avoir une entrée correspondante dans le registre
 * `lib/db/reportable-content.ts` (aperçu pour l'admin + action de modération).
 */
export const REPORTABLE_CONTENT_TYPES = [
  "errata",
  "policy",
  "news",
  "quiz",
  "user",
  "tournament",
  "league",
  "event",
  "lair",
  "wishlist",
  "sell-list",
  "play-group",
  "deck",
  "user-content",
] as const;

export type ReportableContentType = (typeof REPORTABLE_CONTENT_TYPES)[number];

/** Libellés affichés dans l'espace d'administration (francophone). */
export const REPORTABLE_CONTENT_LABELS: Record<ReportableContentType, string> = {
  errata: "Errata",
  policy: "Politique de jeu",
  news: "Actualité",
  quiz: "Quizz",
  user: "Profil utilisateur",
  tournament: "Tournoi",
  league: "Ligue",
  event: "Évènement",
  lair: "Lieu",
  wishlist: "Liste de souhaits",
  "sell-list": "Liste de vente",
  "play-group": "Groupe de jeu",
  deck: "Deck",
  "user-content": "Publication d'un joueur",
};

/**
 * Un signalement est unique par (type, contenu, utilisateur). Une fois ignoré
 * par un administrateur, il reste stocké avec le statut `ignored` : le contenu
 * ne réapparaît dans la page d'administration que s'il est re-signalé (nouveau
 * signalement, ou re-signalement par le même utilisateur).
 */
export type ReportStatus = "pending" | "ignored";

export type Report = {
  id: string;
  contentType: ReportableContentType;
  contentId: string;
  reportedBy: string;
  reason?: string;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
  ignoredAt?: Date;
  ignoredBy?: string;
};

export type ReportDb = Omit<Report, "id" | "reportedBy" | "ignoredBy"> & {
  reportedBy: ObjectId;
  ignoredBy?: ObjectId;
};

/** Aperçu du contenu signalé, affiché dans la page d'administration. */
export type ReportedContentPreview = {
  /** `false` lorsque le contenu a déjà été supprimé par ailleurs. */
  exists: boolean;
  title: string;
  excerpt?: string;
  /** Lien public vers le contenu, lorsqu'il en existe un. */
  url?: string;
};

export type ReportReporter = {
  id: string;
  label: string;
};

/** Signalements agrégés par contenu, avec le nombre de fois signalé. */
export type ReportGroup = {
  contentType: ReportableContentType;
  contentId: string;
  count: number;
  firstReportedAt: Date;
  lastReportedAt: Date;
  reasons: {
    reason?: string;
    createdAt: Date;
    reporter?: ReportReporter;
  }[];
  content: ReportedContentPreview;
};
