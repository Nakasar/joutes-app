import cr from '@/data/riftbound/cr.json';
import tr from '@/data/riftbound/tr.json';
import fr_cr from '@/data/riftbound/fr/cr.json';
import fr_tr from '@/data/riftbound/fr/tr.json';

export type RuleDocument = 'TR' | 'CR';
export type RuleLang = 'en' | 'fr';

export interface RuleEntry {
  id: string;
  content: string;
}

export interface HyperlinkedRuleEntry extends RuleEntry {
  /**
   * `content` with section-title mentions wrapped in `{{rule id="..."}}...{{/rule}}`,
   * keyword-glossary mentions wrapped in `{{keyword id="..."}}...{{/keyword}}`, and
   * (for search results) matched text wrapped in `{{match}}...{{/match}}`.
   * This is a small custom tag format, not HTML — render it by parsing, not by
   * injecting into the DOM, so the frontend owns the styling of links/highlights.
   */
  markup: string;
  isTitle: boolean;
  /** True for entries in the CR's "Keyword Glossary" section (e.g. "Backline", "Ambush") */
  isKeyword: boolean;
  depth: number;
  document: RuleDocument;
}

export interface SearchRuleEntry extends HyperlinkedRuleEntry {
  sectionId: string;
  matched: boolean;
}

export interface RuleTreeNode extends HyperlinkedRuleEntry {
  children: RuleTreeNode[];
}

export interface RuleSection {
  label: string;
  start: number;
  anchorId: string;
  nodes: RuleTreeNode[];
}

export function getRawEntries(document: RuleDocument, lang: RuleLang): RuleEntry[] {
  if (document === 'TR') return lang === 'fr' ? fr_tr : tr;
  return lang === 'fr' ? fr_cr : cr;
}

export function isTitle(entry: RuleEntry): boolean {
  return /^\d{3}$/.test(entry.id) && entry.content.length <= 60;
}

// Id of the CR's "Keyword Glossary" header — every title entry after it (805, 806, ...)
// is an individual keyword (Backline, Ambush, ...), not a regular section heading.
// Ids are stable across languages, so this works regardless of `lang`.
const KEYWORD_GLOSSARY_HEADER_ID = 804;

export function isKeywordEntry(entry: RuleEntry, document: RuleDocument): boolean {
  return document === 'CR' && isTitle(entry) && parseInt(entry.id, 10) > KEYWORD_GLOSSARY_HEADER_ID;
}

export interface KeywordEntry {
  id: string;
  name: string;
}

// All keyword-glossary entries (e.g. "Deathknell", "Backline") across every
// supported language, deduplicated by id+name. Used to auto-detect keyword
// mentions in free text (like errata details) that isn't part of the rules
// corpus itself, regardless of which language it was authored in.
export function getAllKeywordEntries(): KeywordEntry[] {
  const langs: RuleLang[] = ['en', 'fr'];
  const seen = new Set<string>();
  const result: KeywordEntry[] = [];

  for (const lang of langs) {
    for (const entry of getRawEntries('CR', lang)) {
      if (!isKeywordEntry(entry, 'CR')) continue;
      const key = `${entry.id}:${entry.content.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ id: entry.id, name: entry.content });
    }
  }

  return result;
}

function getDepth(id: string): number {
  return id.split('.').length;
}

interface TitleTarget {
  id: string;
  isKeyword: boolean;
}

interface TitleData {
  map: Map<string, TitleTarget>;
  regexSource: string;
}

function buildTitleData(entries: RuleEntry[], document: RuleDocument): TitleData {
  const map = new Map<string, TitleTarget>();
  for (const entry of entries) {
    if (isTitle(entry)) {
      map.set(entry.content, { id: entry.id, isKeyword: isKeywordEntry(entry, document) });
    }
  }
  const sortedTitles = [...map.keys()].sort((a, b) => b.length - a.length);
  const escaped = sortedTitles.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regexSource = escaped.length > 0 ? `(${escaped.join('|')})` : '';
  return { map, regexSource };
}

// A text run, or a glossary/title/keyword link wrapping a run
type Token =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; targetId: string; isKeyword: boolean };

function tokenizeWithLinks(text: string, titleData: TitleData, currentId: string): Token[] {
  if (!titleData.regexSource) return [{ type: 'text', text }];

  const regex = new RegExp(titleData.regexSource, 'g');
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const matchedTitle = match[1];
    const target = titleData.map.get(matchedTitle);

    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    if (target && target.id !== currentId) {
      tokens.push({ type: 'link', text: matchedTitle, targetId: target.id, isKeyword: target.isKeyword });
    } else {
      tokens.push({ type: 'text', text: matchedTitle });
    }

    lastIndex = match.index + matchedTitle.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', text }];
}

// Wrap occurrences of `query` inside a plain text run with {{match}}, case-insensitive
function markQueryInMarkup(text: string, query: string): string {
  if (!query) return text;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(`{{match}}${match[1]}{{/match}}`);
    lastIndex = match.index + match[1].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.join('');
}

function serializeTokens(tokens: Token[], query: string | undefined): string {
  return tokens
    .map(token => {
      const inner = query ? markQueryInMarkup(token.text, query) : token.text;
      if (token.type === 'link') {
        const tag = token.isKeyword ? 'keyword' : 'rule';
        return `{{${tag} id="${token.targetId}"}}${inner}{{/${tag}}}`;
      }
      return inner;
    })
    .join('');
}

function buildMarkup(text: string, titleData: TitleData, currentId: string, query?: string): string {
  const tokens = tokenizeWithLinks(text, titleData, currentId);
  return serializeTokens(tokens, query);
}

const hyperlinkedCache = new Map<string, HyperlinkedRuleEntry[]>();

export function getHyperlinkedEntries(document: RuleDocument, lang: RuleLang): HyperlinkedRuleEntry[] {
  const cacheKey = `${document}-${lang}`;
  const cached = hyperlinkedCache.get(cacheKey);
  if (cached) return cached;

  const entries = getRawEntries(document, lang);
  const titleData = buildTitleData(entries, document);

  const result = entries.map(entry => ({
    id: entry.id,
    content: entry.content,
    markup: buildMarkup(entry.content, titleData, entry.id),
    isTitle: isTitle(entry),
    isKeyword: isKeywordEntry(entry, document),
    depth: getDepth(entry.id),
    document,
  }));

  hyperlinkedCache.set(cacheKey, result);
  return result;
}

export function buildRuleTree(entries: HyperlinkedRuleEntry[]): RuleTreeNode[] {
  const nodeMap = new Map<string, RuleTreeNode>();
  const roots: RuleTreeNode[] = [];

  for (const entry of entries) {
    const node: RuleTreeNode = { ...entry, children: [] };
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
        roots.push(node);
      }
    }
  }

  return roots;
}

export function getRuleSections(roots: RuleTreeNode[]): RuleSection[] {
  const sections = new Map<number, RuleSection>();

  for (const node of roots) {
    const num = parseInt(node.id);
    const hundred = Math.floor(num / 100) * 100;
    if (!sections.has(hundred)) {
      sections.set(hundred, { label: '', start: hundred, anchorId: '', nodes: [] });
    }
    sections.get(hundred)!.nodes.push(node);
  }

  for (const [hundred, sec] of sections) {
    const exactTitle = sec.nodes.find(n => parseInt(n.id) === hundred && n.isTitle);
    const firstTitle = sec.nodes.find(n => n.isTitle);
    const titleNode = exactTitle || firstTitle || sec.nodes[0];
    sec.label = titleNode.content;
    sec.anchorId = `rule-${titleNode.id.padStart(3, '0')}`;
  }

  return [...sections.values()].sort((a, b) => a.start - b.start);
}

// Nearest ancestor id that is itself a title (section/glossary heading), walking up the dotted id
function findSectionId(entryId: string, entriesById: Map<string, HyperlinkedRuleEntry>): string {
  let currentId = entryId;
  while (true) {
    const parts = currentId.split('.');
    if (parts.length === 1) return currentId;
    const parentId = parts.slice(0, -1).join('.');
    const parent = entriesById.get(parentId);
    if (!parent) return parentId;
    if (parent.isTitle) return parentId;
    currentId = parentId;
  }
}

export interface SearchRuleEntriesParams {
  document?: RuleDocument;
  lang: RuleLang;
  query: string;
  limit?: number;
}

export function searchRuleEntries({ document, lang, query, limit = 30 }: SearchRuleEntriesParams): SearchRuleEntry[] {
  const documents: RuleDocument[] = document ? [document] : ['TR', 'CR'];
  const lowerQuery = query.toLowerCase();
  const results: SearchRuleEntry[] = [];

  for (const doc of documents) {
    const entries = getHyperlinkedEntries(doc, lang);
    const entriesById = new Map(entries.map(e => [e.id, e]));
    const titleData = buildTitleData(getRawEntries(doc, lang), doc);

    const matchedIds = entries
      .filter(e => e.id.includes(query) || e.content.toLowerCase().includes(lowerQuery))
      .map(e => e.id)
      .slice(0, limit);

    if (matchedIds.length === 0) continue;

    const matchedIdSet = new Set(matchedIds);
    const sectionIds = new Set<string>();
    for (const id of matchedIds) {
      sectionIds.add(findSectionId(id, entriesById));
    }

    const includedIds = new Set<string>();
    for (const sectionId of sectionIds) {
      for (const entry of entries) {
        if (entry.id === sectionId || entry.id.startsWith(sectionId + '.')) {
          includedIds.add(entry.id);
        }
      }
    }

    for (const entry of entries) {
      if (!includedIds.has(entry.id)) continue;
      const matched = matchedIdSet.has(entry.id);
      results.push({
        ...entry,
        markup: matched ? buildMarkup(entry.content, titleData, entry.id, query) : entry.markup,
        sectionId: findSectionId(entry.id, entriesById),
        matched,
      });
    }
  }

  return results;
}
