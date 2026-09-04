import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";

import HalloweenSeasonBanner from "@/components/HalloweenSeasonBanner.tsx";

import Accueil, { type ParamsAccueil } from "./_accueil/Accueil.tsx";
import { SqueletteAgenda, SqueletteFil, SqueletteTuile } from "./_accueil/squelettes.tsx";

type HomeProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ParamsAccueil>;
};

/**
 * L'accueil.
 *
 * La page ne fait que tenir la coquille : un conteneur, la bannière de saison,
 * et la frontière derrière laquelle tout ce qui dépend de la session se rend.
 * Le reste vit dans `_accueil`.
 *
 * Deux vues sortent d'ici — celle du joueur connecté et celle du visiteur —
 * mais une seule composition : c'est `Accueil` qui choisit ce que chaque bloc
 * a le droit de montrer.
 */
export default async function Home({ params, searchParams }: HomeProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 lg:px-8">
      {/*
        Le bandeau lit la session pour compter les événements de la personne :
        il lui faut sa propre frontière, sinon il sortirait la page entière du
        prérendu. Pas de squelette — hors saison, hors habillage ou déconnecté,
        le cas courant, il ne rend rien du tout.
      */}
      <Suspense fallback={null}>
        <div className="mb-5">
          <HalloweenSeasonBanner />
        </div>
      </Suspense>

      <Suspense fallback={<SqueletteAccueil />}>
        <Accueil searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/**
 * La page entière, le temps de savoir qui regarde.
 *
 * Elle ne dure que la lecture de la session ; les six sources de contenu ont
 * chacune leur propre frontière plus bas, et se remplissent séparément.
 */
function SqueletteAccueil() {
  return (
    <div className="flex flex-col gap-5">
      <div aria-hidden className="bg-card/60 h-16 animate-pulse rounded-xl" />
      <SqueletteAgenda />
      <div className="grid items-start gap-11 lg:grid-cols-[minmax(0,1fr)_348px]">
        <SqueletteFil />
        <div className="flex flex-col gap-9 pt-4">
          <SqueletteTuile />
          <SqueletteTuile />
        </div>
      </div>
    </div>
  );
}
