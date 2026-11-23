import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import {IntlProvider, useTranslations} from "use-intl";
import {z} from "zod";
import {useApp} from "@modelcontextprotocol/ext-apps/react";
import type {App, McpUiDisplayMode, McpUiHostContext} from "@modelcontextprotocol/ext-apps";
import type {CallToolResult} from "@modelcontextprotocol/server";
import {Maximize2, Minimize2, Minus, Plus, Search, Sparkles, Undo2} from "lucide-react";
import CardImage from "@/components/cards/CardImage.tsx";
import {
  changeCardQuantity,
  deckLegality,
  deckSize,
  isDeckCompliant,
  zoneEntries,
  type DeckCardInfo,
  type DeckCards,
} from "@/lib/decks/contents.ts";
import {zonesForDeck} from "@/lib/decks/extra-legends.ts";
import {routeCardToZone} from "@/lib/decks/routing.ts";
import {zoneCounterLabel, type DeckZoneKey} from "@/lib/decks/zones.ts";
import {describeDeck} from "@/lib/mcp/decks.ts";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import de from "@/messages/de.json";
import it from "@/messages/it.json";
import type {
  DeckChangesResult,
  DeckEditorDeck,
  DeckEditorResult,
  DeckEditorSaveResult,
  DeckEditorSearchResult,
  DeckEditorSummary,
} from "./result.ts";

/*
  Vue MCP App de l'éditeur de deck : le client (Claude, ChatGPT…) l'affiche
  sous l'appel de `open_deck_editor`, puis en panneau quand l'utilisateur
  l'agrandit.

  Deux chemins d'écriture, comme convenu avec Kevin (2026-11-23) :
  - ce que l'utilisateur fait ici s'enregistre tout seul, par l'outil réservé
    à la vue `deck_editor_save` — pas de demande d'accord à chaque carte, comme
    sur le site ;
  - ce que fait l'assistant passe par les outils que la vue lui donne
    (`edit_open_deck`), que le client soumet à l'accord de l'utilisateur ; un
    bandeau permet ensuite d'annuler le changement.
*/

const MESSAGES = {
  fr: {McpDeckEditor: fr.McpDeckEditor},
  en: {McpDeckEditor: en.McpDeckEditor},
  de: {McpDeckEditor: de.McpDeckEditor},
  it: {McpDeckEditor: it.McpDeckEditor},
};
type Locale = keyof typeof MESSAGES;

function localeOf(hostLocale?: string): Locale {
  const language = (hostLocale ?? navigator.language ?? "").slice(0, 2).toLowerCase();
  return language in MESSAGES ? language as Locale : "en";
}

/** Délai entre le dernier clic et l'enregistrement : dix « + » font un seul aller-retour. */
const SAVE_DELAY_MS = 700;
/** Essais après une panne réseau, à délai doublé ; une erreur rendue par le serveur n'est pas relancée. */
const MAX_RETRIES = 4;

/** Ce qui a changé de `from` à `to`, carte par carte et zone par zone. */
function cardsDelta(from: DeckCards, to: DeckCards): { zone: DeckZoneKey; cardId: string; delta: number }[] {
  const keys = new Set([...Object.keys(from), ...Object.keys(to)] as DeckZoneKey[]);
  const changes: { zone: DeckZoneKey; cardId: string; delta: number }[] = [];
  for (const zone of keys) {
    const before = new Map(zoneEntries(from, zone).map((entry) => [entry.cardId, entry.quantity]));
    const after = new Map(zoneEntries(to, zone).map((entry) => [entry.cardId, entry.quantity]));
    for (const cardId of new Set([...before.keys(), ...after.keys()])) {
      const delta = (after.get(cardId) ?? 0) - (before.get(cardId) ?? 0);
      if (delta !== 0) changes.push({zone, cardId, delta});
    }
  }
  return changes;
}

type SaveStatus = "saved" | "pending" | "saving" | "conflict" | "error";
type Banner = { applied: string[]; skipped: string[]; previousCards: DeckCards };

function textOf(result: CallToolResult): string | undefined {
  const block = result.content?.find((c) => c.type === "text");
  return block && "text" in block ? block.text : undefined;
}

// ── Petits éléments ───────────────────────────────────────────────────────────
function Pill({ok, children}: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={ok
      ? "rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      : "rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"}>
      {children}
    </span>
  );
}

function CardPicture({card, className}: { card?: DeckCardInfo; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (card?.image && !failed) {
    return <CardImage src={card.image} alt={card.name} orientation={card.orientation} className={className} onError={() => setFailed(true)} />;
  }
  return (
    <div className={`${className ?? ""} aspect-[5/7] rounded-md border bg-muted flex items-center justify-center p-1.5 text-center`}>
      <span className="text-[11px] leading-tight text-muted-foreground line-clamp-3 break-words">{card?.name ?? "?"}</span>
    </div>
  );
}

function IconButton({label, onClick, children, disabled}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean
}) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
            className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40">
      {children}
    </button>
  );
}

// ── Liste « Mes decks » ───────────────────────────────────────────────────────
function DeckList({decks, games, onOpen, loading}: {
  decks: DeckEditorSummary[];
  games: { slug: string; name: string }[];
  onOpen: (deckId: string) => void;
  loading: string | null;
}) {
  const t = useTranslations("McpDeckEditor");
  const [game, setGame] = useState<string | null>(null);
  const shown = game ? decks.filter((deck) => deck.gameSlug === game) : decks;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl font-semibold mr-auto">{t("myDecks")}</h1>
        {games.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            <button type="button" onClick={() => setGame(null)}
                    className={`rounded-md px-2.5 py-1 text-sm border ${game === null ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
              {t("allGames")}
            </button>
            {games.map((entry) => (
              <button key={entry.slug} type="button" onClick={() => setGame(entry.slug)}
                      className={`rounded-md px-2.5 py-1 text-sm border ${game === entry.slug ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                {entry.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {shown.length === 0 && <p className="text-sm text-muted-foreground">{t("noDecks")}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {shown.map((deck) => (
          <button key={deck.id} type="button" onClick={() => onOpen(deck.id)} disabled={loading !== null}
                  className="text-left rounded-lg border bg-card overflow-hidden hover:border-primary disabled:opacity-60">
            <div className="h-24 bg-muted overflow-hidden">
              {deck.coverImage && <img src={deck.coverImage} alt="" className="size-full object-cover object-top"/>}
            </div>
            <div className="p-2.5 space-y-1">
              <div className="font-medium text-sm truncate">{deck.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {[deck.legendName ?? deck.gameName, t("cardCount", {count: deck.size})].filter(Boolean).join(" · ")}
              </div>
              <Pill ok={deck.compliant}>{loading === deck.id ? t("opening") : deck.compliant ? t("compliant") : t("toAdjust")}</Pill>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Catalogue ─────────────────────────────────────────────────────────────────
function Catalog({app, deck, onAdd, compact}: {
  app: App;
  deck: DeckEditorDeck;
  onAdd: (card: DeckCardInfo, zone: DeckZoneKey | "auto") => void;
  compact?: boolean;
}) {
  const t = useTranslations("McpDeckEditor");
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState<DeckZoneKey | "auto">("auto");
  const [results, setResults] = useState<DeckEditorSearchResult["cards"]>([]);
  const [searching, setSearching] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const id = ++request.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await app.callServerTool({name: "deck_editor_search_cards", arguments: {deckId: deck.id, query: trimmed}});
        if (id !== request.current) return;
        setResults((result.structuredContent as DeckEditorSearchResult | undefined)?.cards ?? []);
      } catch {
        if (id === request.current) setResults([]);
      } finally {
        if (id === request.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [app, deck.id, query]);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5">
        <Search size={14} className="text-muted-foreground shrink-0"/>
        <span className="sr-only">{t("searchLabel")}</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")}
               className="w-full bg-transparent text-sm outline-none"/>
      </label>
      {!compact && (
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label={t("addZone")}>
          {[{key: "auto" as const, short: t("auto")}, ...deck.zones].map((entry) => (
            <button key={entry.key} type="button" onClick={() => setZone(entry.key)} aria-pressed={zone === entry.key}
                    className={`rounded-full px-2.5 py-0.5 text-xs border ${zone === entry.key ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
              {entry.short}
            </button>
          ))}
        </div>
      )}
      {searching && results.length === 0 && <p className="text-xs text-muted-foreground">{t("searching")}</p>}
      {!searching && query.trim().length >= 2 && results.length === 0 && <p className="text-xs text-muted-foreground">{t("noResults")}</p>}
      <ul className={compact ? "grid grid-cols-1 sm:grid-cols-2 gap-1.5" : "space-y-1.5"}>
        {results.map((card) => (
          <li key={card.id} className="flex items-center gap-2 rounded-md border bg-card p-1.5">
            <CardPicture card={card} className="w-9 shrink-0"/>
            <div className="min-w-0 flex-1">
              <div className="text-sm truncate">{card.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {[card.type, card.cost !== undefined ? t("cost", {cost: card.cost}) : null, t("owned", {count: card.owned})].filter(Boolean).join(" · ")}
              </div>
            </div>
            <IconButton label={t("addCard", {name: card.name})} onClick={() => onAdd(card, compact ? "auto" : zone)}>
              <Plus size={16}/>
            </IconButton>
          </li>
        ))}
      </ul>
      {!compact && <p className="text-xs text-muted-foreground">{t("autoHint")}</p>}
    </div>
  );
}

// ── Zones ─────────────────────────────────────────────────────────────────────
function Zones({deck, cards, catalog, onChange, highlight, compact}: {
  deck: DeckEditorDeck;
  cards: DeckCards;
  catalog: Map<string, DeckCardInfo>;
  onChange: (zone: DeckZoneKey, cardId: string, delta: number) => void;
  highlight: Set<string>;
  compact?: boolean;
}) {
  const t = useTranslations("McpDeckEditor");
  const legality = deckLegality(cards, deck.zones);

  return (
    <div className={compact ? "grid sm:grid-cols-2 gap-3 items-start" : "space-y-3"}>
      {legality.map(({zone, count, contributed, compliant}) => {
        const entries = zoneEntries(cards, zone.key);
        if (compact && entries.length === 0) return null;
        return (
          <section key={zone.key} className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-semibold">{zone.label}</h3>
              <span className="text-xs font-mono text-muted-foreground">{zoneCounterLabel(zone, count, contributed)}</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">{zone.rule}</span>
              <span className="ml-auto"><Pill ok={compliant}>{compliant ? t("compliant") : t("toAdjust")}</Pill></span>
            </div>
            {entries.length === 0
              ? <p className="text-xs text-muted-foreground">{t("emptyZone")}</p>
              : compact ? (
                <ul className="space-y-1">
                  {entries.map((entry) => {
                    const name = catalog.get(entry.cardId)?.name ?? entry.cardId;
                    const owned = deck.owned[entry.cardId];
                    return (
                      <li key={entry.cardId} className={`flex items-center gap-2 rounded-md px-1.5 ${highlight.has(entry.cardId) ? "bg-primary/10" : ""}`}>
                        <span className="text-sm truncate flex-1" title={name}>{name}</span>
                        {owned !== undefined && owned < entry.quantity && (
                          <span title={t("ownedOf", {owned, count: entry.quantity})} className="rounded bg-amber-500/90 text-black text-[10px] font-semibold px-1">{owned}/{entry.quantity}</span>
                        )}
                        <IconButton label={t("removeOne", {name})} onClick={() => onChange(zone.key, entry.cardId, -1)}><Minus size={13}/></IconButton>
                        <span className="text-sm font-semibold tabular-nums w-5 text-center">{entry.quantity}</span>
                        <IconButton label={t("addOne", {name})} onClick={() => onChange(zone.key, entry.cardId, 1)}><Plus size={13}/></IconButton>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5">
                  {entries.map((entry) => {
                    const card = catalog.get(entry.cardId);
                    const name = card?.name ?? entry.cardId;
                    const owned = deck.owned[entry.cardId];
                    return (
                      <div key={entry.cardId} className="space-y-1">
                        <div className={`relative rounded-md ${highlight.has(entry.cardId) ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
                          <CardPicture card={card} className="w-full"/>
                          <div className="absolute top-1 left-1/2 -translate-x-1/2 flex items-center rounded-full bg-background/90 border shadow-sm">
                            <IconButton label={t("removeOne", {name})} onClick={() => onChange(zone.key, entry.cardId, -1)}><Minus size={13}/></IconButton>
                            <span className="text-xs font-semibold tabular-nums min-w-4 text-center">{entry.quantity}</span>
                            <IconButton label={t("addOne", {name})} onClick={() => onChange(zone.key, entry.cardId, 1)}><Plus size={13}/></IconButton>
                          </div>
                          {owned !== undefined && owned < entry.quantity && (
                            <span title={t("ownedOf", {owned, count: entry.quantity})} className="absolute bottom-1 right-1 rounded bg-amber-500/90 text-black text-[10px] font-semibold px-1">
                              {owned}/{entry.quantity}
                            </span>
                          )}
                        </div>
                        <div className="text-xs truncate" title={name}>{name}</div>
                      </div>
                    );
                  })}
                </div>
              )}
          </section>
        );
      })}
    </div>
  );
}

// ── Éditeur ───────────────────────────────────────────────────────────────────
type EditorHandle = {
  /** Le deck tel qu'il est à l'écran, enregistré ou non. */
  current: () => { deck: DeckEditorDeck; cards: DeckCards; catalog: Map<string, DeckCardInfo> } | null;
  /** Attend la fin de l'enregistrement en cours ou à venir. */
  flush: () => Promise<void>;
  /** Adopte le deck rendu par `update_deck_cards`, et montre le bandeau d'annulation. */
  applyChanges: (result: DeckChangesResult) => void;
};

function Editor({app, initial, displayMode, canExpand, canAsk, handle, onBack}: {
  app: App;
  initial: DeckEditorDeck;
  displayMode: McpUiDisplayMode;
  canExpand: boolean;
  canAsk: boolean;
  handle: React.RefObject<EditorHandle | null>;
  onBack?: (deck: DeckEditorDeck) => void;
}) {
  const t = useTranslations("McpDeckEditor");
  const [deck, setDeck] = useState(initial);
  const [cards, setCards] = useState<DeckCards>(initial.cards);
  const [catalog, setCatalog] = useState(() => new Map(initial.catalog.map((card) => [card.id, card])));
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [conflict, setConflict] = useState<DeckEditorDeck | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());

  const version = useRef(initial.version);
  const dirty = useRef(false);
  const saving = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  const expanded = displayMode === "fullscreen";
  // Les zones suivent le contenu, comme sur le site : avec Neeko, quatre légendes.
  const zones = useMemo(() => zonesForDeck(deck.zones, cards), [deck.zones, cards]);
  const shown = useMemo(() => ({...deck, zones}), [deck, zones]);
  const failures = useRef(0);
  /** Le contenu au moment où l'assistant a pris la main, pour reporter les clics faits pendant son appel. */
  const baseline = useRef<DeckCards | null>(null);

  /** Dit au modèle ce que montre l'éditeur, pour la question suivante de l'utilisateur. */
  const shareContext = useCallback((saved: DeckEditorDeck) => {
    if (!app.getHostCapabilities()?.updateModelContext) return;
    app.updateModelContext({
      content: [{type: "text", text: `Deck ouvert dans l'éditeur Joutes (à jour) :\n\n${describeDeck(saved)}`}],
    }).catch(() => undefined);
  }, [app]);

  const saveRef = useRef<(force?: boolean) => Promise<void>>(async () => undefined);
  const schedule = useCallback((delay = SAVE_DELAY_MS) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void saveRef.current();
    }, delay);
  }, []);

  const save = useCallback(async (force = false): Promise<void> => {
    // Attendre tous les envois en cours, pas seulement le premier : un autre
    // appelant a pu en lancer un pendant qu'on attendait.
    while (saving.current) {
      await saving.current;
    }
    if (!dirty.current && !force) return;
    const outcome: { value: "done" | "refused" | "retry" } = {value: "done"};
    dirty.current = false;
    const sent = cardsRef.current;
    setStatus("saving");

    const run = (async () => {
      try {
        const result = await app.callServerTool({
          name: "deck_editor_save",
          arguments: {deckId: initial.id, cards: sent, expectedVersion: version.current},
        });
        const content = result.structuredContent as DeckEditorSaveResult | undefined;
        if (result.isError || !content) {
          // Refus du serveur (deck supprimé, carte inconnue) : relancer n'y
          // changerait rien, le prochain clic réessaiera.
          dirty.current = true;
          outcome.value = "refused";
          setStatus("error");
          return;
        }
        if (!content.ok) {
          outcome.value = "refused";
          setConflict(content.deck);
          setStatus("conflict");
          return;
        }
        version.current = content.deck.version;
        setDeck(content.deck);
        setCatalog((previous) => new Map([...previous, ...content.deck.catalog.map((card) => [card.id, card] as const)]));
        shareContext(content.deck);
        failures.current = 0;
        setStatus(dirty.current ? "pending" : "saved");
      } catch {
        dirty.current = true;
        outcome.value = "retry";
        setStatus("error");
      }
    })();
    saving.current = run;
    await run;
    saving.current = null;
    if (outcome.value === "retry") {
      failures.current += 1;
      if (failures.current <= MAX_RETRIES) schedule(SAVE_DELAY_MS * 2 ** failures.current);
    } else if (outcome.value === "done" && dirty.current) {
      schedule();
    }
  }, [app, initial.id, schedule, shareContext]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);


  const edit = useCallback((next: DeckCards) => {
    setCards(next);
    cardsRef.current = next;
    dirty.current = true;
    failures.current = 0;
    setStatus("pending");
    setBanner(null);
    schedule();
  }, [schedule]);

  const changeQuantity = (zone: DeckZoneKey, cardId: string, delta: number) => {
    edit(changeCardQuantity(cardsRef.current, zone, cardId, delta));
  };

  const addCard = (card: DeckCardInfo, zone: DeckZoneKey | "auto") => {
    setCatalog((previous) => new Map(previous).set(card.id, card));
    const target = zone === "auto" ? routeCardToZone(card, zonesForDeck(deck.zones, cardsRef.current), cardsRef.current) : zone;
    edit(changeCardQuantity(cardsRef.current, target, card.id, 1));
    setHighlight(new Set([card.id]));
  };

  const adopt = (fresh: DeckEditorDeck) => {
    version.current = fresh.version;
    dirty.current = false;
    setDeck(fresh);
    setCards(fresh.cards);
    cardsRef.current = fresh.cards;
    setCatalog((previous) => new Map([...previous, ...fresh.catalog.map((card) => [card.id, card] as const)]));
    setConflict(null);
    setStatus("saved");
  };

  const keepMine = () => {
    if (!conflict) return;
    version.current = conflict.version;
    setConflict(null);
    dirty.current = true;
    void save(true);
  };

  const undo = () => {
    if (!banner) return;
    setBanner(null);
    setHighlight(new Set());
    edit(banner.previousCards);
  };

  useEffect(() => {
    handle.current = {
      current: () => ({deck: {...deck, version: version.current, cards: cardsRef.current}, cards: cardsRef.current, catalog}),
      flush: async () => {
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        await save();
        baseline.current = cardsRef.current;
      },
      applyChanges: (result) => {
        // Les clics faits pendant l'appel de l'assistant se reportent sur le
        // deck qu'il rend, au lieu d'être écrasés.
        const local = baseline.current ? cardsDelta(baseline.current, cardsRef.current) : [];
        baseline.current = null;
        adopt(result.deck);
        if (local.length > 0) {
          const rebased = local.reduce((acc, change) => changeCardQuantity(acc, change.zone, change.cardId, change.delta), result.deck.cards);
          setCards(rebased);
          cardsRef.current = rebased;
          dirty.current = true;
          setStatus("pending");
          schedule();
        }
        if (result.applied.length > 0 || result.skipped.length > 0) {
          setBanner({applied: result.applied, skipped: result.skipped, previousCards: result.previousCards});
        }
        const before = new Set(Object.values(result.previousCards).flat().map((entry) => `${entry.cardId}:${entry.quantity}`));
        setHighlight(new Set(Object.values(result.deck.cards).flat()
          .filter((entry) => !before.has(`${entry.cardId}:${entry.quantity}`))
          .map((entry) => entry.cardId)));
        shareContext(result.deck);
      },
    };
  });

  // Enregistrer avant que le client ne démonte la vue.
  useEffect(() => {
    app.onteardown = async () => {
      if (timer.current) clearTimeout(timer.current);
      await save();
      return {};
    };
  }, [app, save]);

  /** Retour à la liste, après avoir enregistré : la liste montre le deck à jour. */
  const goBack = async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await save();
    onBack?.({...deck, version: version.current, cards: cardsRef.current});
  };

  const size = deckSize(cards, zones);
  const legality = deckLegality(cards, zones);

  const statusLabel = {
    saved: t("saved"),
    pending: t("pending"),
    saving: t("saving"),
    conflict: t("conflictShort"),
    error: t("saveError"),
  }[status];

  const toggleDisplay = async () => {
    await app.requestDisplayMode({mode: expanded ? "inline" : "fullscreen"}).catch(() => undefined);
  };

  const askClaude = async () => {
    await app.sendMessage({
      role: "user",
      content: [{type: "text", text: t("askMessage", {name: deck.name})}],
    }).catch(() => undefined);
  };

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {onBack && (
            <button type="button" onClick={goBack} className="text-sm text-muted-foreground hover:text-foreground">← {t("myDecks")}</button>
          )}
          <h1 className="text-xl font-semibold mr-1">{deck.name}</h1>
          {deck.gameName && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{deck.gameName}</span>}
          <span className={`text-xs ${status === "error" || status === "conflict" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} aria-live="polite">
            {statusLabel} · {t("cardCount", {count: size})}
          </span>
          <div className="ml-auto flex gap-2 flex-wrap">
            {canAsk && (
              <button type="button" onClick={askClaude}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90">
                <Sparkles size={14}/>{t("ask")}
              </button>
            )}
            {canExpand && (
              <button type="button" onClick={toggleDisplay}
                      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                {expanded ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}{expanded ? t("collapse") : t("expand")}
              </button>
            )}
            <button type="button" onClick={() => app.openLink({url: deck.editUrl})}
                    className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
              {t("openOnJoutes")}
            </button>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {legality.map(({zone, count, contributed, compliant}) => (
            <Pill key={zone.key} ok={compliant}>{zone.short} {zoneCounterLabel(zone, count, contributed)}</Pill>
          ))}
        </div>
      </header>

      {conflict && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-900 p-3 text-sm flex items-center gap-2 flex-wrap">
          <span className="mr-auto">{t("conflict")}</span>
          <button type="button" onClick={keepMine} className="rounded-md border px-2.5 py-1 hover:bg-muted">{t("keepMine")}</button>
          <button type="button" onClick={() => adopt(conflict)} className="rounded-md border px-2.5 py-1 hover:bg-muted">{t("takeTheirs")}</button>
        </div>
      )}

      {banner && (
        <div role="status" className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm flex items-start gap-2 flex-wrap">
          <div className="mr-auto space-y-0.5">
            <div className="font-medium">{t("changedByAssistant")}</div>
            {banner.applied.length > 0 && <div className="text-muted-foreground">{banner.applied.join(" · ")}</div>}
            {banner.skipped.length > 0 && <div className="text-red-700 dark:text-red-400">{banner.skipped.join(" · ")}</div>}
          </div>
          {banner.applied.length > 0 && (
            <button type="button" onClick={undo} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 hover:bg-muted">
              <Undo2 size={14}/>{t("undo")}
            </button>
          )}
        </div>
      )}

      {expanded ? (
        <div className="flex flex-col md:flex-row gap-4">
          <aside className="md:w-72 md:shrink-0">
            <Catalog app={app} deck={shown} onAdd={addCard}/>
          </aside>
          <div className="flex-1 min-w-0">
            <Zones deck={shown} cards={cards} catalog={catalog} onChange={changeQuantity} highlight={highlight}/>
          </div>
        </div>
      ) : (
        <>
          <Zones deck={shown} cards={cards} catalog={catalog} onChange={changeQuantity} highlight={highlight} compact/>
          <Catalog app={app} deck={shown} onAdd={addCard} compact/>
          <p className="text-xs text-muted-foreground">{t("autosaveHint")}</p>
        </>
      )}
    </div>
  );
}

// ── Liaison avec le client ────────────────────────────────────────────────────
type ViewState =
  | { status: "waiting" }
  | { status: "error"; message?: string }
  | { status: "ready"; result: DeckEditorResult };

const changesSchema = z.object({
  changes: z.array(z.object({
    cardName: z.string().describe("Nom exact de la carte"),
    quantity: z.number().int().describe("Exemplaires à ajouter (positif) ou à retirer (négatif)"),
    zone: z.string().optional().describe("Zone visée (« Deck principal », « Runes », « Réserve »…) ; absente, la carte va là où son type la range"),
  })).min(1).max(60),
});

function DeckEditorApp() {
  const [state, setState] = useState<ViewState>({status: "waiting"});
  const [list, setList] = useState<Extract<DeckEditorResult, { mode: "list" }> | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [locale, setLocale] = useState<Locale>(() => localeOf());
  const [context, setContext] = useState<McpUiHostContext | undefined>();
  const editor = useRef<EditorHandle | null>(null);

  const {app} = useApp({
    appInfo: {name: "Joutes — éditeur de deck", version: "1.0.0"},
    capabilities: {tools: {listChanged: false}, availableDisplayModes: ["inline", "fullscreen"]},
    onAppCreated: (created) => {
      created.ontoolinput = () => setState((previous) => previous.status === "ready" ? previous : {status: "waiting"});
      created.ontoolresult = (result) => {
        const content = result.structuredContent as DeckEditorResult | undefined;
        if (result.isError || !content?.mode) {
          setState({status: "error", message: textOf(result)});
          return;
        }
        if (content.mode === "list") setList(content);
        setState({status: "ready", result: content});
      };
      created.onhostcontextchanged = (changed) => setContext((previous) => ({...previous, ...changed}));

      // Les outils que la vue donne à l'assistant tant qu'elle est ouverte.
      // Leurs définitions ne bougent pas : un nom ou une description qui
      // change ferait redemander l'accord de l'utilisateur.
      created.registerTool("get_open_deck", {
        title: "Lire le deck ouvert",
        description: "Lire le deck affiché dans l'éditeur Joutes, avec les changements que l'utilisateur vient d'y faire : cartes par zone, légalité.",
        annotations: {readOnlyHint: true},
      }, async () => {
        const current = editor.current?.current();
        if (!current) return {content: [{type: "text", text: "Aucun deck n'est ouvert dans l'éditeur : l'utilisateur regarde la liste de ses decks."}]};
        return {content: [{type: "text", text: describeDeck({...current.deck, catalog: [...current.catalog.values()]})}]};
      });

      created.registerTool("edit_open_deck", {
        title: "Modifier le deck ouvert",
        description: "Ajouter ou retirer des cartes du deck affiché dans l'éditeur Joutes, par nom ; l'utilisateur voit le changement et peut l'annuler. Le deck est enregistré sur Joutes.",
        inputSchema: changesSchema,
      }, async (args) => {
        const handle = editor.current;
        const current = handle?.current();
        if (!handle || !current) {
          return {content: [{type: "text", text: "Aucun deck n'est ouvert dans l'éditeur. Ouvrez-en un avec open_deck_editor."}], isError: true};
        }
        await handle.flush();
        const fresh = handle.current()!;
        const result = await created.callServerTool({
          name: "update_deck_cards",
          arguments: {deckId: fresh.deck.id, changes: args.changes, expectedVersion: fresh.deck.version},
        });
        const content = result.structuredContent as DeckChangesResult | undefined;
        if (content?.deck) handle.applyChanges(content);
        return {content: [{type: "text", text: textOf(result) ?? "Deck modifié."}], ...(result.isError && {isError: true})};
      });
    },
  });

  useEffect(() => {
    const initial = app?.getHostContext();
    if (initial) setContext(initial);
  }, [app]);

  useEffect(() => {
    if (!context) return;
    if (context.theme) document.documentElement.classList.toggle("dark", context.theme === "dark");
    if (context.locale) setLocale(localeOf(context.locale));
  }, [context]);

  const openDeck = async (deckId: string) => {
    if (!app) return;
    setOpening(deckId);
    try {
      const result = await app.callServerTool({name: "get_deck", arguments: {deckId}});
      const content = result.structuredContent as DeckEditorResult | undefined;
      if (content?.mode === "deck") setState({status: "ready", result: content});
    } finally {
      setOpening(null);
    }
  };

  /** La liste reçue à l'ouverture, avec la taille et la légalité du deck qu'on quitte. */
  const backToList = (left: DeckEditorDeck) => {
    if (!list) return;
    const zones = zonesForDeck(left.zones, left.cards);
    const refreshed = {
      ...list,
      decks: list.decks.map((summary) => summary.id === left.id
        ? {...summary, size: deckSize(left.cards, zones), compliant: isDeckCompliant(left.cards, zones), updatedAt: new Date().toISOString()}
        : summary),
    };
    setList(refreshed);
    setState({status: "ready", result: refreshed});
  };

  // La liste n'a pas de deck ouvert : les outils de l'assistant le disent.
  useEffect(() => {
    if (state.status === "ready" && state.result.mode === "list") editor.current = null;
  }, [state]);

  const messages = useMemo(() => MESSAGES[locale], [locale]);
  const displayMode: McpUiDisplayMode = context?.displayMode ?? "inline";
  const canExpand = Boolean(context?.availableDisplayModes?.includes("fullscreen"));
  const canAsk = Boolean(app?.getHostCapabilities()?.message);

  return (
    <IntlProvider locale={locale} messages={messages} timeZone="Europe/Paris">
      <main className="p-4">
        <Body state={state} app={app} list={list} opening={opening} onOpen={openDeck}
              onBack={list ? backToList : undefined}
              displayMode={displayMode} canExpand={canExpand} canAsk={canAsk} editor={editor}/>
      </main>
    </IntlProvider>
  );
}

function Body({state, app, list, opening, onOpen, onBack, displayMode, canExpand, canAsk, editor}: {
  state: ViewState;
  app: App | null;
  list: Extract<DeckEditorResult, { mode: "list" }> | null;
  opening: string | null;
  onOpen: (deckId: string) => void;
  onBack?: (deck: DeckEditorDeck) => void;
  displayMode: McpUiDisplayMode;
  canExpand: boolean;
  canAsk: boolean;
  editor: React.RefObject<EditorHandle | null>;
}) {
  const t = useTranslations("McpDeckEditor");
  if (state.status === "waiting" || !app) return <p className="py-6 text-center text-sm text-muted-foreground">{t("waiting")}</p>;
  if (state.status === "error") return <p className="py-6 text-center text-sm text-muted-foreground">{state.message || t("error")}</p>;
  const {result} = state;
  if (result.mode === "list") {
    return <DeckList decks={result.decks} games={result.games} onOpen={onOpen} loading={opening}/>;
  }
  return (
    <Editor key={result.deck.id} app={app} initial={result.deck} displayMode={displayMode}
            canExpand={canExpand} canAsk={canAsk} handle={editor} onBack={list ? onBack : undefined}/>
  );
}

createRoot(document.getElementById("root")!).render(<DeckEditorApp/>);
