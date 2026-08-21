/**
 * Les vues d'un groupe, et comment on y va.
 *
 * Toutes vivent sur **une seule route**, `/play-groups/[playGroupId]`, et se
 * choisissent par `?view=`. Ce n'est pas un raccourci : la configuration de
 * routage d'un déploiement Vercel est plafonnée à 2048 entrées, et chaque
 * segment de route est multiplié par les quatre langues du catalogue plus la
 * coquille générique — huit vues en segments coûtaient une centaine d'entrées,
 * pour un projet qui en comptait déjà près de deux mille.
 *
 * Cela rejoint d'ailleurs la maquette, qui décrit le rail comme un état unique
 * (`view`), et l'usage du dépôt : la vitrine d'un lieu choisit déjà ses onglets
 * par `?tab=`.
 */

export const PLAY_GROUP_VIEWS = [
  "hub",
  "sessions",
  "announcements",
  "contents",
  "lists",
  "members",
  "showcase",
  "settings",
] as const;

export type PlayGroupView = (typeof PLAY_GROUP_VIEWS)[number];

/** La vue demandée par l'URL, ramenée à celles que l'on connaît. */
export function readPlayGroupView(value: string | undefined): PlayGroupView {
  return PLAY_GROUP_VIEWS.includes(value as PlayGroupView) ? (value as PlayGroupView) : "hub";
}

/**
 * L'adresse d'une vue.
 *
 * `hub` n'écrit pas de paramètre : c'est la vue par défaut, et une URL de
 * groupe se partage plus volontiers nue.
 */
export function viewHref(
  playGroupId: string,
  view: PlayGroupView,
  params: { contentId?: string; article?: string } = {},
): string {
  const search = new URLSearchParams();

  if (view !== "hub") {
    search.set("view", view);
  }
  if (params.contentId) {
    search.set("contentId", params.contentId);
  }
  if (params.article) {
    search.set("article", params.article);
  }

  const query = search.toString();

  return query ? `/play-groups/${playGroupId}?${query}` : `/play-groups/${playGroupId}`;
}
