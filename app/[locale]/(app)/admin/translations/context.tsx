import { Link } from "@/i18n/navigation.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { getGameLanguages } from "@/lib/constants/card-languages.ts";
import type { Game } from "@/lib/types/Game.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Ce que partagent l'écran de saisie et le glossaire : le jeu et la langue
 * choisis, et la rangée qui permet d'en changer.
 */

export type TranslationContext = {
  games: Game[];
  game?: Game;
  languages: string[];
  lang: string;
};

/** « fr » → « Français », dans la langue de l'administration. */
export function languageLabel(code: string): string {
  const label = new Intl.DisplayNames(["fr"], { type: "language" }).of(code) ?? code;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export async function resolveTranslationContext(gameId?: string, lang?: string): Promise<TranslationContext> {
  const games = (await getAllGames()).sort((a, b) => a.name.localeCompare(b.name));
  const game = games.find((candidate) => candidate.id === gameId);

  // On traduit depuis l'anglais, la langue de tous les imports : elle n'est
  // donc jamais proposée comme langue d'arrivée.
  const declared = getGameLanguages(game).filter((code) => code !== "en");
  const languages = declared.length > 0 ? declared : ["fr"];
  const selected = lang && languages.includes(lang) ? lang : languages.includes("fr") ? "fr" : languages[0];

  return { games, game, languages, lang: selected };
}

function pill(active: boolean) {
  return cn(
    "flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
    active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground/40"
  );
}

export function TranslationContextNav({ context, basePath }: { context: TranslationContext; basePath: string }) {
  const { games, game, languages, lang } = context;

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Jeu" className="flex flex-wrap items-center gap-1.5">
        {games.map((candidate) => (
          <Link
            key={candidate.id}
            href={`${basePath}?gameId=${candidate.id}&lang=${lang}`}
            aria-current={candidate.id === game?.id ? "page" : undefined}
            className={pill(candidate.id === game?.id)}
          >
            {candidate.name}
          </Link>
        ))}
        {games.length === 0 && <p className="text-sm text-muted-foreground">Aucun jeu enregistré.</p>}
      </nav>
      {game && (
        <nav aria-label="Langue" className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 text-muted-foreground">Traduire vers</span>
          {languages.map((code) => (
            <Link
              key={code}
              href={`${basePath}?gameId=${game.id}&lang=${code}`}
              aria-current={code === lang ? "page" : undefined}
              className={pill(code === lang)}
            >
              {languageLabel(code)}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
