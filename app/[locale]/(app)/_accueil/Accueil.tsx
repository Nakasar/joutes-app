import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { MapPin, Plus } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";

import Agenda from "./Agenda.tsx";
import BandeauDirects from "./BandeauDirects.tsx";
import Fil from "./Fil.tsx";
import OngletsJeux from "./OngletsJeux.tsx";
import {
  CarteInscription,
  PuceLocalisation,
  TuileDecks,
  TuileLieux,
  TuileSondage,
} from "./Colonnes.tsx";
import { SqueletteAgenda, SqueletteFil, SqueletteTuile } from "./squelettes.tsx";
import {
  lireAgenda,
  lireDirects,
  lireJeuChoisi,
  lirePosition,
  lireViewer,
  TYPES_CONTENU,
  type TypeContenu,
} from "./accueil-data.ts";

export type ParamsAccueil = {
  jeu?: string;
  fil?: string;
  lat?: string;
  lon?: string;
  rayon?: string;
  lieu?: string;
};

/**
 * L'accueil.
 *
 * UNE SEULE COMPOSITION pour deux publics. Connecté ou non, la page a la même
 * barre, le même rythme de sections, les mêmes fiches inclinées et le même
 * bandeau rouge. C'est voulu : quelqu'un qui crée son compte doit retrouver la
 * page qu'il vient de parcourir, pas en découvrir une autre.
 *
 * Ce qui change est ce que la page n'a plus le droit de savoir. L'en-tête
 * personnel devient une proposition ; la colonne de droite passe de « mes
 * lieux, mes decks, mon groupe » à « les lieux autour de vous, les decks en
 * vedette, et créez votre compte ».
 *
 * Chaque tuile a sa frontière `<Suspense>` : six sources l'alimentent, et une
 * lecture lente ne doit pas retenir les autres.
 */
export default async function Accueil({
  searchParams,
}: {
  /**
   * La promesse, pas sa valeur : la page la transmet sans l'attendre, pour
   * que la lecture de l'URL ait lieu ici, sous la frontière `<Suspense>`.
   * L'attendre en tête de page ferait sortir la coquille du prérendu.
   */
  searchParams: Promise<ParamsAccueil>;
}) {
  const params = await searchParams;
  const viewer = await lireViewer();
  const position = lirePosition(params, viewer);
  const jeu = await lireJeuChoisi(params.jeu);
  const jeuChoisi = jeu?.id ?? null;

  const typeChoisi = TYPES_CONTENU.includes(params.fil as TypeContenu)
    ? (params.fil as TypeContenu)
    : null;

  return (
    <div className="flex flex-col gap-5">
      {viewer ? (
        <EnTeteConnectee nom={viewer.displayName ?? viewer.username} position={position} jeu={jeu} />
      ) : (
        <EnTeteVisiteur />
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <OngletsJeux jeuChoisi={jeuChoisi} params={params} />
        {!viewer && <PuceLocalisation position={position} />}
      </div>

      {/*
        Pas de squelette pour le bandeau : le cas courant est qu'aucun direct
        ne tourne, et une plaque grise annoncerait alors un contenu qui ne
        viendra pas.
      */}
      <Suspense fallback={null}>
        <BandeauDirects position={position} />
      </Suspense>

      <Suspense fallback={<SqueletteAgenda />}>
        <Agenda position={position} jeu={jeu} />
      </Suspense>

      <div className="grid items-start gap-11 lg:grid-cols-[minmax(0,1fr)_348px]">
        <Suspense fallback={<SqueletteFil />}>
          <Fil jeuChoisi={jeuChoisi} typeChoisi={typeChoisi} params={params} />
        </Suspense>

        <aside className="flex flex-col gap-9 pt-4">
          <Suspense fallback={<SqueletteTuile />}>
            <TuileLieux position={position} rang={0} />
          </Suspense>
          <Suspense fallback={<SqueletteTuile />}>
            <TuileDecks jeuChoisi={jeuChoisi} rang={1} />
          </Suspense>
          {viewer ? (
            <Suspense fallback={null}>
              <TuileSondage rang={2} />
            </Suspense>
          ) : (
            <CarteInscription rang={2} />
          )}
        </aside>
      </div>
    </div>
  );
}

/** « Bonsoir, Kévin » et ce qui l'attend. */
async function EnTeteConnectee({
  nom,
  position,
  jeu,
}: {
  nom: string;
  position: ReturnType<typeof lirePosition>;
  jeu: Awaited<ReturnType<typeof lireJeuChoisi>>;
}) {
  const [t, evenements, directs] = await Promise.all([
    getTranslations("Home"),
    lireAgenda(position, jeu),
    lireDirects(position),
  ]);

  const morceaux = [
    evenements.length > 0 ? t("resume.evenements", { count: evenements.length }) : null,
    directs.length > 0 ? t("resume.directs", { count: directs.length }) : null,
  ].filter(Boolean);

  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("salutation", { nom })}</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          {morceaux.length > 0 ? morceaux.join(", ") : t("resume.rien")}
        </p>
      </div>
      {/* `Button` ne se coupe ni ne rétrécit : la rangée doit pouvoir se replier. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline">
          <Link href="/events">
            <MapPin aria-hidden />
            {t("autourDeMoi")}
          </Link>
        </Button>
        <Button asChild className="hidden sm:inline-flex">
          <Link href="/events/new">
            <Plus aria-hidden />
            {t("createEvent")}
          </Link>
        </Button>
      </div>
    </header>
  );
}

/** Ce que Joutes propose, à qui ne le sait pas encore. */
async function EnTeteVisiteur() {
  const t = await getTranslations("Home.proposition");

  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("titre")}</h1>
        <p className="text-muted-foreground mt-3 max-w-xl text-base leading-6">{t("sous")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline">
          <Link href="/events">{t("agenda")}</Link>
        </Button>
        <Button asChild>
          <Link href="/login">
            <Plus aria-hidden />
            {t("creer")}
          </Link>
        </Button>
      </div>
    </header>
  );
}
