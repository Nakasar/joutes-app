import { getTranslations } from "next-intl/server";
import { ArrowDownUp } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import {
  REGISTRY_SORTS,
  hasActiveFilters,
  toRegistryParams,
  type RegistryFilters as Filters,
} from "@/lib/users/registry-search.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Les pastilles du registre.
 *
 * Des liens, pas des boutons : chaque combinaison de filtres est une adresse,
 * et c'est ce qui permet de partager « les joueurs de Riftbound autour de
 * Thionville » plutôt que de le décrire. Ils **se cumulent** — cliquer « en
 * direct » ne retire pas le jeu déjà choisi.
 *
 * La rangée porte `flex-wrap` : les pastilles ne se coupent ni ne rétrécissent,
 * et sans lui c'est le document entier qui s'élargirait sur un téléphone.
 */
export default async function RegistryFilters({
  filters,
  games,
  city,
}: {
  filters: Filters;
  games: { id: string; name: string }[];
  /** La commune du visiteur, quand il en a renseigné une. */
  city?: string;
}) {
  const t = await getTranslations("Users.registry.filters");

  const href = (next: Partial<Filters>) => {
    // Le compteur repart à zéro dès qu'un filtre change : il décrit une liste
    // qui n'est plus la même.
    const params = toRegistryParams({ ...filters, ...next, count: undefined });
    const query = new URLSearchParams(params).toString();
    return query ? `/users?${query}` : "/users";
  };

  const pill = (active: boolean, tone?: "live") =>
    cn(
      "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium whitespace-nowrap transition-colors sm:min-h-9",
      tone === "live"
        ? active
          ? "border-red-500/50 bg-red-500/15 text-red-600 dark:text-red-300"
          : "border-red-500/35 text-muted-foreground hover:text-foreground"
        : active
          ? "border-primary bg-primary/15 text-foreground"
          : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={href({ gameId: undefined, city: undefined, sells: false, live: false })} className={pill(!hasActiveFilters(filters))}>
        {t("all")}
      </Link>

      {games.map((game) => (
        <Link
          key={game.id}
          href={href({ gameId: filters.gameId === game.id ? undefined : game.id })}
          className={pill(filters.gameId === game.id)}
        >
          {game.name}
        </Link>
      ))}

      {city && (
        <Link
          href={href({ city: filters.city ? undefined : city })}
          className={pill(Boolean(filters.city))}
        >
          {t("nearCity", { city })}
        </Link>
      )}

      <Link href={href({ sells: !filters.sells })} className={pill(filters.sells)}>
        {t("sells")}
      </Link>

      <Link href={href({ live: !filters.live })} className={pill(filters.live, "live")}>
        <span aria-hidden className="size-1.5 rounded-full bg-red-500" />
        {t("live")}
      </Link>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <ArrowDownUp className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        {REGISTRY_SORTS.map((sort) => (
          <Link
            key={sort}
            href={href({ sort })}
            className={cn(
              "min-h-11 rounded-md px-2 text-xs whitespace-nowrap transition-colors sm:min-h-0 sm:py-1",
              "inline-flex items-center",
              filters.sort === sort
                ? "font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`sorts.${sort}`)}
          </Link>
        ))}
      </div>
    </div>
  );
}
