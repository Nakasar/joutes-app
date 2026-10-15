import {useEffect, useMemo, useState} from "react";
import {createRoot} from "react-dom/client";
import {IntlProvider, useTranslations} from "use-intl";
import {useApp} from "@modelcontextprotocol/ext-apps/react";
import type {App, McpUiHostContext} from "@modelcontextprotocol/ext-apps";
import {XIcon} from "lucide-react";
import {
  ConstructionRules,
  DeckCardDetails,
  DeckCardTile,
  DeckSection,
  type DeckViewCard,
  type DeckViewList,
  hasCardDetails,
  UnrecognizedCards,
} from "@/components/decks/DeckCheckView.tsx";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import de from "@/messages/de.json";
import it from "@/messages/it.json";
import type {DeckCheckResult} from "./result.ts";

/*
  Vue MCP App de l'outil `check_deck` : le client de l'utilisateur (Claude,
  ChatGPT…) l'affiche dans un cadre isolé sous l'appel d'outil, et lui transmet
  le résultat. Elle reprend l'affichage de la page du vérificateur de deck ; le
  détail d'une carte s'y ouvre sous sa section plutôt qu'en fenêtre, une
  fenêtre centrée dans un cadre aussi haut que le deck tombant souvent hors de
  l'écran.
*/

// Seule la partie du vérificateur part dans la vue, pas tout le dictionnaire.
const MESSAGES = {
  fr: {Games: {DeckChecker: fr.Games.DeckChecker}},
  en: {Games: {DeckChecker: en.Games.DeckChecker}},
  de: {Games: {DeckChecker: de.Games.DeckChecker}},
  it: {Games: {DeckChecker: it.Games.DeckChecker}},
};
type Locale = keyof typeof MESSAGES;

function localeOf(hostLocale?: string): Locale {
  const language = (hostLocale ?? navigator.language ?? "").slice(0, 2).toLowerCase();
  return language in MESSAGES ? language as Locale : "en";
}

type SectionKey = keyof DeckViewList;
type Selection = { section: SectionKey; index: number };

type ViewState =
  | { status: "waiting" }
  | { status: "error"; message?: string }
  | { status: "ready"; result: DeckCheckResult };

// ── Résumé ────────────────────────────────────────────────────────────────────
function deckIssues(deck: DeckViewList) {
  const all = Object.values(deck).flat();
  const total = (cards: DeckViewCard[]) => cards.reduce((sum, c) => sum + c.quantity, 0);
  const invalidSections = (Object.keys(ConstructionRules) as (keyof typeof ConstructionRules)[])
    .filter((section) => {
      const count = total(deck[section]);
      return count < ConstructionRules[section].min || count > ConstructionRules[section].max;
    }).length;
  return {
    unrecognized: all.filter((c) => !c.recognized),
    banned: all.filter((c) => c.banned).length,
    invalidSections,
    withNotes: all.filter((c) => (c.erratas?.length ?? 0) > 0).length,
  };
}

function Summary({result, app}: { result: DeckCheckResult; app: App | null }) {
  const t = useTranslations('Games.DeckChecker.mcp');
  const [copied, setCopied] = useState(false);
  const issues = deckIssues(result.deck);
  const problems = [
    issues.unrecognized.length > 0 && t('unrecognized', {count: issues.unrecognized.length}),
    issues.banned > 0 && t('banned', {count: issues.banned}),
    issues.invalidSections > 0 && t('invalidSections', {count: issues.invalidSections}),
  ].filter(Boolean) as string[];

  async function copyCode() {
    if (!result.code) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Le presse-papiers peut être refusé au cadre : le code reste lisible
      // dans la réponse du modèle.
    }
  }

  return (
    <div className="mb-6 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl font-semibold mr-auto">{t('title')}</h1>
        {result.code && (
          <button
            onClick={copyCode}
            className="shrink-0 whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            {copied ? t('copied') : t('copyCode')}
          </button>
        )}
        <button
          onClick={() => app?.openLink({url: result.url})}
          className="shrink-0 whitespace-nowrap rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          {t('openOnJoutes')}
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-sm">
        {problems.length === 0 ? (
          <span className="rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-2.5 py-0.5 font-medium">
            ✓ {t('noIssues')}
          </span>
        ) : problems.map((problem) => (
          <span key={problem} className="rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 px-2.5 py-0.5 font-medium">
            {problem}
          </span>
        ))}
        {issues.withNotes > 0 && (
          <span className="rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 px-2.5 py-0.5 font-medium">
            {t('notes', {count: issues.withNotes})}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
    </div>
  );
}

// ── Détail d'une carte ────────────────────────────────────────────────────────
function CardPanel({card, onClose}: { card: DeckViewCard; onClose: () => void }) {
  const t = useTranslations('Games.DeckChecker');
  return (
    <div className="mt-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-2 mb-2">
        <h3 className="flex items-center gap-2 flex-wrap text-lg font-semibold mr-auto">
          {card.name}
          {card.banned && (
            <span className="text-[11px] font-bold bg-red-600 text-white rounded px-2 py-0.5 uppercase tracking-widest">
              {t('cards.banned')}
            </span>
          )}
        </h3>
        <button onClick={onClose} className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={t('mcp.close')}>
          <XIcon size={16} />
        </button>
      </div>
      <DeckCardDetails card={card} imageClassName="w-28 sm:w-40" />
    </div>
  );
}

// ── Deck ──────────────────────────────────────────────────────────────────────
function DeckView({result, app}: { result: DeckCheckResult; app: App | null }) {
  const t = useTranslations('Games.DeckChecker');
  const [selected, setSelected] = useState<Selection | null>(null);
  const deck = result.deck;

  const selectedCard = selected ? deck[selected.section][selected.index] : null;
  const panel = selectedCard && <CardPanel card={selectedCard} onClose={() => setSelected(null)} />;

  const renderCard = (section: SectionKey) => (card: DeckViewCard, index: number) => {
    const isSelected = selected?.section === section && selected.index === index;
    if (!hasCardDetails(card)) return <DeckCardTile key={`${card.name}-${index}`} card={card} />;
    return (
      <DeckCardTile
        key={`${card.name}-${index}`}
        card={card}
        selected={isSelected}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        onClick={() => setSelected(isSelected ? null : {section, index})}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelected(isSelected ? null : {section, index});
          }
        }}
      />
    );
  };

  const topSections: SectionKey[] = ["legends", "champions", "battlefields", "runes"];
  const panelIn = (sections: SectionKey[]) => selected && sections.includes(selected.section) ? panel : null;
  const allCards = Object.values(deck).flat();

  return (
    <>
      <Summary result={result} app={app} />
      <div className="space-y-8">
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <DeckSection title={t('sections.legend')} cards={deck.legends} compact rules={ConstructionRules.legends} renderCard={renderCard("legends")} />
            <DeckSection title={t('sections.champion')} cards={deck.champions} compact rules={ConstructionRules.champions} renderCard={renderCard("champions")} />
            <DeckSection title={t('sections.battlefields')} cards={deck.battlefields} compact renderCard={renderCard("battlefields")} />
            <DeckSection title={t('sections.runes')} cards={deck.runes} compact rules={ConstructionRules.runes} renderCard={renderCard("runes")} />
          </div>
          {panelIn(topSections)}
        </div>
        <DeckSection title={t('sections.mainDeck')} cards={deck.maindeck} rules={ConstructionRules.maindeck} renderCard={renderCard("maindeck")} footer={panelIn(["maindeck"])} />
        <DeckSection title={t('sections.sideboard')} cards={deck.sideboard} rules={ConstructionRules.sideboard} renderCard={renderCard("sideboard")} footer={panelIn(["sideboard"])} />
        <UnrecognizedCards cards={allCards.filter((c) => !c.recognized)} />
      </div>
    </>
  );
}

function Status({children}: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function View({state, app}: { state: ViewState; app: App | null }) {
  const t = useTranslations('Games.DeckChecker.mcp');
  if (state.status === "waiting") return <Status>{t('waiting')}</Status>;
  if (state.status === "error") return <Status>{state.message || t('error')}</Status>;
  return <DeckView result={state.result} app={app} />;
}

// ── Liaison avec le client ────────────────────────────────────────────────────
function applyHostContext(context: McpUiHostContext | undefined, setLocale: (locale: Locale) => void) {
  if (!context) return;
  if (context.theme) document.documentElement.classList.toggle("dark", context.theme === "dark");
  if (context.locale) setLocale(localeOf(context.locale));
}

function DeckCheckApp() {
  const [state, setState] = useState<ViewState>({status: "waiting"});
  const [locale, setLocale] = useState<Locale>(() => localeOf());

  const {app} = useApp({
    appInfo: {name: "Joutes — vérificateur de deck", version: "1.0.0"},
    capabilities: {},
    onAppCreated: (created) => {
      created.ontoolinput = () => setState({status: "waiting"});
      created.ontoolresult = (result) => {
        const content = result.structuredContent as DeckCheckResult | undefined;
        if (result.isError || !content?.deck) {
          const text = result.content?.find((c) => c.type === "text");
          setState({status: "error", message: text && "text" in text ? text.text : undefined});
          return;
        }
        setState({status: "ready", result: content});
      };
      created.onhostcontextchanged = (context) => applyHostContext(context, setLocale);
    },
  });

  useEffect(() => {
    applyHostContext(app?.getHostContext(), setLocale);
  }, [app]);

  // Un lien ouvert depuis le cadre isolé ne mène nulle part : c'est au client
  // de l'ouvrir (source d'un errata, notamment).
  useEffect(() => {
    if (!app) return;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || !/^https?:/.test(link.href)) return;
      event.preventDefault();
      app.openLink({url: link.href});
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [app]);

  const messages = useMemo(() => MESSAGES[locale], [locale]);

  return (
    <IntlProvider locale={locale} messages={messages} timeZone="Europe/Paris">
      <main className="p-4">
        <View state={state} app={app} />
      </main>
    </IntlProvider>
  );
}

createRoot(document.getElementById("root")!).render(<DeckCheckApp />);
