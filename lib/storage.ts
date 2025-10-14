import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";

// Stockage en mémoire (à remplacer par une vraie base de données)
export const storage = {
  games: [] as Game[],
  lairs: [] as Lair[],
};
