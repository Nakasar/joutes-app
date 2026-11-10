"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

import { useRouter } from "@/i18n/navigation.ts";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";

import { viewHref } from "../views.ts";

type Option = { value: string; label: string };

/** `Select` refuse une valeur vide : « toutes » a la sienne. */
const ALL = "__all";

/**
 * Légende, membre, recherche : les filtres qui ne tiennent pas en pastilles.
 *
 * Chacun réécrit l'adresse, comme les pastilles de jeu et de domaine que la
 * vue rend côté serveur : c'est l'adresse qui porte l'état de la vue.
 */
export function DeckFilterBar({
  playGroupId,
  params,
  legends,
  owners,
}: {
  playGroupId: string;
  params: Record<string, string | undefined>;
  legends: Option[];
  owners: Option[];
}) {
  const t = useTranslations("PlayGroups.hub.decks");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.q ?? "");

  const go = (patch: Record<string, string | undefined>) => {
    startTransition(() => {
      router.replace(viewHref(playGroupId, "decks", { filters: { ...params, ...patch } }), { scroll: false });
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      {legends.length > 0 && (
        <Select value={params.legende ?? ALL} onValueChange={(value) => go({ legende: value === ALL ? undefined : value })}>
          <SelectTrigger className="min-w-[180px]" aria-label={t("legendFilter")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allLegends")}</SelectItem>
            {legends.map((legend) => (
              <SelectItem key={legend.value} value={legend.value}>
                {legend.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {owners.length > 1 && (
        <Select value={params.membre ?? ALL} onValueChange={(value) => go({ membre: value === ALL ? undefined : value })}>
          <SelectTrigger className="min-w-[180px]" aria-label={t("memberFilter")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allMembers")}</SelectItem>
            {owners.map((owner) => (
              <SelectItem key={owner.value} value={owner.value}>
                {owner.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <form
        role="search"
        className="relative min-w-[200px] flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          go({ q: query.trim() || undefined });
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onBlur={() => {
            if ((params.q ?? "") !== query.trim()) go({ q: query.trim() || undefined });
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          maxLength={80}
          className="pl-9"
        />
      </form>
    </div>
  );
}
