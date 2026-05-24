import { ObjectId } from "bson";
import {BoosterCard} from "@/lib/types/booster";

export type ErrataType = "errata" | "clarification" | "ruling";

export type ErrataVoteType = "positive" | "negative";

export type Errata = {
  id: string;
  cardId: string;
  card?: BoosterCard;
  type: ErrataType;
  details: string;
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
  cardId: string;
  type: ErrataType;
  details: string;
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

