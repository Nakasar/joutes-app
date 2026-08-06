import { ObjectId } from "bson";
import {BoosterCard} from "@/lib/types/booster";
import {Locale} from "@/i18n/config";

export type ErrataType = "errata" | "clarification" | "ruling";

// La création étant ouverte à tous, un errata ne peut pas viser une liste de
// cartes arbitrairement longue (chaque carte entraîne une revalidation de page).
export const MAX_ERRATA_CARDS = 20;

export type ErrataVoteType = "positive" | "negative";

export type ErrataTranslationInput = {
  lang: Locale;
  details: string;
};

export type ErrataTranslation = ErrataTranslationInput & {
  updatedAt: Date;
};

export type Errata = {
  id: string;
  cardIds: string[];
  cards?: BoosterCard[];
  type: ErrataType;
  details: string;
  originalLang: Locale;
  contentUpdatedAt: Date;
  translations?: ErrataTranslation[];
  source?: string;
  errataDate: Date;
  createdBy: string;
  createdAt: Date;
  deprecatedAt?: Date;
  votes: {
    positive: number;
    negative: number;
    userVote?: ErrataVoteType;
  };
};

export type ErrataDb = {
  cardIds: string[];
  type: ErrataType;
  details: string;
  originalLang: Locale;
  contentUpdatedAt: Date;
  translations?: ErrataTranslation[];
  source?: string;
  errataDate: Date;
  createdBy: ObjectId;
  createdAt: Date;
  deprecatedAt?: Date;
};

export type ErrataVoteDb = {
  errataId: ObjectId;
  userId: ObjectId;
  vote: ErrataVoteType;
  createdAt: Date;
};

