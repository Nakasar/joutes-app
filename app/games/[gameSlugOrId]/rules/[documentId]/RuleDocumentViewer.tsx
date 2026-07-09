'use client';

import { useMemo, useState, useEffect, useRef, useCallback, memo, Fragment, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Link2Icon, CheckIcon, ChevronDownIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import type {RuleTreeNode, RuleSection, SearchRuleEntry, RuleDocument, RuleLang} from '@/lib/rules/riftbound';

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// The API returns rule text with a small custom tag format, not HTML:
// {{rule id="107"}}Combat{{/rule}} for section links, {{keyword id="826"}}Backline{{/keyword}}
// for keyword-glossary mentions, {{match}}text{{/match}} for search-highlighted text.
// Parse it here so the frontend owns all styling instead of injecting server-authored HTML.
type MarkupNode =
  | { type: 'text'; text: string }
  | { type: 'rule'; id: string; children: MarkupNode[] }
  | { type: 'keyword'; id: string; children: MarkupNode[] }
  | { type: 'match'; children: MarkupNode[] };

const MARKUP_TAG_REGEX =
  /\{\{rule id="([^"]*)"\}\}|\{\{\/rule\}\}|\{\{keyword id="([^"]*)"\}\}|\{\{\/keyword\}\}|\{\{match\}\}|\{\{\/match\}\}/g;

function parseMarkup(markup: string): MarkupNode[] {
  const root: MarkupNode[] = [];
  const stack: { children: MarkupNode[] }[] = [{ children: root }];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushText = (raw: string) => {
    if (!raw) return;
    stack[stack.length - 1].children.push({ type: 'text', text: raw });
  };

  MARKUP_TAG_REGEX.lastIndex = 0;
  while ((match = MARKUP_TAG_REGEX.exec(markup)) !== null) {
    pushText(markup.slice(lastIndex, match.index));
    const token = match[0];

    if (token.startsWith('{{rule')) {
      const node: MarkupNode = { type: 'rule', id: match[1], children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (token.startsWith('{{keyword')) {
      const node: MarkupNode = { type: 'keyword', id: match[2], children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (token === '{{match}}') {
      const node: MarkupNode = { type: 'match', children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (stack.length > 1) {
      // {{/rule}}, {{/keyword}} or {{/match}}
      stack.pop();
    }

    lastIndex = match.index + token.length;
  }
  pushText(markup.slice(lastIndex));

  return root;
}

function renderMarkupNodes(nodes: MarkupNode[], keyPrefix: string): ReactNode {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    if (node.type === 'text') return <Fragment key={key}>{node.text}</Fragment>;
    if (node.type === 'rule') {
      return (
        <a
          key={key}
          href={`#rule-${node.id}`}
          data-rule-link={`rule-${node.id}`}
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          {renderMarkupNodes(node.children, key)}
        </a>
      );
    }
    if (node.type === 'keyword') {
      return (
        <KeywordBadge key={key} id={node.id} asLink>
          {renderMarkupNodes(node.children, key)}
        </KeywordBadge>
      );
    }
    return (
      <mark key={key} className="bg-yellow-200 dark:bg-yellow-700 text-foreground rounded-sm px-0.5">
        {renderMarkupNodes(node.children, key)}
      </mark>
    );
  });
}

function RuleMarkup({ markup, keyPrefix }: { markup: string; keyPrefix: string }) {
  const nodes = useMemo(() => parseMarkup(markup), [markup]);
  return <>{renderMarkupNodes(nodes, keyPrefix)}</>;
}

// Keyword glossary badges (e.g. "BACKLINE", "AMBUSH") — colored pill per keyword,
// matching the card's official keyword color coding. Keyed by rule id (stable
// across languages) rather than by name, so this also works when lang=fr and the
// displayed text is the translated keyword name, not the English one.
const KEYWORD_COLORS: Record<string, string> = {
  '805': '#226B5C', // Accelerate
  '806': '#226B5C', // Action
  '807': '#C22D6A', // Assault
  '808': '#8EAD2A', // Deathknell
  '809': '#8EAD2A', // Deflect
  '810': '#8EAD2A', // Ganking
  '811': '#226B5C', // Hidden
  '812': '#226B5C', // Legion
  '813': '#226B5C', // Reaction
  '814': '#C22D6A', // Shield
  '815': '#C22D6A', // Tank
  '816': '#8EAD2A', // Temporary
  '817': '#6D6C6D', // Vision
  '818': '#226B5C', // Equip
  '819': '#226B5C', // Quick-Draw
  '820': '#226B5C', // Repeat
  '821': '#6D6C6D', // Weaponmaster
  '822': '#226B5C', // Ambush
  '823': '#8EAD2A', // Hunt
  '824': '#8EAD2A', // Level
  '825': '#6D6C6D', // Unique
  '826': '#C22D6A', // Backline
};

// Fallback palette for keywords outside the official mapping above (e.g. Backline,
// Ambush) — deterministic by id so the same keyword always gets the same color.
const FALLBACK_PALETTE = [
  'bg-teal-100 text-teal-900 ring-teal-300 dark:bg-teal-900/50 dark:text-teal-100 dark:ring-teal-700',
  'bg-rose-100 text-rose-900 ring-rose-300 dark:bg-rose-900/50 dark:text-rose-100 dark:ring-rose-700',
  'bg-lime-100 text-lime-900 ring-lime-300 dark:bg-lime-900/50 dark:text-lime-100 dark:ring-lime-700',
  'bg-slate-200 text-slate-900 ring-slate-400 dark:bg-slate-700 dark:text-slate-100 dark:ring-slate-500',
  'bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-900/50 dark:text-amber-100 dark:ring-amber-700',
  'bg-violet-100 text-violet-900 ring-violet-300 dark:bg-violet-900/50 dark:text-violet-100 dark:ring-violet-700',
];

function fallbackPalette(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}

// Relative luminance (WCAG-ish) to pick readable white/dark text on a given bg color
function contrastTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 140 ? '#161616' : '#ffffff';
}

function KeywordBadge({
  id,
  children,
  size = 'inline',
  asLink = false,
}: {
  id: string;
  children: ReactNode;
  size?: 'heading' | 'inline';
  asLink?: boolean;
}) {
  const hex = KEYWORD_COLORS[id];
  const colorStyle = hex ? { backgroundColor: hex, color: contrastTextColor(hex) } : undefined;
  const colorClass = hex ? '' : fallbackPalette(id);
  const sizeClass = size === 'heading' ? 'text-sm px-2.5 py-0.5' : 'text-[0.7rem] px-1.5 py-px';

  const Tag = asLink ? 'a' : 'span';

  return (
    <Tag
      {...(asLink ? { href: `#rule-${id}`, 'data-rule-link': `rule-${id}` } : {})}
      className={`inline-block -skew-x-[12deg] border border-black/15 dark:border-white/15 ${colorClass}`}
      style={colorStyle}
    >
      <span className={`inline-block skew-x-[12deg] font-bold uppercase tracking-wide leading-[1.5] ${sizeClass}`}>
        {children}
      </span>
    </Tag>
  );
}

function CopyLinkButton({ anchorId }: { anchorId: string }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations('Games');

  const handleCopy = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}#${anchorId}`;
    window.history.pushState(null, '', `#${anchorId}`);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [anchorId]);

  return (
    <button
      onClick={handleCopy}
      aria-label={t('rules.viewer.copyLink')}
      title={t('rules.viewer.copyLink')}
      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0 mt-0.5 p-0.5 rounded text-muted-foreground hover:text-foreground"
    >
      {copied
        ? <CheckIcon size={13} className="text-green-500" />
        : <Link2Icon size={13} />}
    </button>
  );
}

const depthStyles: Record<number, string> = {
  1: '',
  2: 'ml-4 sm:ml-6',
  3: 'ml-8 sm:ml-12',
  4: 'ml-12 sm:ml-16',
  5: 'ml-14 sm:ml-20',
  6: 'ml-16 sm:ml-24',
};

const RuleNode = memo(function RuleNode({
  node,
  collapsedIds,
  onToggle,
  searchActive,
  resultsById,
  framedSectionIds,
}: {
  node: RuleTreeNode;
  collapsedIds: Set<string>;
  onToggle: (id: string) => void;
  searchActive: boolean;
  resultsById: Map<string, SearchRuleEntry>;
  framedSectionIds: Set<string>;
}) {
  const indent = depthStyles[node.depth] || 'ml-16';
  const t = useTranslations('Games');

  const markup = searchActive ? (resultsById.get(node.id)?.markup ?? node.markup) : node.markup;
  const isOpen = !collapsedIds.has(node.id);

  if (node.isTitle && node.depth === 1) {
    const isFramed = searchActive && framedSectionIds.has(node.id);
    const isDimmed = searchActive && !framedSectionIds.has(node.id);
    return (
      <div
        id={`rule-${node.id}`}
        className={`mt-6 scroll-mt-20 group ${indent} transition-opacity ${isDimmed ? 'opacity-40' : ''} ${
          isFramed ? 'ring-2 ring-primary/40 rounded-lg bg-accent/30 p-2 -m-2' : ''
        }`}
      >
        <h2 className="text-xl font-bold text-primary border-b border-border pb-1 mb-2 flex items-center gap-1">
          <button
            onClick={() => onToggle(node.id)}
            aria-label={isOpen ? t('rules.viewer.collapseSection') : t('rules.viewer.expandSection')}
            className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronDownIcon
              size={18}
              className={`transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
            />
          </button>
          <span className="text-muted-foreground text-base font-mono mr-1">{node.id}.</span>
          {node.isKeyword ? (
            <KeywordBadge id={node.id} size="heading">
              <RuleMarkup markup={markup} keyPrefix={`title-${node.id}`} />
            </KeywordBadge>
          ) : (
            <span><RuleMarkup markup={markup} keyPrefix={`title-${node.id}`} /></span>
          )}
          <CopyLinkButton anchorId={`rule-${node.id}`} />
        </h2>
        {isOpen && node.children.length > 0 && (
          <div className="space-y-1">
            {node.children.map(child => (
              <RuleNode
                key={child.id}
                node={child}
                collapsedIds={collapsedIds}
                onToggle={onToggle}
                searchActive={searchActive}
                resultsById={resultsById}
                framedSectionIds={framedSectionIds}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div id={`rule-${node.id}`} className={`scroll-mt-20 py-0.5 group ${indent}`}>
      <div className="flex gap-2 text-sm leading-relaxed">
        <span className="text-muted-foreground font-mono text-xs shrink-0 mt-0.5 min-w-14 text-right">
          {node.id}
        </span>
        <p className={`flex-1 ${node.depth === 1 ? 'font-semibold text-foreground' : 'text-foreground/90'}`}>
          <RuleMarkup markup={markup} keyPrefix={`rule-${node.id}`} />
        </p>
        <CopyLinkButton anchorId={`rule-${node.id}`} />
      </div>
      {node.children.length > 0 && (
        <div className="mt-0.5">
          {node.children.map(child => (
            <RuleNode
              key={child.id}
              node={child}
              collapsedIds={collapsedIds}
              onToggle={onToggle}
              searchActive={searchActive}
              resultsById={resultsById}
              framedSectionIds={framedSectionIds}
            />
          ))}
        </div>
      )}
    </div>
  );
});

function TableOfContents({
  sections,
  activeSection,
}: {
  sections: RuleSection[];
  activeSection: number | null;
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const t = useTranslations('Games');

  const toggle = (start: number) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(start) ? next.delete(start) : next.add(start);
      return next;
    });

  return (
    <nav className="text-sm space-y-0.5">
      <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2 px-2">
        {t('rules.viewer.tableOfContents')}
      </p>
      {sections.map(sec => {
        const titleNodes = sec.nodes.filter(n => n.isTitle && n.depth === 1);
        const subItems = titleNodes.filter(n => parseInt(n.id) !== sec.start);
        const isCollapsed = collapsed.has(sec.start);
        return (
          <div key={sec.start}>
            <div className={`flex items-center rounded transition-colors ${activeSection === sec.start ? 'bg-accent' : ''}`}>
              {subItems.length > 0 && (
                <button
                  onClick={() => toggle(sec.start)}
                  aria-label={isCollapsed ? t('rules.viewer.expand') : t('rules.viewer.collapse')}
                  className="p-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronDownIcon
                    size={13}
                    className={`transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                  />
                </button>
              )}
              <a
                href={`#${sec.anchorId}`}
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState(null, '', `#${sec.anchorId}`);
                  document.getElementById(sec.anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`flex-1 px-2 py-1 rounded hover:bg-accent hover:text-accent-foreground transition-colors font-medium ${
                  subItems.length === 0 ? 'ml-0' : ''
                } ${activeSection === sec.start ? 'text-accent-foreground' : 'text-foreground'}`}
              >
                {sec.start > 0 ? `${sec.start}–` : ''} {sec.label}
              </a>
            </div>
            {!isCollapsed && subItems.length > 0 && (
              <div className="ml-6 space-y-0.5">
                {subItems.map(n => (
                  <a
                    key={n.id}
                    href={`#rule-${n.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      window.history.pushState(null, '', `#rule-${n.id}`);
                      document.getElementById(`rule-${n.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="block px-2 py-0.5 rounded hover:bg-accent hover:text-foreground transition-colors text-muted-foreground text-xs"
                  >
                    <span className="font-mono mr-1">{n.id}</span>{n.content}
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function RuleDocumentViewer({ sections, lang, document: ruleDocument, gameSlug }: {
  sections: RuleSection[];
  lang: RuleLang;
  document: RuleDocument;
  gameSlug: string;
}) {
  const searchParams = useSearchParams();
  const { replace } = useRouter();
  const pathname = usePathname()

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);
  const [searchResults, setSearchResults] = useState<SearchRuleEntry[] | null>(null);
  const [activeSection, setActiveSection] = useState<number | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const mainRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const t = useTranslations('Games');

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Intersection observer to track active section
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            const match = id.match(/^rule-(\d{3})$/);
            if (match) {
              const num = parseInt(match[1]);
              setActiveSection(Math.floor(num / 100) * 100);
            }
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    sections.forEach(sec => {
      const el = document.getElementById(sec.anchorId);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sections]);

  // Delegated click handler for server-generated glossary/title links
  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-rule-link]');
      if (!target) return;
      const targetId = target.getAttribute('data-rule-link');
      if (!targetId) return;
      e.preventDefault();
      window.history.pushState(null, '', `#${targetId}`);
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, []);

  // Server-side search: fetch matching entries + their surrounding context
  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();

    const params = new URLSearchParams({ document: ruleDocument, lang, searchQuery: debouncedQuery });
    fetch(`/api/games/${gameSlug}/rules?${params.toString()}`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : [])
      .then((results: SearchRuleEntry[]) => {
        if (requestId !== requestIdRef.current) return;
        setSearchResults(results);

        const sectionIds = new Set(results.map(r => r.sectionId));
        if (sectionIds.size > 0) {
          setCollapsedIds(prev => {
            const next = new Set(prev);
            sectionIds.forEach(id => next.delete(id));
            return next;
          });
        }

        const firstMatchId = results.find(r => r.matched)?.id;
        if (firstMatchId) {
          requestAnimationFrame(() => {
            document.getElementById(`rule-${firstMatchId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError' && requestId === requestIdRef.current) setSearchResults([]);
      });

    return () => controller.abort();
  }, [debouncedQuery, ruleDocument, lang, gameSlug]);

  const searchActive = searchResults !== null;
  const resultsById = useMemo(
    () => new Map((searchResults ?? []).map(r => [r.id, r])),
    [searchResults]
  );
  const framedSectionIds = useMemo(
    () => new Set((searchResults ?? []).map(r => r.sectionId)),
    [searchResults]
  );
  const totalMatches = useMemo(
    () => (searchResults ?? []).filter(r => r.matched).length,
    [searchResults]
  );

  return (
    <div className="flex gap-6 relative">
      {/* Sidebar TOC - Desktop */}
      <aside className="hidden lg:block w-64 shrink-0">
        <div className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 scrollbar-thin">
          <TableOfContents sections={sections} activeSection={activeSection} />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Search + Mobile TOC toggle */}
        <div className="flex gap-2 mb-4 sticky top-0 z-10 bg-background pt-1 pb-2 border-b border-border">
          <Input
            type="search"
            placeholder={t('rules.viewer.searchPlaceholder')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          <Select value={lang} onValueChange={(v: string) => {
            const params = new URLSearchParams(searchParams);
            params.set('lang', v);
            replace(`${pathname}?${params.toString()}`);
          }}>
            <SelectTrigger className="flex-0">
              <SelectValue placeholder="Langue" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">
                🇬🇧 English
              </SelectItem>
              <SelectItem value="fr">
                🇫🇷 Français
              </SelectItem>
            </SelectContent>
          </Select>
          <button
            className="lg:hidden px-3 py-2 rounded-md border border-border text-sm hover:bg-accent transition-colors"
            onClick={() => setTocOpen(v => !v)}
          >
            {tocOpen ? t('rules.viewer.close') : t('rules.viewer.openTableOfContents')}
          </button>
        </div>

        {/* Mobile TOC */}
        {tocOpen && (
          <div className="lg:hidden bg-card border border-border rounded-lg p-4 mb-4 max-h-80 overflow-y-auto">
            <TableOfContents sections={sections} activeSection={activeSection} />
          </div>
        )}

        {debouncedQuery && (
          <p className="text-sm text-muted-foreground mb-3">
            {t('rules.viewer.results', { count: totalMatches, query: debouncedQuery })}
          </p>
        )}

        <div ref={mainRef} className="space-y-1">
          {sections.map(sec => (
            <div key={sec.start} className="mb-6">
              {sec.nodes.map(node => (
                <RuleNode
                  key={node.id}
                  node={node}
                  collapsedIds={collapsedIds}
                  onToggle={toggleCollapsed}
                  searchActive={searchActive}
                  resultsById={resultsById}
                  framedSectionIds={framedSectionIds}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
