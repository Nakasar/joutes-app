/**
 * Fonctionnalités qu'un jeu peut activer.
 *
 * Ces fanions décidaient jusqu'ici de tout ce qu'un jeu expose — onglets,
 * tuiles du portail, routes d'API — sans être éditables nulle part : les poser
 * demandait un accès à la base. Cette table les rend saisissables, et évite
 * d'écrire trois fois la même liste (le type, le schéma, le formulaire).
 *
 * L'ordre de déclaration est celui du formulaire d'administration.
 */
export const GAME_FEATURES = {
  cards: {
    label: "Cartes",
    description: "Galerie des cartes, loupe et scanner. Commande aussi l'onglet « collection » de la barre d'outils.",
  },
  collection: {
    label: "Collection",
    description: "Tuile « ma collection » sur la fiche du jeu.",
  },
  products: {
    label: "Produits",
    description: "Catalogue de boîtes et de figurines, et la collection qui va avec. Pour les jeux sans cartes.",
  },
  rules: {
    label: "Règles",
    description: "Corpus de règles consultable et recherchable.",
  },
  policies: {
    label: "Politiques",
    description: "Documents de politique de jeu, soumis au vote de la communauté.",
  },
  tournaments: {
    label: "Tournois",
    description: "Tuile « tournois » sur la fiche du jeu.",
  },
  deckChecker: {
    label: "Vérificateur de deck",
    description: "Contrôle de légalité d'une liste au regard des formats du jeu.",
  },
  decks: {
    label: "Decks",
    description:
      "Explorateur des decks publiés du jeu, et l'entrée dans l'éditeur qui va avec. Ne ferme pas la création d'un deck depuis « Mes decks », qui reste ouverte à tous les jeux.",
  },
  news: {
    label: "Actualités",
    description: "Fil d'actualités du jeu, sur sa fiche et sur sa propre page.",
  },
  quizz: {
    label: "Quizz",
    description: "Quizz de la communauté sur les règles, les rulings et les politiques du jeu.",
  },
  cubes: {
    label: "Cubes",
    description: "Création et draft de cubes.",
  },
  battleReports: {
    label: "Rapports de bataille",
    description:
      "Les parties de ce jeu se saisissent en rapport de bataille : listes d'armée, scénario et notes. Pour les jeux de figurines.",
  },
  socialFeed: {
    label: "Réseaux de l'éditeur",
    description:
      "Publie automatiquement les dernières publications des comptes déclarés dans l'onglet « Liens et réseaux » — sur la fiche du jeu et sur sa page « Réseaux ». Le fanion est l'autorisation de republier, les liens sont les sources : sans eux, la case ne fait rien.",
  },
} as const;

export type GameFeatureKey = keyof typeof GAME_FEATURES;

export const GAME_FEATURE_KEYS = Object.keys(GAME_FEATURES) as GameFeatureKey[];

export const GAME_FEATURE_OPTIONS = Object.entries(GAME_FEATURES).map(([value, feature]) => ({
  value: value as GameFeatureKey,
  ...feature,
}));

export function isGameFeatureKey(key: string): key is GameFeatureKey {
  return Object.hasOwn(GAME_FEATURES, key);
}

/**
 * Fanions à écrire en base à partir d'une saisie de formulaire.
 *
 * Trois règles, toutes pour que le document reste lisible et qu'un
 * enregistrement ne détruise rien :
 *
 *  - **une saisie absente ne touche à rien.** `undefined` et l'objet vide ne
 *    disent pas la même chose : le premier est « ce formulaire ne parle pas des
 *    fonctionnalités », le second « l'utilisateur les a toutes décochées ». Les
 *    confondre laisserait un client qui n'envoie pas le champ — un onglet resté
 *    ouvert sur la version précédente pendant un déploiement — effacer en
 *    silence tout ce qu'un jeu expose.
 *  - **seuls les fanions activés sont écrits.** Un fanion décoché disparaît du
 *    document plutôt que d'y rester en `false` — c'est déjà la convention du
 *    dépôt (`foil` sur une carte, `sealed` sur un exemplaire), et tout le code
 *    lit ces fanions par vérité.
 *  - **les clés inconnues de la table sont conservées.** Un fanion posé à la
 *    main en base pour une expérimentation ne doit pas être effacé par un
 *    simple passage dans le formulaire, qui ne sait pas qu'il existe.
 */
export function mergeGameFeatures(
  submitted: Partial<Record<GameFeatureKey, boolean>> | undefined,
  existing: Record<string, boolean | undefined> | undefined
): Record<string, boolean> {
  const enabledExisting = Object.entries(existing ?? {}).filter(
    ([, value]) => value === true
  ) as [string, boolean][];

  if (submitted === undefined) {
    return Object.fromEntries(enabledExisting);
  }

  const preserved = enabledExisting.filter(([key]) => !isGameFeatureKey(key));
  const enabled = GAME_FEATURE_KEYS.filter((key) => submitted[key]).map(
    (key) => [key, true] as [string, boolean]
  );

  return Object.fromEntries([...preserved, ...enabled]);
}
