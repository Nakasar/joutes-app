"use client";

import { useEffect, useRef, useState } from "react";
import { Dices, FileText, MapPin, Search, User } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { useRouter } from "@/i18n/navigation.ts";
import { ADMIN_NAVIGATION } from "@/lib/admin/navigation.ts";
import { type AdminSearchHit, type AdminSearchResults, searchAdminEverywhere } from "./actions.ts";

const EMPTY: AdminSearchResults = { users: [], lairs: [], games: [] };

const PAGES = ADMIN_NAVIGATION.flatMap((group) =>
  group.items.map((item) => ({
    href: item.href,
    label: item.label,
    hint: group.title,
    haystack: [item.label, group.title, ...(item.keywords ?? [])].join(" ").toLocaleLowerCase("fr"),
  }))
);

/**
 * La recherche de l'administration : les pages, puis des joueurs, des lieux et
 * des jeux. S'ouvre par le bouton de l'en-tête ou par Ctrl K (⌘ K).
 */
export function AdminCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminSearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        // La recherche du site écoute le même raccourci sur `document`. Celle
        // de l'administration l'intercepte avant, en phase de capture sur
        // `window`, pour qu'un seul des deux dialogues s'ouvre.
        event.preventDefault();
        event.stopPropagation();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    const requestId = ++requestIdRef.current;
    if (trimmed.length < 2) {
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const next = await searchAdminEverywhere(trimmed);
        if (requestId === requestIdRef.current) setResults(next);
      } catch {
        if (requestId === requestIdRef.current) setResults(EMPTY);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      requestIdRef.current++;
      setQuery("");
      setResults(EMPTY);
      setLoading(false);
    }
  };

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const needle = query.trim().toLocaleLowerCase("fr");
  const pages = needle ? PAGES.filter((page) => page.haystack.includes(needle)) : PAGES;
  // Une saisie trop courte ne lance pas de recherche : ses résultats éventuels
  // datent d'une saisie précédente et ne s'affichent plus.
  const shown = needle.length >= 2 ? results : EMPTY;
  const nothing =
    pages.length + shown.users.length + shown.lairs.length + shown.games.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full max-w-md items-center gap-2.5 rounded-lg border border-border bg-background px-3.5 text-left text-sm text-muted-foreground transition-colors hover:border-foreground/30"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">Chercher un joueur, un lieu, une page…</span>
        <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 font-sans text-xs sm:inline">Ctrl K</kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Rechercher dans l'administration"
        description="Pages, joueurs, lieux et jeux"
        commandProps={{ shouldFilter: false }}
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Joueur (Pseudo#1234), lieu, jeu ou page…"
        />
        <CommandList>
          {nothing && (
            <CommandEmpty>
              {loading ? "Recherche…" : "Rien ne correspond. Essayez un pseudonyme, un nom de lieu ou un identifiant."}
            </CommandEmpty>
          )}
          {pages.length > 0 && (
            <CommandGroup heading="Pages">
              {pages.map((page) => (
                <CommandItem key={page.href} value={`page:${page.href}`} onSelect={() => go(page.href)}>
                  <FileText aria-hidden />
                  <span className="flex-1">{page.label}</span>
                  {page.hint && <span className="text-xs text-muted-foreground">{page.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <HitGroup heading="Joueurs" hits={shown.users} icon={<User aria-hidden />} onSelect={go} />
          <HitGroup heading="Lieux" hits={shown.lairs} icon={<MapPin aria-hidden />} onSelect={go} />
          <HitGroup heading="Jeux" hits={shown.games} icon={<Dices aria-hidden />} onSelect={go} />
        </CommandList>
      </CommandDialog>
    </>
  );
}

function HitGroup({
  heading,
  hits,
  icon,
  onSelect,
}: {
  heading: string;
  hits: AdminSearchHit[];
  icon: React.ReactNode;
  onSelect: (href: string) => void;
}) {
  if (hits.length === 0) {
    return null;
  }

  return (
    <CommandGroup heading={heading}>
      {hits.map((hit) => (
        <CommandItem key={hit.href} value={`${heading}:${hit.href}`} onSelect={() => onSelect(hit.href)}>
          {icon}
          <span className="flex-1 truncate">{hit.label}</span>
          {hit.hint && <span className="max-w-[45%] truncate text-xs text-muted-foreground">{hit.hint}</span>}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
