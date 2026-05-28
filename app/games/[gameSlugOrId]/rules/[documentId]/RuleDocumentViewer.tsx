'use client';

import { useMemo, useState, useEffect, useRef, useCallback, memo } from 'react';
import { Input } from '@/components/ui/input';
import { Link2Icon, CheckIcon, ChevronDownIcon } from 'lucide-react';

export interface TREntry {
  id: string;
  content: string;
}

interface TRNode extends TREntry {
  children: TRNode[];
  depth: number;
  isTitle: boolean;
}

// Determine depth from an ID string
function getDepth(id: string): number {
  return id.split('.').length;
}

// Determine if an entry is a "title" (section header)
function isTitle(entry: TREntry): boolean {
  return /^\d{3}$/.test(entry.id) && entry.content.length <= 60;
}

// Build a hierarchical tree from flat entries
function buildTree(entries: TREntry[]): TRNode[] {
  const nodeMap = new Map<string, TRNode>();
  const roots: TRNode[] = [];

  for (const entry of entries) {
    const node: TRNode = {
      ...entry,
      children: [],
      depth: getDepth(entry.id),
      isTitle: isTitle(entry),
    };
    nodeMap.set(entry.id, node);

    const parts = entry.id.split('.');
    if (parts.length === 1) {
      roots.push(node);
    } else {
      const parentId = parts.slice(0, -1).join('.');
      const parent = nodeMap.get(parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        // Parent not found, add as root
        roots.push(node);
      }
    }
  }

  return roots;
}

// Group top-level rules into major sections (by hundreds)
function getSections(roots: TRNode[]): { label: string; start: number; anchorId: string; nodes: TRNode[] }[] {
  const sections: Map<number, { label: string; start: number; anchorId: string; nodes: TRNode[] }> = new Map();

  for (const node of roots) {
    const num = parseInt(node.id);
    const hundred = Math.floor(num / 100) * 100;
    if (!sections.has(hundred)) {
      sections.set(hundred, {
        label: '',
        start: hundred,
        anchorId: '',
        nodes: [],
      });
    }
    sections.get(hundred)!.nodes.push(node);
  }

  // Resolve labels and anchor IDs
  for (const [hundred, sec] of sections) {
    const exactTitle = sec.nodes.find(n => parseInt(n.id) === hundred && n.isTitle);
    const firstTitle = sec.nodes.find(n => n.isTitle);
    const titleNode = exactTitle || firstTitle || sec.nodes[0];
    sec.label = titleNode.content;
    sec.anchorId = `rule-${titleNode.id.padStart(3, '0')}`;
  }

  return [...sections.values()].sort((a, b) => a.start - b.start);
}

// Pre-built title data: map + compiled regex (built once, not per render)
interface TitleData {
  map: Map<string, string>;
  regexSource: string; // stored as source so each call creates a stateless instance
}

function buildTitleData(entries: TREntry[]): TitleData {
  const map = new Map<string, string>();
  for (const entry of entries) {
    if (isTitle(entry)) {
      map.set(entry.content, `rule-${entry.id}`);
    }
  }
  const sortedTitles = [...map.keys()].sort((a, b) => b.length - a.length);
  const escaped = sortedTitles.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regexSource = `(${escaped.join('|')})`;
  return { map, regexSource };
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// Highlight search term occurrences in a plain string (case-insensitive)
function highlightText(text: string, query: string): React.ReactNode[] {
  if (!query) return [text];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <mark key={`hl-${match.index}`} className="bg-yellow-200 dark:bg-yellow-700 text-foreground rounded-sm px-0.5">
        {match[1]}
      </mark>
    );
    last = match.index + match[1].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : [text];
}

// Replace title occurrences in text with hyperlinks, respecting case,
// then highlight search query within the produced text nodes
function renderTextWithLinks(
  text: string,
  titleData: TitleData,
  currentId: string,
  searchQuery: string = '',
): React.ReactNode[] {
  if (!titleData.regexSource) return highlightText(text, searchQuery);

  // Create a fresh regex instance (RegExp is stateful via lastIndex)
  const regex = new RegExp(titleData.regexSource, 'g');
  const { map: titleMap } = titleData;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  regex.lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    const matchedTitle = match[1];
    const targetId = titleMap.get(matchedTitle);

    if (match.index > lastIndex) {
      const raw = text.slice(lastIndex, match.index);
      parts.push(...highlightText(raw, searchQuery));
    }

    if (targetId && targetId !== `rule-${currentId}`) {
      // Highlight inside the link text if it matches the search query
      const linkContent = searchQuery
        ? highlightText(matchedTitle, searchQuery)
        : [matchedTitle];
      parts.push(
        <a
          key={`${currentId}-link-${match.index}`}
          href={`#${targetId}`}
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          onClick={(e) => {
            e.preventDefault();
            window.history.pushState(null, '', `#${targetId}`);
            document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          {linkContent}
        </a>
      );
    } else {
      parts.push(...highlightText(matchedTitle, searchQuery));
    }

    lastIndex = match.index + matchedTitle.length;
  }

  if (lastIndex < text.length) {
    parts.push(...highlightText(text.slice(lastIndex), searchQuery));
  }

  return parts.length > 0 ? parts : highlightText(text, searchQuery);
}

function CopyLinkButton({ anchorId }: { anchorId: string }) {
  const [copied, setCopied] = useState(false);

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
      aria-label="Copier le lien"
      title="Copier le lien"
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
  titleData,
  searchQuery,
}: {
  node: TRNode;
  titleData: TitleData;
  searchQuery: string;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const contentNodes = renderTextWithLinks(node.content, titleData, node.id, searchQuery);
  const indent = depthStyles[node.depth] || 'ml-16';

  // Auto-expand when a search is active so matches are always visible
  const effectivelyOpen = searchQuery ? true : isOpen;

  const isVisible =
    !searchQuery ||
    node.id.includes(searchQuery) ||
    node.content.toLowerCase().includes(searchQuery.toLowerCase());

  const hasMatchingChild = (n: TRNode): boolean => {
    if (!searchQuery) return true;
    if (n.id.includes(searchQuery) || n.content.toLowerCase().includes(searchQuery.toLowerCase())) return true;
    return n.children.some(hasMatchingChild);
  };

  if (searchQuery && !hasMatchingChild(node)) return null;

  if (node.isTitle && node.depth === 1) {
    return (
      <div id={`rule-${node.id}`} className={`mt-6 scroll-mt-20 group ${indent}`}>
        <h2 className="text-xl font-bold text-primary border-b border-border pb-1 mb-2 flex items-center gap-1">
          <button
            onClick={() => setIsOpen(v => !v)}
            aria-label={isOpen ? 'Réduire la section' : 'Développer la section'}
            className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronDownIcon
              size={18}
              className={`transition-transform duration-200 ${effectivelyOpen ? '' : '-rotate-90'}`}
            />
          </button>
          <span className="text-muted-foreground text-base font-mono mr-1">{node.id}.</span>
          {node.content}
          <CopyLinkButton anchorId={`rule-${node.id}`} />
        </h2>
        {effectivelyOpen && node.children.length > 0 && (
          <div className="space-y-1">
            {node.children.map(child => (
              <RuleNode key={child.id} node={child} titleData={titleData} searchQuery={searchQuery} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      id={`rule-${node.id}`}
      className={`scroll-mt-20 py-0.5 group ${indent} ${!isVisible && searchQuery ? 'opacity-30' : ''}`}
    >
      <div className="flex gap-2 text-sm leading-relaxed">
        <span className="text-muted-foreground font-mono text-xs shrink-0 mt-0.5 min-w-14 text-right">
          {node.id}
        </span>
        <p className={`flex-1 ${node.depth === 1 ? 'font-semibold text-foreground' : 'text-foreground/90'}`}>
          {contentNodes}
        </p>
        <CopyLinkButton anchorId={`rule-${node.id}`} />
      </div>
      {node.children.length > 0 && (
        <div className="mt-0.5">
          {node.children.map(child => (
            <RuleNode key={child.id} node={child} titleData={titleData} searchQuery={searchQuery} />
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
  sections: { label: string; start: number; anchorId: string; nodes: TRNode[] }[];
  activeSection: number | null;
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const toggle = (start: number) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(start) ? next.delete(start) : next.add(start);
      return next;
    });

  return (
    <nav className="text-sm space-y-0.5">
      <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2 px-2">
        Table des matières
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
                  aria-label={isCollapsed ? 'Développer' : 'Réduire'}
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

export default function RuleDocumentViewer({ entries }: { entries: TREntry[] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);
  const [activeSection, setActiveSection] = useState<number | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => buildTree(entries), [entries]);
  const sections = useMemo(() => getSections(tree), [tree]);
  const titleData = useMemo(() => buildTitleData(entries), [entries]);

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

    // Observe all section anchors
    sections.forEach(sec => {
      const el = document.getElementById(sec.anchorId);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sections]);

  const totalMatches = useMemo(() => {
    if (!debouncedQuery) return null;
    return entries.filter(
      e =>
        e.id.includes(debouncedQuery) ||
        e.content.toLowerCase().includes(debouncedQuery.toLowerCase())
    ).length;
  }, [debouncedQuery, entries]);

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
            placeholder="Rechercher une règle (texte ou numéro)…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          <button
            className="lg:hidden px-3 py-2 rounded-md border border-border text-sm hover:bg-accent transition-colors"
            onClick={() => setTocOpen(v => !v)}
          >
            {tocOpen ? '✕ Fermer' : '☰ Sommaire'}
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
            {totalMatches} résultat{totalMatches !== 1 ? 's' : ''} pour &laquo;{debouncedQuery}&raquo;
          </p>
        )}

        <div ref={mainRef} className="space-y-1">
          {sections.map(sec => (
            <div key={sec.start} className="mb-6">
              {sec.nodes.map(node => (
                <RuleNode
                  key={node.id}
                  node={node}
                  titleData={titleData}
                  searchQuery={debouncedQuery}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
