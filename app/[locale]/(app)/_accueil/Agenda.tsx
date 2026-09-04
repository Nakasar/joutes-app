import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays, ChevronRight, MapPin } from "lucide-react";
import { DateTime } from "luxon";

import { Link } from "@/i18n/navigation.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import type { Event } from "@/lib/types/Event";
import type { User } from "@/lib/types/User";
import type { Game } from "@/lib/types/Game";

import { EtiquetteSection, Fanion, Fiche, Punaise, POSES_ANNONCE } from "./pieces.tsx";
import { lireAgenda, lireViewer, type Position } from "./accueil-data.ts";

/**
 * Ce qui m'attend : les prochaines échéances, punaisées.
 *
 * Les trois fiches se chevauchent et se décalent, et la première porte un
 * fanion. C'est là que passe toute la hiérarchie de la page : sans cela, trois
 * dates se valent et il faut les lire pour savoir laquelle vient d'abord.
 *
 * Le recouvrement ne vaut qu'à partir de `sm` : sur un téléphone les fiches
 * s'empilent, et se mordre l'une l'autre cacherait du texte au lieu de
 * suggérer une épaisseur.
 */
export default async function Agenda({
  position,
  jeu,
}: {
  position: Position | null;
  jeu: Game | null;
}) {
  const [t, locale, viewer, evenements] = await Promise.all([
    getTranslations("Home.agenda"),
    getLocale(),
    lireViewer(),
    lireAgenda(position, jeu),
  ]);

  const titre = position?.nom
    ? t("titreAutourDe", { lieu: position.nom })
    : viewer
      ? t("titreConnecte")
      : t("titreVisiteur");

  return (
    <section>
      <EtiquetteSection
        icone={<CalendarDays className="size-[18px]" aria-hidden />}
        action={
          <Link
            href="/events"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium"
          >
            {t("tout")}
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        }
      >
        {titre}
      </EtiquetteSection>

      {evenements.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          {jeu ? t("videSurCeJeu") : t("vide")}
        </p>
      ) : (
        <div className="grid gap-5 pt-3 sm:grid-cols-3 sm:gap-0">
          {evenements.map((evenement, index) => (
            <Annonce
              key={evenement.id}
              evenement={evenement}
              viewer={viewer}
              locale={locale}
              t={t}
              pose={POSES_ANNONCE[index] ?? POSES_ANNONCE[POSES_ANNONCE.length - 1]}
              prochain={index === 0}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Annonce({
  evenement,
  viewer,
  locale,
  t,
  pose,
  prochain,
}: {
  evenement: Event;
  viewer: User | null;
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations<"Home.agenda">>>;
  pose: string;
  prochain: boolean;
}) {
  const debut = DateTime.fromISO(evenement.startDateTime).setLocale(locale);
  const statut = lireStatut(evenement, viewer);

  return (
    <Fiche className={cn("flex flex-col gap-3.5 p-5 pt-6", pose)}>
      <Punaise
        ton="echeance"
        className="left-1/2 -ml-[11px]"
      />
      {prochain && <Fanion>{quandCourt(debut, locale)}</Fanion>}

      <Link href={`/events/${evenement.id}`} className="flex flex-col gap-3.5">
        <span className="flex items-baseline gap-2.5 border-b-2 pb-3">
          <span className={cn("font-bold tracking-tighter", prochain ? "text-5xl" : "text-4xl")}>
            {debut.toFormat("dd")}
          </span>
          <span className="text-muted-foreground flex flex-col gap-0.5 font-mono text-[11px] tracking-wider uppercase">
            <span>{debut.toFormat("LLL")}</span>
            <span>{debut.toFormat("cccc HH'h'mm")}</span>
          </span>
        </span>

        <span className="line-clamp-2 text-lg leading-6 font-semibold tracking-tight">
          {evenement.name}
        </span>

        <span className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
          {evenement.lair?.name && (
            <>
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{evenement.lair.name}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span>{evenement.gameName}</span>
        </span>
      </Link>

      {/*
        `Badge` porte `whitespace-nowrap shrink-0` : une rangée qui en aligne
        plusieurs doit se replier, faute de quoi elle élargit la page entière
        sur un téléphone.
      */}
      <span className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Badge variant={statut.variante} className={statut.classe}>
          {t(`statut.${statut.cle}`, { count: statut.places ?? 0 })}
        </Badge>
      </span>
    </Fiche>
  );
}

/**
 * Ce que l'événement dit de moi — ou, sans compte, ce qu'il dit de lui.
 *
 * Connecté, mon engagement prime : je suis inscrit, ou je l'organise. C'est la
 * seule information que je ne peux pas déduire du reste de la fiche. Sinon,
 * l'événement se décrit lui-même : places restantes, complet, ouvert.
 */
function lireStatut(
  evenement: Event,
  viewer: User | null,
): {
  cle: "organisateur" | "inscrit" | "complet" | "places" | "ouvert";
  places?: number;
  variante: "default" | "secondary" | "outline";
  classe?: string;
} {
  const organise =
    viewer != null &&
    (evenement.creatorId === viewer.id ||
      evenement.staff?.some((membre) => membre.userId === viewer.id && membre.role === "organizer"));

  if (organise) {
    return { cle: "organisateur", variante: "default" };
  }

  if (viewer && evenement.participants?.includes(viewer.id)) {
    return {
      cle: "inscrit",
      variante: "secondary",
      classe: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }

  if (evenement.status === "sold-out") {
    return { cle: "complet", variante: "outline" };
  }

  const inscrits = evenement.registeredParticipantsCount ?? evenement.participants?.length ?? 0;
  const places = evenement.maxParticipants;
  if (places != null && places > inscrits) {
    return { cle: "places", places: places - inscrits, variante: "outline" };
  }

  return { cle: "ouvert", variante: "outline" };
}

/** « Aujourd'hui », « demain », ou le jour de la semaine. */
function quandCourt(debut: DateTime, locale: string): string {
  const jours = Math.floor(debut.startOf("day").diff(DateTime.now().startOf("day"), "days").days);
  if (jours <= 0) return debut.setLocale(locale).toRelativeCalendar({ unit: "days" }) ?? "";
  if (jours === 1) return debut.setLocale(locale).toRelativeCalendar({ unit: "days" }) ?? "";
  return debut.setLocale(locale).toFormat("cccc");
}
