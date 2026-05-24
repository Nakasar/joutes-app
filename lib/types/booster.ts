import {Game} from "@/lib/types/Game";
import {User} from "@/lib/types/User";
import {ObjectId} from "bson";

export type BoosterCard = {
  id: string;
  lang?: string;
  cardId?: string;
  boosterId?: string;
  name: string;
  subtitle?: string;
  setCode: string;
  collectorNumber: string;
  foil?: boolean;
  image: string;
  price?: string;
  newInCollection?: boolean;
  banned?: boolean;
};

export type BoosterCardDb = {
  boosterId: ObjectId;
  userId: ObjectId;
  cardId?: string;
  lang?: string;
  name: string;
  subtitle?: string;
  setCode: string;
  collectorNumber: string;
  foil?: boolean;
  image: string;
  price?: string;
  newInCollection?: boolean;
  banned?: boolean;
}

export type Booster = {
  gameId: Game['id'];
  game? : {
    id: Game['id'];
    slug?: string;
  };
  userId: User['id'];
  setCode: string;
  lang: string;
  type: string;
  id: string;
  cards: BoosterCard[];
  value?: string;
  archived: boolean;
  createdAt: string;
};

export type BoosterDb = {
  gameId: ObjectId;
  userId: ObjectId;
  setCode: string;
  lang: string;
  type: string;
  price?: string;
  archived: boolean;
  createdAt: Date;
};
