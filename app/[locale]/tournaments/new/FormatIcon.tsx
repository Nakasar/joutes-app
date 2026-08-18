// Pictogrammes des formats de tournoi proposés par le tunnel de création.
// Tous sont tracés sur une grille de 64 avec un trait de 2.4 : posés côte à
// côte sur les cartes de choix, ils ont le même poids visuel.
//
// Deux tons seulement : l'accent porte ce qui décrit le format (la table, le
// vainqueur du bracket, le chronomètre), le ton neutre le décor.

export type TournamentFormatKey = "swiss" | "elimination" | "mixed" | "timer" | "free";

const ACCENT = "stroke-sky-500";
const ACCENT_SOFT = "stroke-sky-500 fill-sky-500/15";
const ACCENT_SOLID = "stroke-sky-500 fill-sky-500";
const MUTED = "stroke-muted-foreground/70";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-16"
      aria-hidden
    >
      {children}
    </svg>
  );
}

// Joueur autour de la table : plein pour ceux qui jouent la ronde en cours.
function Token({ cx, cy, on }: { cx: number; cy: number; on: boolean }) {
  return <circle cx={cx} cy={cy} r={5.4} className={on ? ACCENT_SOFT : MUTED} />;
}

function SwissIcon() {
  return (
    <Frame>
      <rect x={17} y={22} width={30} height={20} rx={10} className={ACCENT_SOFT} />
      <path d="M26 32h12" className={ACCENT} opacity={0.55} />
      <Token cx={32} cy={8} on />
      <Token cx={55} cy={20} on={false} />
      <Token cx={55} cy={44} on />
      <Token cx={32} cy={56} on={false} />
      <Token cx={9} cy={44} on />
      <Token cx={9} cy={20} on={false} />
    </Frame>
  );
}

function EliminationIcon() {
  return (
    <Frame>
      <path d="M18 8h5v7h5M18 22h5v-7M18 36h5v7h5M18 50h5v-7" className={MUTED} />
      <path d="M39 15h5v14h4M39 43h5V29" className={ACCENT} />
      <rect x={4} y={4.5} width={14} height={7} rx={3.5} className={MUTED} />
      <rect x={4} y={18.5} width={14} height={7} rx={3.5} className={MUTED} />
      <rect x={4} y={32.5} width={14} height={7} rx={3.5} className={MUTED} />
      <rect x={4} y={46.5} width={14} height={7} rx={3.5} className={MUTED} />
      <rect x={25} y={11.5} width={14} height={7} rx={3.5} className={ACCENT_SOFT} />
      <rect x={25} y={39.5} width={14} height={7} rx={3.5} className={MUTED} />
      <rect x={48} y={25.5} width={14} height={7} rx={3.5} className={ACCENT_SOLID} />
    </Frame>
  );
}

// Les deux moitiés du format mixte, séparées par une oblique : la table des
// rondes suisses à gauche, l'arbre qu'elle alimente à droite.
function MixedIcon() {
  return (
    <Frame>
      <rect x={8} y={25} width={17} height={13} rx={6.5} className={ACCENT_SOFT} />
      <circle cx={16.5} cy={14} r={4} className={ACCENT} />
      <circle cx={5.5} cy={31.5} r={4} className={MUTED} />
      <circle cx={27.5} cy={31.5} r={4} className={MUTED} />
      <circle cx={16.5} cy={49} r={4} className={ACCENT} />
      <path d="M36 58 44 6" className={MUTED} opacity={0.7} strokeDasharray="5 5" />
      <rect x={46} y={12} width={11} height={6} rx={3} className={MUTED} />
      <rect x={46} y={40} width={11} height={6} rx={3} className={MUTED} />
      <rect x={51} y={26} width={11} height={6} rx={3} className={ACCENT_SOLID} />
      <path d="M57 15h3v11h-3M57 43h3V32" className={ACCENT} />
    </Frame>
  );
}

function TimerIcon() {
  return (
    <Frame>
      <path d="M9 58V8" className={MUTED} />
      <rect x={9} y={8} width={9} height={8} className={ACCENT_SOLID} />
      <rect x={18} y={8} width={9} height={8} className={ACCENT} />
      <rect x={9} y={16} width={9} height={8} className={ACCENT} />
      <rect x={18} y={16} width={9} height={8} className={ACCENT_SOLID} />
      <circle cx={42} cy={40} r={16} className={ACCENT_SOFT} />
      <path d="M38 21h8M42 21v3" className={ACCENT} />
      <path d="M42 40V30" className={ACCENT} />
      <path d="M42 40h7" className={MUTED} />
    </Frame>
  );
}

function FreeIcon() {
  return (
    <Frame>
      <circle cx={17} cy={17} r={6} className={ACCENT_SOFT} />
      <path d="M7 33c1.5-5.5 5.5-8 10-8s8.5 2.5 10 8" className={ACCENT} />
      <circle cx={44} cy={14} r={5} className={MUTED} />
      <path d="M36 28c1.2-4.5 4.5-6.5 8-6.5s6.8 2 8 6.5" className={MUTED} />
      <circle cx={30} cy={40} r={6} className={ACCENT_SOFT} />
      <path d="M20 57c1.5-5.5 5.5-8 10-8s8.5 2.5 10 8" className={ACCENT} />
      <circle cx={55} cy={41} r={4.5} className={MUTED} />
      <path d="M48 54c1-4 3.8-6 7-6s6 2 7 6" className={MUTED} />
    </Frame>
  );
}

const ICONS: Record<TournamentFormatKey, () => React.ReactElement> = {
  swiss: SwissIcon,
  elimination: EliminationIcon,
  mixed: MixedIcon,
  timer: TimerIcon,
  free: FreeIcon,
};

export function FormatIcon({ format }: { format: TournamentFormatKey }) {
  const Icon = ICONS[format];
  return <Icon />;
}
