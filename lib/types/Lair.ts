import {Game} from "@/lib/types/Game";
import {User} from "@/lib/types/User";

export type Lair = {
  id: string;
  name: string;
  banner?: string;

  games: Game['id'][];

  owners: User['id'][];
  
  eventsSourceUrls?: string[];
};
