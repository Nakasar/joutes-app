/**
 * L'état d'avancement d'une vitrine.
 *
 * Deux écrans montrent la même chose sous deux formes : une jauge « votre
 * vitrine est prête à N % » dans la colonne du registre, et une liste
 * d'amorçage en cinq étapes sur un profil encore vide. Les deux sortent d'ici
 * pour qu'elles ne puissent pas se contredire — une jauge à 100 % au-dessus
 * d'une étape non cochée serait le genre de détail qui décrédibilise tout le
 * reste de la page.
 *
 * Module pur : l'entrée est en données plates, pas en `User`, pour que le test
 * n'ait rien à fabriquer et que l'appelant reste libre de ses lectures.
 */

export const SHOWCASE_STEP_KEYS = [
  "username",
  "identity",
  "banner",
  "follows",
  "public",
] as const;

export type ShowcaseStepKey = (typeof SHOWCASE_STEP_KEYS)[number];

export type ShowcaseStep = {
  key: ShowcaseStepKey;
  done: boolean;
  /**
   * L'étape est-elle hors de portée du compte ? La bannière demande un
   * abonnement. Une étape verrouillée **ne compte pas** dans la jauge : rien ne
   * serait plus décourageant qu'un compteur qu'on ne peut pas finir sans payer.
   */
  locked?: boolean;
};

export type ShowcaseCompletionInput = {
  hasDisplayName: boolean;
  hasAvatar: boolean;
  hasDescription: boolean;
  hasBanner: boolean;
  /** Le palier ouvre-t-il le droit à la bannière ? */
  canUseBanner: boolean;
  followedGames: number;
  followedLairs: number;
  isPublic: boolean;
};

export type ShowcaseCompletion = {
  /** Entier de 0 à 100. */
  percent: number;
  steps: ShowcaseStep[];
  /** Reste-t-il quelque chose à faire ? La liste d'amorçage s'efface sinon. */
  complete: boolean;
};

export function readShowcaseCompletion(input: ShowcaseCompletionInput): ShowcaseCompletion {
  const steps: ShowcaseStep[] = [
    { key: "username", done: input.hasDisplayName },
    // Avatar **et** description : une vitrine avec l'un sans l'autre reste une
    // silhouette. L'étape est une, parce qu'on les règle au même endroit.
    { key: "identity", done: input.hasAvatar && input.hasDescription },
    {
      key: "banner",
      done: input.hasBanner,
      locked: input.canUseBanner ? undefined : true,
    },
    // Suivre des jeux **ou** des lieux : les deux disent « voilà où je joue »,
    // et exiger les deux d'un joueur qui n'a pas de boutique près de chez lui
    // serait une étape impossible.
    { key: "follows", done: input.followedGames > 0 || input.followedLairs > 0 },
    { key: "public", done: input.isPublic },
  ];

  const counted = steps.filter((step) => !step.locked);
  const done = counted.filter((step) => step.done).length;

  return {
    percent: counted.length === 0 ? 100 : Math.round((done / counted.length) * 100),
    steps,
    complete: done === counted.length,
  };
}
