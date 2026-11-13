"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Shuffle, Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { deckProblemText } from "@/components/play/deck-problems";

import { searchPlayDecksAction, type LobbyDeck } from "@/app/[locale]/(app)/games/riftbound/play/actions";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { BotDeckChoice } from "@/lib/engine/tables";
import { DOMAIN_HEX } from "@/lib/engine/told-text";
import { cn } from "@/lib/utils";

export function choiceKey(choice: BotDeckChoice | null): string {
  if (!choice) return "";
  if (choice.kind === "random") return "random";
  return choice.kind === "deck" ? `deck:${choice.deckId}` : `auto:${choice.legend}`;
}

/** Ce qu'une ligne de la liste montre, quelle que soit sa source. */
type Option = {
  key: string;
  choice: BotDeckChoice;
  name: string;
  hint: string;
  /** Code moteur de la légende, pour la vignette. */
  legend: string | null;
  domains: string[];
  /** Raison pour laquelle le moteur refuse le deck ; absente s'il est jouable. */
  refused?: string;
  favorites?: number;
  /** Texte où chercher, en minuscules. */
  haystack: string;
  deck?: PickerDeck;
};

const searchRiftboundDecks = (query: string) =>
  searchPlayDecksAction(query).then((result) => (result.ok ? result.decks : []));

/** Ce que la liste lit d'un deck : la fiche de la page Jouer, quelle que soit la liste du moteur qu'elle porte. */
export type PickerDeck = Omit<LobbyDeck, "list" | "completed"> & { list: unknown; completed?: unknown[] };

/** Ce que la liste lit d'une carte : la vignette, le nom et les couleurs d'une légende ou d'un leader. */
type PickerCards = Record<string, { name: string; image?: string; domains?: string[] } | undefined>;

type DeckPickerProps<D extends PickerDeck> = {
  id: string;
  /** L'intitulé au-dessus du champ ; absent, il est lu par les lecteurs d'écran seulement. */
  label?: string;
  srLabel?: string;
  decks: D[];
  legends: string[];
  cards: PickerCards;
  value: BotDeckChoice | null;
  /** `deck` : le deck Joutes choisi, utile pour un deck public trouvé par une recherche. */
  onChange: (choice: BotDeckChoice, deck?: D) => void;
  /** La recherche dans les decks publics ; celle de Riftbound sans précision. */
  search?: (query: string) => Promise<D[]>;
  /** Les textes qui nomment la légende, pour un jeu qui l'appelle autrement (le leader de SWU). */
  texts?: { auto?: string; randomHint?: string; search?: string };
  /** La couleur des pastilles (domaines de Riftbound sans précision). */
  colors?: Record<string, string>;
  /** Propose « Au hasard » : une légende tirée au sort à chaque partie (pour une IA). */
  allowRandom?: boolean;
  /** Cherche aussi dans les decks publics de Joutes pendant la frappe. */
  searchPublic?: boolean;
  className?: string;
};

/** Le temps laissé à la frappe avant de chercher sur le serveur. */
const SEARCH_DELAY_MS = 300;

/**
 * Le choix d'un deck pour un siège, dans une combobox avec recherche : mes
 * decks, ceux partagés dans mes groupes, les publics (cherchés sur Joutes
 * pendant la frappe), et les decks automatiques autour d'une légende. Un deck
 * que le moteur refuse reste visible, grisé, avec sa raison.
 */
export function DeckPicker<D extends PickerDeck = LobbyDeck>({
  id,
  label,
  srLabel,
  decks,
  legends,
  cards,
  value,
  onChange,
  allowRandom = false,
  searchPublic = true,
  search = searchRiftboundDecks as unknown as (query: string) => Promise<D[]>,
  colors = DOMAIN_HEX,
  texts = {},
  className,
}: DeckPickerProps<D>) {
  const t = useTranslations("Games.Play");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; decks: D[] } | null>(null);
  const [searching, setSearching] = useState(false);
  // Sur téléphone, la liste s'ouvre en feuille depuis le bas de l'écran : un
  // menu déroulant n'y trouve pas la place de sa recherche et de ses groupes.
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const sync = () => setPhone(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const trimmed = query.trim();
  const remote = searchPublic && trimmed.length >= 2;

  useEffect(() => {
    if (!remote || !open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void search(trimmed).then((decks) => {
        if (cancelled) return;
        setSearching(false);
        setFound({ query: trimmed, decks });
      });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [remote, open, trimmed, search]);

  const fromDeck = (deck: D): Option => {
    // Le nom que le deck range (celui du catalogue Joutes), sinon celui de la table.
    const legendName = deck.legendName ?? (deck.legend ? cards[deck.legend]?.name : undefined);
    const details =
      deck.source === "mine"
        ? [legendName]
        : deck.source === "shared"
          ? [deck.author, deck.groups?.join(", ")]
          : deck.source === "meta"
            ? [
                deck.author,
                // Le nom d'un deck importé dit déjà le tournoi et la place.
                deck.tournament && !deck.name.includes(deck.tournament.split(" · ").pop() ?? "") ? deck.tournament : undefined,
                deck.completed?.length ? t("deck.completed") : undefined,
              ]
            : [deck.author, legendName];
    return {
      key: `deck:${deck.id}`,
      choice: { kind: "deck", deckId: deck.id },
      name: deck.name,
      hint: details.filter(Boolean).join(" · "),
      legend: deck.legend,
      domains: (deck.domains ?? []).map((domain) => domain.toLowerCase()),
      refused: deck.list ? undefined : deckProblemText(t, deck.problems[0] ?? "noLegend"),
      favorites: deck.favorites,
      deck,
      haystack: [deck.name, deck.legendName, legendName, deck.author, deck.tournament, ...(deck.groups ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  };

  const autoOptions = useMemo<Option[]>(
    () =>
      legends.map((code) => {
        const name = cards[code]?.name ?? code;
        return {
          key: `auto:${code}`,
          choice: { kind: "auto", legend: code },
          name,
          hint: t("deck.autoHint"),
          legend: code,
          domains: cards[code]?.domains ?? [],
          haystack: `${name} ${code}`.toLowerCase(),
        };
      }),
    [legends, cards, t],
  );

  const known = decks.map(fromDeck);
  const randomOption: Option = {
    key: "random",
    choice: { kind: "random" },
    name: t("deck.random"),
    hint: texts.randomHint ?? t("deck.randomHint"),
    legend: null,
    domains: [],
    haystack: t("deck.random").toLowerCase(),
  };

  const needle = trimmed.toLowerCase();
  const matches = (option: Option) => !needle || option.haystack.includes(needle);

  // Ceux de la page, puis ceux trouvés sur le serveur pour cette recherche
  // (publics ou méta, rangés selon leur source).
  const fromPage = (source: LobbyDeck["source"]) => known.filter((_, index) => decks[index].source === source);
  const foundDecks =
    remote && found?.query === trimmed ? found.decks.filter((deck) => !known.some((other) => other.key === `deck:${deck.id}`)) : [];
  const foundOptions = foundDecks.map(fromDeck);
  const foundFrom = (source: LobbyDeck["source"]) =>
    foundOptions.filter((_, index) => foundDecks[index].source === source);

  const groups: { key: string; title: string; note?: string; options: Option[] }[] = [
    { key: "random", title: t("deck.randomGroup"), options: allowRandom ? [randomOption].filter(matches) : [] },
    {
      key: "mine",
      title: t("deck.mine"),
      options: fromPage("mine").filter(matches),
    },
    {
      key: "shared",
      title: t("deck.shared"),
      options: fromPage("shared").filter(matches),
    },
    {
      key: "meta",
      title: t("deck.meta"),
      note: searchPublic ? (remote ? t("deck.publicSearched") : t("deck.metaHint")) : undefined,
      options: [...fromPage("meta").filter(matches), ...foundFrom("meta")],
    },
    {
      key: "public",
      title: t("deck.public"),
      note: searchPublic ? (remote ? t("deck.publicSearched") : t("deck.publicHint")) : undefined,
      options: [...fromPage("public").filter(matches), ...foundFrom("public")],
    },
    { key: "auto", title: texts.auto ?? t("deck.auto"), options: autoOptions.filter(matches) },
  ].filter((group) => group.options.length > 0);

  const all = [...(allowRandom ? [randomOption] : []), ...known, ...foundOptions, ...autoOptions];
  const selectedKey = choiceKey(value);
  // Un deck public trouvé par une recherche passée n'est plus dans la liste : on garde son nom.
  const [remembered, setRemembered] = useState<Option | null>(null);
  const selected = all.find((option) => option.key === selectedKey) ?? (remembered?.key === selectedKey ? remembered : null);
  const count = groups.reduce((sum, group) => sum + group.options.length, 0);

  const pick = (option: Option) => {
    if (option.refused) return;
    setRemembered(option);
    onChange(option.choice, option.deck as D | undefined);
    setOpen(false);
    setQuery("");
  };

  const list = (
    <Command shouldFilter={false}>
      <div className="relative">
        <CommandInput value={query} onValueChange={setQuery} placeholder={texts.search ?? t("deck.search")} className="pr-20" />
        <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 font-mono text-xs text-muted-foreground">
          {searching && remote && <Loader2 className="size-3 animate-spin" aria-hidden />}
          {t("deck.count", { count })}
        </span>
      </div>
      <CommandList className="max-h-[min(26rem,60dvh)]">
        <CommandEmpty>{searching ? t("deck.searching") : t("deck.none")}</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup
            key={group.key}
            heading={
              <span className="flex justify-between gap-2">
                <span>{group.title}</span>
                {group.note && <span className="font-normal normal-case">{group.note}</span>}
              </span>
            }
          >
            {group.options.map((option) => (
              <CommandItem
                key={option.key}
                value={option.key}
                disabled={Boolean(option.refused)}
                onSelect={() => pick(option)}
                className="min-h-11 gap-3 py-1.5"
              >
                <OptionBody option={option} cards={cards} colors={colors} />
                {option.key === selectedKey && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {label ? (
        <Label htmlFor={id}>{label}</Label>
      ) : (
        srLabel && (
          <Label htmlFor={id} className="sr-only">
            {srLabel}
          </Label>
        )
      )}
      <Popover open={open && !phone} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-auto min-h-11 w-full justify-between gap-3 px-2.5 py-1.5 font-normal"
          >
            {selected ? (
              <OptionBody option={selected} cards={cards} colors={colors} />
            ) : (
              <span className="truncate text-muted-foreground">{t("deck.placeholder")}</span>
            )}
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(36rem,calc(100vw-2rem))] min-w-[var(--radix-popover-trigger-width)] p-0"
        >
          {list}
        </PopoverContent>
      </Popover>
      <Dialog open={open && phone} onOpenChange={setOpen}>
        <DialogContent className="top-auto bottom-0 max-h-[85dvh] max-w-none translate-y-0 gap-0 rounded-b-none p-0 pt-10 sm:max-w-none">
          <DialogTitle className="absolute left-4 top-3 text-base">{label ?? srLabel ?? t("deck.label")}</DialogTitle>
          {list}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** La vignette de la légende, le nom, la précision et les domaines d'une ligne. */
function OptionBody({ option, cards, colors }: { option: Option; cards: PickerCards; colors: Record<string, string> }) {
  const image = option.legend ? cards[option.legend]?.image : undefined;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
      <span
        aria-hidden
        className={cn(
          "flex h-10 w-7 shrink-0 items-center justify-center overflow-hidden rounded border bg-secondary",
          option.key === "random" && "bg-[repeating-linear-gradient(135deg,var(--secondary)_0_5px,var(--card)_5px_10px)]",
        )}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- vignette de carte servie telle quelle
          <img src={image} alt="" className="size-full object-cover" loading="lazy" />
        ) : option.key === "random" ? (
          <Shuffle className="size-3.5 text-muted-foreground" />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate font-medium">{option.name}</span>
        <span className={cn("truncate text-xs", option.refused ? "text-destructive" : "text-muted-foreground")}>
          {option.refused ?? option.hint}
        </span>
      </span>
      {option.favorites ? (
        <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
          <Star className="size-3" aria-hidden />
          {option.favorites}
        </span>
      ) : null}
      {option.domains.length > 0 && (
        <span className="flex shrink-0 gap-1" aria-hidden>
          {option.domains.slice(0, 3).map((domain) => (
            <span key={domain} className="size-2.5 rounded-full" style={{ background: colors[domain] ?? "#64748b" }} />
          ))}
        </span>
      )}
    </span>
  );
}
