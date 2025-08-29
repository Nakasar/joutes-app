import {Lair} from "@/lib/types/Lair";
import {Game} from "@/lib/types/Game";

export type User = {
  id: string;
  username: string;
  email: string;
  discordId: string;

  avatar: string;

  lairs: Lair['id'][];
  games: Game['id'][];
};
