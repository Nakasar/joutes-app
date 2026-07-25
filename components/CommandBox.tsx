"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Calendar,
  Dices,
  Layers,
  Library,
  MapPin,
  ScrollText,
  Search,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { SearchResponse, SearchResult } from "@/app/api/search/route";

const EMPTY_RESULTS: SearchResponse = { games: [], cards: [], lairs: [], events: [], rules: [] };

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * Barre de recherche globale (command palette) : ouverte via Cmd/Ctrl+K ou
 * « / », ou par le bouton rendu par ce composant dans le header. Les
 * résultats (jeux, cartes, lieux, événements, règles) viennent de
 * /api/search ; des liens de navigation rapide sont proposés sans requête.
 */
export function CommandBox() {
  const t = useTranslations("Header");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform ?? ""));
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      // « / » n'ouvre la recherche que hors des champs de saisie.
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Recherche debouncée ; requestIdRef ignore les réponses obsolètes quand
  // plusieurs requêtes se chevauchent.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      // Invalide aussi les requêtes en vol pour qu'une réponse tardive ne
      // réinjecte pas de résultats alors que la saisie a été effacée.
      requestIdRef.current++;
      setResults(EMPTY_RESULTS);
      setLoading(false);
      return;
    }
    setLoading(true);
    const requestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if (requestId !== requestIdRef.current) return;
        setResults(res.ok ? await res.json() : EMPTY_RESULTS);
      } catch {
        if (requestId === requestIdRef.current) setResults(EMPTY_RESULTS);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const onOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      requestIdRef.current++;
      setQuery("");
      setResults(EMPTY_RESULTS);
      setLoading(false);
    }
  };

  const navigate = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [router]
  );

  const trimmed = query.trim();
  const hasQuery = trimmed.length >= 2;
  const quickLinks = [
    { href: "/games", label: t("menu.Jeux"), icon: Dices },
    { href: "/events", label: t("menu.Événements"), icon: Calendar },
    { href: "/lairs", label: t("menu.Lieux"), icon: MapPin },
    { href: "/tournaments", label: t("menu.Tournois"), icon: Trophy },
    { href: "/collection", label: t("menu.Collection"), icon: Library },
    { href: "/play-groups", label: t("menu.PlayGroups"), icon: Users },
  ];
  const groups: { key: string; heading: string; icon: typeof Dices; items: SearchResult[] }[] = [
    { key: "games", heading: t("search.groupGames"), icon: Dices, items: results.games },
    { key: "cards", heading: t("search.groupCards"), icon: Layers, items: results.cards },
    { key: "rules", heading: t("search.groupRules"), icon: ScrollText, items: results.rules },
    { key: "lairs", heading: t("search.groupLairs"), icon: MapPin, items: results.lairs },
    { key: "events", heading: t("search.groupEvents"), icon: Calendar, items: results.events },
  ];
  const hasResults = groups.some((group) => group.items.length > 0);

  return (
    <>
      {/* Déclencheur desktop : faux champ de recherche avec raccourci. */}
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-44 justify-between gap-2 px-3 text-muted-foreground xl:flex"
        aria-label={t("search.open")}
      >
        <span className="flex items-center gap-2 truncate text-sm font-normal">
          <Search className="h-4 w-4 shrink-0" />
          {t("search.open")}
        </span>
        <kbd className="pointer-events-none hidden shrink-0 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </Button>
      {/* Déclencheur compact (mobile / tablette). */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="xl:hidden"
        aria-label={t("search.open")}
      >
        <Search className="h-5 w-5" />
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t("search.title")}
        description={t("search.placeholder")}
        commandProps={{ shouldFilter: false }}
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={t("search.placeholder")}
        />
        <CommandList className="max-h-[420px]">
          {hasQuery && !loading && !hasResults && (
            <CommandEmpty>{t("search.empty")}</CommandEmpty>
          )}
          {hasQuery && loading && !hasResults && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("search.loading")}</p>
          )}
          {!hasQuery && (
            <CommandGroup heading={t("search.groupNavigation")}>
              {quickLinks.map((link) => (
                <CommandItem key={link.href} value={link.href} onSelect={() => navigate(link.href)}>
                  <link.icon />
                  <span>{link.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {hasQuery && groups.map((group) =>
            group.items.length > 0 ? (
              <CommandGroup key={group.key} heading={group.heading}>
                {group.items.map((item) => (
                  <CommandItem
                    key={`${group.key}-${item.href}-${item.label}`}
                    value={`${group.key}-${item.href}-${item.label}`}
                    onSelect={() => navigate(item.href)}
                  >
                    <group.icon />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{item.label}</span>
                      {item.sublabel && (
                        <span className="truncate text-xs text-muted-foreground">{item.sublabel}</span>
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
