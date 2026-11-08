/**
 * La couleur d'un domaine dans les graphiques de la méta.
 *
 * Les six domaines de Riftbound ont la leur ; un autre jeu, ou un domaine
 * inconnu, reçoit une couleur stable tirée de son nom.
 */
const DOMAIN_COLORS: Record<string, string> = {
  fury: "#e5484d",
  calm: "#30a46c",
  mind: "#3e8ed0",
  body: "#f08c2e",
  chaos: "#8e4ec6",
  order: "#d4b106",
};

const FALLBACK = ["#0ea5e9", "#a855f7", "#14b8a6", "#f43f5e", "#84cc16", "#f59e0b"];

export const COLORLESS_COLOR = "#94a3b8";

export function domainColor(domain: string): string {
  const known = DOMAIN_COLORS[domain.toLowerCase()];
  if (known) return known;
  let hash = 0;
  for (const char of domain) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK[hash % FALLBACK.length];
}
