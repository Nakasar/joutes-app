/*
 * Les pièces du décor d'Halloween.
 *
 * Toutes en SVG, jamais en emoji : elles se recolorent avec les jetons de la
 * saison (`--pumpkin`, `--bone`, `--decor-ink`…) et restent nettes à toutes
 * les tailles, ce qu'un glyphe rendu par la police du système ne fait ni l'un
 * ni l'autre.
 *
 * Aucune ne porte de texte ni de rôle : `aria-hidden` partout, le décor n'a
 * rien à dire à un lecteur d'écran.
 */

export function Cobweb({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.1">
        {/* Rayons partant du coin */}
        <path d="M0 0 L120 0 M0 0 L0 120 M0 0 L118 34 M0 0 L100 74 M0 0 L74 100 M0 0 L34 118" />
        {/* Fils tendus entre les rayons */}
        <path d="M26 0 Q20 20 0 26 M52 0 Q39 39 0 52 M78 0 Q58 58 0 78 M104 0 Q78 78 0 104" />
      </g>
    </svg>
  );
}

export function Bat({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12 6.6c-.9 0-1.5.7-1.9 1.4C9 6.9 7.5 6.3 6 6.7c.6.6.9 1.4.9 2.2-1-.5-2.2-.5-3.2 0 1.2.4 2 1.2 2.4 2.4.5 1.5 1.9 2.5 3.4 2.5.7 0 1.4.4 1.7 1 .3-.6 1-1 1.7-1 1.5 0 2.9-1 3.4-2.5.4-1.2 1.2-2 2.4-2.4-1-.5-2.2-.5-3.2 0 0-.8.3-1.6.9-2.2-1.5-.4-3 .2-4.1 1.3-.4-.7-1-1.4-1.9-1.4z"
      />
    </svg>
  );
}

/**
 * Une citrouille allumée. La lueur vient de la classe `halloween-lantern`
 * posée par l'appelant, pas d'ici : c'est lui qui sait si elle doit battre.
 */
export function Pumpkin({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M24 12c-1.4-3-1-5.4 1.5-7.4-.5 3 .5 4.4 2.5 4.9"
        fill="none"
        stroke="var(--spectre)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <ellipse cx="24" cy="28" rx="17" ry="14" fill="var(--pumpkin)" />
      <path
        d="M13 17c-3 4-3 18 0 22M35 17c3 4 3 18 0 22"
        fill="none"
        stroke="color-mix(in oklab, var(--night) 45%, transparent)"
        strokeWidth="1.6"
      />
      <path d="M16 25l4.5-3 1.5 4.5z" fill="var(--night)" />
      <path d="M32 25l-4.5-3-1.5 4.5z" fill="var(--night)" />
      <path
        d="M17 33c2-2.5 4-1 5 0s3 2.5 5 0 3-1 4 1c-1.5 3-4.5 4.5-7 4.5s-5.5-1.5-7-5.5z"
        fill="var(--night)"
      />
    </svg>
  );
}

/**
 * Une bougie. `delay` décale la flamme et son halo : passé le même à
 * plusieurs bougies, elles battent à l'unisson et l'illusion tombe.
 *
 * `melt` choisit le profil de cire — trois coulures possibles, pour qu'un
 * chandelier n'aligne pas trois fois le même dessin.
 */
export function Candle({
  className,
  delay = 0,
  melt = 0,
}: {
  className?: string;
  delay?: number;
  melt?: 0 | 1 | 2;
}) {
  const drips = [
    "M7 22c1.6 2.2 1.6 5.2 0 7.4z",
    "M17 26c-1.6 2.4-1.6 5.6 0 8z",
    "M7 24c1.6 2.4 1.6 5.6 0 8zM17 28c-1.6 2.2-1.6 5.2 0 7.4z",
  ];

  return (
    <svg
      viewBox="0 0 24 48"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse
        className="halloween-glow"
        cx="12"
        cy="12"
        rx="10"
        ry="12"
        fill="var(--pumpkin)"
        style={{ animationDelay: `${delay}s` }}
      />
      <rect x="7" y="18" width="10" height="30" rx="2" fill="var(--bone)" />
      <path d={drips[melt]} fill="var(--bone)" opacity="0.72" />
      <ellipse cx="12" cy="18" rx="5" ry="1.7" fill="var(--bone)" />
      {/* La mèche, visible sous la flamme */}
      <path
        d="M12 18v-2.6"
        stroke="var(--night)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <g className="halloween-wick" style={{ animationDelay: `${delay}s` }}>
        <path
          d="M12 5c2.7 2.7 4 5 4 7.2a4 4 0 0 1-8 0C8 10 9.3 7.7 12 5z"
          fill="var(--pumpkin)"
        />
        <path
          d="M12 9.2c1.3 1.4 2 2.6 2 3.7a2 2 0 0 1-4 0c0-1.1.7-2.3 2-3.7z"
          fill="var(--spectre)"
          opacity="0.85"
        />
      </g>
    </svg>
  );
}

/**
 * Le cimetière du pied de page : la silhouette qui remplace le tas de neige
 * hivernal. Elle s'étire sur toute la largeur, d'où le `preserveAspectRatio`
 * dénaturé — ce sont des masses, pas des formes à respecter.
 */
export function Graveyard({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1280 190"
      className={className}
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* La colline */}
      <path
        d="M0 190 L0 132 Q220 104 470 124 Q760 148 1010 116 Q1160 98 1280 122 L1280 190 Z"
        fill="currentColor"
        opacity="0.5"
      />
      {/* Pierres tombales */}
      <g fill="currentColor" opacity="0.72">
        <path d="M300 190 L300 148 A18 18 0 0 1 336 148 L336 190 Z" />
        <path d="M392 190 L392 158 A14 14 0 0 1 420 158 L420 190 Z" />
        <path d="M1064 190 L1064 152 A17 17 0 0 1 1098 152 L1098 190 Z" />
        <rect x="880" y="156" width="30" height="34" />
      </g>
      {/* Croix gravées, creusées dans la pierre */}
      <g stroke="var(--background)" strokeWidth="3" opacity="0.4">
        <path d="M318 154 L318 174 M310 162 L326 162" />
        <path d="M1081 158 L1081 176 M1074 165 L1088 165" />
      </g>
      {/* Grille de fer */}
      <g stroke="currentColor" strokeWidth="4" opacity="0.62" strokeLinecap="round">
        <path d="M470 190 L470 142 M502 190 L502 136 M534 190 L534 142 M566 190 L566 136 M598 190 L598 142 M630 190 L630 136 M662 190 L662 142" />
        <path d="M462 154 L670 148 M462 174 L670 168" />
      </g>
    </svg>
  );
}

/**
 * L'arbre mort. Il donne au pied de page une verticale, sans quoi la
 * silhouette du bas n'est qu'une bande grise.
 */
export function DeadTree({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 120"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.75"
      >
        <path d="M100 120 L100 26" />
        <path d="M100 60 L72 34 M72 34 L58 38 M72 34 L68 18" />
        <path d="M100 48 L132 22 M132 22 L148 26 M132 22 L134 6" />
        <path d="M100 30 L84 8 M100 30 L116 10" />
      </g>
    </svg>
  );
}

/**
 * Le revenant. Réservé aux états vides : il n'apparaît que là où il a
 * quelque chose à dire, ce qui lui garde son effet.
 */
export function Ghost({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M24 5c-8.8 0-16 7.2-16 16v20c0 1.6 1.8 2.4 3 1.4l3.4-2.8a2 2 0 0 1 2.6.1l2.6 2.4a2 2 0 0 0 2.8 0l2.6-2.4a2 2 0 0 1 2.6 0l2.6 2.4a2 2 0 0 0 2.8-.1l3.2-2.7c1.2-1 3-.2 3 1.4V21c0-8.8-7.2-16-16-16Z"
        fill="var(--bone)"
        opacity="0.92"
      />
      <ellipse cx="18" cy="20" rx="2.6" ry="3.4" fill="var(--night)" />
      <ellipse cx="30" cy="20" rx="2.6" ry="3.4" fill="var(--night)" />
      <ellipse cx="24" cy="28" rx="3.4" ry="4.4" fill="var(--night)" />
    </svg>
  );
}
