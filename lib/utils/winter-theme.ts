/**
 * Utilitaires pour le thème hivernal
 */

/**
 * Vérifie si le thème hivernal est activé
 * Utilisable côté serveur et client
 */
export function isWinterTheme(): boolean {
  return process.env.NEXT_PUBLIC_THEME === 'winter';
}

/**
 * Obtient le thème actuel
 */
export function getCurrentTheme(): 'winter' | 'default' {
  return isWinterTheme() ? 'winter' : 'default';
}

/**
 * Classes CSS conditionnelles pour le thème hivernal
 */
export const winterClasses = {
  /**
   * Applique l'effet de givre
   */
  frost: 'frost-effect',

  /**
   * Applique l'animation de scintillement
   */
  sparkle: 'winter-sparkle',

  /**
   * Applique l'effet de hover hivernal
   */
  hover: 'winter-hover',

  /**
   * Combine effet givre + hover
   */
  card: 'frost-effect winter-hover',

  /**
   * Combine tous les effets
   */
  full: 'frost-effect winter-sparkle winter-hover',
} as const;

/**
 * Variables CSS du thème hivernal
 */
export const winterColors = {
  christmas: {
    red: 'var(--christmas-red)',
    green: 'var(--christmas-green)',
    gold: 'var(--christmas-gold)',
  },
  winter: {
    snow: 'var(--snow-white)',
    ice: 'var(--ice-blue)',
  },
} as const;

/**
 * Emojis festifs pour le thème hivernal
 */
export const winterEmojis = {
  christmas: ['🎄', '🎅', '🎁', '🔔', '⭐', '🕯️'],
  winter: ['❄️', '⛄', '🌨️', '☃️'],
  celebration: ['🎉', '🎊', '✨', '🌟'],
} as const;

/**
 * Obtient un emoji aléatoire d'une catégorie
 */
export function getRandomWinterEmoji(
  category: keyof typeof winterEmojis = 'winter'
): string {
  const emojis = winterEmojis[category];
  return emojis[Math.floor(Math.random() * emojis.length)];
}

/**
 * Génère une classe CSS conditionnelle basée sur le thème
 */
export function conditionalWinterClass(
  winterClass: string,
  defaultClass: string = ''
): string {
  return isWinterTheme() ? winterClass : defaultClass;
}

/**
 * Ajoute un préfixe emoji si le thème hivernal est activé
 */
export function winterPrefix(
  text: string,
  emoji: string = '❄️',
  addSpace: boolean = true
): string {
  if (!isWinterTheme()) return text;
  return `${emoji}${addSpace ? ' ' : ''}${text}`;
}

/**
 * Hook-like function pour obtenir les classes conditionnelles
 * (utilisable côté serveur)
 */
export function useWinterClasses(baseClasses: string = ''): string {
  if (!isWinterTheme()) return baseClasses;
  return `${baseClasses} winter-theme`.trim();
}

/**
 * Type pour les props de composants avec support du thème
 */
export interface WinterThemeProps {
  /** Appliquer l'effet de givre */
  frost?: boolean;
  /** Appliquer l'animation de scintillement */
  sparkle?: boolean;
  /** Appliquer l'effet hover */
  winterHover?: boolean;
  /** Emoji à afficher (seulement en thème hivernal) */
  winterEmoji?: string;
}

/**
 * Génère les classes CSS basées sur les props du thème
 */
export function getWinterClassNames(props: WinterThemeProps): string {
  if (!isWinterTheme()) return '';

  const classes: string[] = [];

  if (props.frost) classes.push(winterClasses.frost);
  if (props.sparkle) classes.push(winterClasses.sparkle);
  if (props.winterHover) classes.push(winterClasses.hover);

  return classes.join(' ');
}

/**
 * Constantes de configuration du thème hivernal
 */
export const winterConfig = {
  /** Nombre de flocons de neige sur desktop */
  snowflakesDesktop: 50,
  /** Nombre de flocons de neige sur mobile */
  snowflakesMobile: 20,
  /** Durée d'animation minimale des flocons (secondes) */
  snowflakeMinDuration: 10,
  /** Durée d'animation maximale des flocons (secondes) */
  snowflakeMaxDuration: 30,
  /** Taille minimale des flocons (px) */
  snowflakeMinSize: 10,
  /** Taille maximale des flocons (px) */
  snowflakeMaxSize: 30,
} as const;

