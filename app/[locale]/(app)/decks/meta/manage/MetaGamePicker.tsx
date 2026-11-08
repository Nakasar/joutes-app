"use client";

import { useRouter } from "@/i18n/navigation.ts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";

/** Le jeu dont on gère la méta : changer de jeu garde l'onglet ouvert. */
export function MetaGamePicker({
  games,
  value,
  tab,
}: {
  games: { key: string; name: string }[];
  value: string;
  tab: string;
}) {
  const router = useRouter();

  return (
    <Select
      value={value}
      onValueChange={(next) =>
        router.push(`/decks/meta/manage?game=${encodeURIComponent(next)}${tab === "import" ? "" : `&tab=${tab}`}`)
      }
    >
      <SelectTrigger className="w-56" aria-label="Jeu">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {games.map((game) => (
          <SelectItem key={game.key} value={game.key}>
            {game.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
