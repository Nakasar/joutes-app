import {ObjectId} from "bson";
import {Game} from "@/lib/types/Game";
import {Locale} from "@/i18n/config";

export type PolicyVoteType = "positive" | "negative";

export type PolicyTranslationInput = {
  lang: Locale;
  title: string;
  content: string;
};

export type PolicyTranslation = PolicyTranslationInput & {
  updatedAt: Date;
};

export type Policy = {
  id: string;
  title: string;
  content: string;
  originalLang: Locale;
  contentUpdatedAt: Date;
  translations?: PolicyTranslation[];

  gameId: string;
  game?: Pick<Game, 'id' | 'slug' | 'name'>

  source?: string;

  createdBy: string;
  createdAt: Date;
  deprecatedAt?: Date;

  votes: {
    positive: number;
    negative: number;
    userVote?: PolicyVoteType;
  };
};

export type PolicyDb = {
  gameId: ObjectId;
  title: string;
  content: string;
  originalLang: Locale;
  contentUpdatedAt: Date;
  translations?: PolicyTranslation[];
  source?: string;
  createdBy: string;
  createdAt: Date;
  deprecatedAt?: Date;
}

export type PolicyVoteDb = {
  policyId: ObjectId;
  userId: ObjectId;
  vote: PolicyVoteType;
  createdAt: Date;
}