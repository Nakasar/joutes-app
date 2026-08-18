"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";

import "@/app/halloween-theme.css";
import { Bat, Candle, Cobweb, DeadTree, Graveyard, Pumpkin } from "./HalloweenSVGs";
import { decorLevelAt, type DecorLevel } from "@/lib/utils/halloween-theme";

/**
 * Le décor de la saison.
 *
 * Trois écarts assumés avec `WinterDecorations`, tous dans le même sens —
 * que le décor se voie sans jamais se mettre en travers :
 *
 * 1. **Il passe derrière le contenu**, pas devant. L'hiver empile ses
 *    guirlandes et son tas de neige en `z-30`/`z-50`, par-dessus les cartes
 *    et le pied de page. Ici tout est en `z-0` : l'atmosphère occupe les
 *    marges et les fonds, et aucune citrouille ne vient recouvrir un bouton.
 *
 * 2. **L'intensité suit la date**, pas seulement le réglage de déploiement.
 *    L'habillage peut donc être activé à l'avance sans couvrir le site de
 *    chauves-souris dès le 1er octobre — voir `lib/utils/halloween-theme.ts`.
 *
 * 3. **Le niveau est calculé après le montage.** Le faire au rendu serveur
 *    figerait la date dans une page mise en cache : un site rendu le 20
 *    resterait « discret » le 31. Le décor apparaît donc à la première frame
 *    client, ce qui est sans conséquence pour de la décoration.
 *
 * Le mouvement réduit est traité en CSS (`halloween-theme.css`) : les
 * animations s'arrêtent et `.decor-heavy` disparaît, ce qui ramène exactement
 * au niveau « discret ».
 */
export default function HalloweenDecorations() {
  const [level, setLevel] = useState<DecorLevel | null>(null);

  useEffect(() => {
    const update = () => setLevel(decorLevelAt(DateTime.now()));
    update();

    // La saison peut basculer sous les yeux d'un onglet resté ouvert la nuit
    // du 23 au 24, ou du 31 au 1er. Un contrôle horaire suffit : la bascule
    // n'a pas à être à la seconde près.
    const timer = setInterval(update, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  if (level === null || level === "aucun") return null;

  return (
    // Décor : jamais imprimé (voir la section impression de globals.css).
    <div data-print-hidden data-decor={level}>
      {/* Toiles d'araignée, dans les deux coins hauts */}
      <div className="fixed top-0 left-0 pointer-events-none z-0 text-[var(--web)]">
        <Cobweb className="w-24 h-24 md:w-32 md:h-32" />
      </div>
      <div className="fixed top-0 right-0 pointer-events-none z-0 text-[var(--web)] -scale-x-100">
        <Cobweb className="w-24 h-24 md:w-32 md:h-32" />
      </div>

      {/* Chauves-souris : trois, en vol lent, décalées les unes des autres */}
      <div
        className="decor-heavy fixed top-32 left-8 pointer-events-none z-0 opacity-50 text-[var(--decor-ink)] halloween-bat hidden md:block"
        aria-hidden="true"
      >
        <Bat className="w-8 h-8" />
      </div>
      <div
        className="decor-heavy fixed top-24 right-16 pointer-events-none z-0 opacity-40 text-[var(--decor-ink)] halloween-bat hidden md:block"
        style={{ animationDelay: "1.8s" }}
        aria-hidden="true"
      >
        <Bat className="w-6 h-6" />
      </div>
      <div
        className="decor-heavy fixed top-56 right-8 pointer-events-none z-0 opacity-35 text-[var(--decor-ink)] halloween-bat hidden lg:block"
        style={{ animationDelay: "3.6s" }}
        aria-hidden="true"
      >
        <Bat className="w-7 h-7" />
      </div>

      {/* Une bougie flottante, tenue en l'air par rien du tout */}
      <div
        className="decor-heavy fixed top-44 left-6 pointer-events-none z-0 halloween-float hidden lg:block"
        aria-hidden="true"
      >
        <Candle className="w-6 h-12" delay={0} melt={0} />
      </div>

      {/* Le cimetière, en pied de page */}
      <div className="fixed bottom-0 left-0 right-0 pointer-events-none z-0 h-32 md:h-40 lg:h-48 text-[var(--decor-ink)]">
        <Graveyard className="w-full h-full" />

        {/* L'arbre mort, à gauche : la verticale du pied de page */}
        <div className="decor-heavy absolute bottom-0 left-4 w-24 h-24 text-[var(--decor-ink)] hidden md:block">
          <DeadTree className="w-full h-full" />
        </div>

        {/* Trois bougies fondues entre les tombes, chacune à son rythme */}
        <div className="decor-heavy absolute bottom-3 left-1/2 -translate-x-1/2 hidden md:flex items-end gap-2">
          <Candle className="w-5 h-10" delay={0} melt={0} />
          <Candle className="w-6 h-14" delay={0.35} melt={2} />
          <Candle className="w-4 h-9" delay={0.8} melt={1} />
        </div>

        {/* Deux citrouilles allumées, posées au sol */}
        <div className="decor-heavy absolute bottom-4 left-1/4 w-12 h-12 halloween-lantern hidden md:block">
          <Pumpkin className="w-full h-full" />
        </div>
        <div
          className="decor-heavy absolute bottom-2 right-16 w-9 h-9 halloween-lantern hidden md:block"
          style={{ animationDelay: "1.2s" }}
        >
          <Pumpkin className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
