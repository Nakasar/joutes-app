import type { ReactNode } from 'react';

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
  '436': '#6D6C6D', // Predict
};

// Fallback palette for keywords outside the official mapping above.
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

export function KeywordBadge({
  id,
  children,
  size = 'inline',
  asLink = false,
  href,
}: {
  id: string;
  children: ReactNode;
  size?: 'heading' | 'inline';
  asLink?: boolean;
  href?: string;
}) {
  const hex = KEYWORD_COLORS[id];
  const colorStyle = hex ? { backgroundColor: hex, color: contrastTextColor(hex) } : undefined;
  const colorClass = hex ? '' : fallbackPalette(id);
  const sizeClass = size === 'heading' ? 'text-sm px-2.5 py-0.5' : 'text-[0.7rem] px-1.5 py-px';

  const Tag = asLink ? 'a' : 'span';

  return (
    <Tag
      {...(asLink
        ? href
          ? { href }
          : { href: `#rule-${id}`, 'data-rule-link': `rule-${id}` }
        : {})}
      className={`inline-block -skew-x-[12deg] border border-black/15 dark:border-white/15 no-underline ${colorClass}`}
      style={colorStyle}
    >
      <span className={`inline-block skew-x-[12deg] font-bold uppercase tracking-wide leading-[1.5] ${sizeClass}`}>
        {children}
      </span>
    </Tag>
  );
}
