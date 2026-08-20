import type { CSSProperties } from "react";
import type { Lair } from "@/lib/types/Lair";

/**
 * La palette fermée d'accents proposée aux lieux.
 *
 * Fermée pour deux raisons : un accent choisi librement finit par tomber sur un
 * gris qui disparaît sur le fond sombre, ou sur un ton si saturé qu'il rend le
 * texte des boutons illisible. Ces cinq-là ont été vérifiés contre `--card` et
 * `--background` du thème sombre.
 */
export const LAIR_ACCENT_PALETTE = [
  "#D8A150",
  "#22D3EE",
  "#A78BFA",
  "#34D399",
  "#F87171",
] as const;

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function expandHex(hex: string): string {
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }

  return hex;
}

/**
 * La luminance relative d'une couleur hexadécimale (WCAG 2.1, §relative
 * luminance) — c'est elle qui décide si le texte posé sur l'accent doit être
 * sombre ou clair.
 */
function relativeLuminance(hex: string): number {
  const value = expandHex(hex);
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export type LairAccent = {
  /** L'accent tel qu'il est stocké, ou `null` si le lieu n'en a pas choisi. */
  color: string | null;
  /** Le style à poser sur le conteneur `.lair-theme` de la page. */
  style: CSSProperties;
  /** Le lieu teinte-t-il ses cartes et ses boutons, au-delà des titres ? */
  tintSurfaces: boolean;
};

/**
 * Traduit l'accent du lieu en variables CSS.
 *
 * Seules `--lair-accent` et `--lair-accent-foreground` sont posées ici : les
 * déclinaisons (fonds à 4 / 8 / 16 %, bordures à 22 / 32 / 45 %…) sont dérivées
 * en CSS dans `.lair-theme`, sur le même élément. Les propriétés
 * personnalisées étant substituées au moment de l'usage, un `color-mix` écrit
 * dans la feuille de style voit bien la valeur posée ici en ligne.
 *
 * Sans accent enregistré, rien n'est posé : `.lair-theme` retombe sur
 * `--primary`, et la page garde les couleurs de Joutes.
 */
export function readLairAccent(lair: Pick<Lair, "options">): LairAccent {
  const raw = lair.options?.theme?.accentColor?.trim();
  const color = raw && HEX_COLOR.test(raw) ? expandHex(raw).toLowerCase() : null;

  if (!color) {
    return { color: null, style: {}, tintSurfaces: false };
  }

  // Un accent clair (l'ambre de la maquette, la menthe) demande un texte
  // sombre sur les boutons pleins ; un accent sombre demande l'inverse.
  const foreground = relativeLuminance(color) > 0.4 ? "oklch(0.16 0.02 80)" : "oklch(0.99 0 0)";

  return {
    color,
    tintSurfaces: lair.options?.theme?.tintSurfaces === true,
    style: {
      "--lair-accent": color,
      "--lair-accent-foreground": foreground,
    } as CSSProperties,
  };
}
