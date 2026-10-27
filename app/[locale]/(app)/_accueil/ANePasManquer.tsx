import { getLocale, getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Award, ChevronRight, Flame, Sparkles } from "lucide-react";
import { DateTime } from "luxon";

import { Link } from "@/i18n/navigation.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { FriendAvatars, useHighlightReason } from "@/components/events/EventHighlightBadges.tsx";
import { cn } from "@/lib/utils.ts";
import type { Event } from "@/lib/types/Event";
import type { User } from "@/lib/types/User";
import type { Game } from "@/lib/types/Game";

import { EventBanner } from "../events/EventBanner.tsx";
import { lireStatut } from "./Agenda.tsx";
import { EtiquetteSection, Fiche, Punaise } from "./pieces.tsx";
import { lireMisEnAvant, lireViewer, type Position } from "./accueil-data.ts";

/**
 * À ne pas manquer : trois événements des deux prochaines semaines que
 * quelque chose fait remarquer — des amis y vont, le lieu les a choisis, ils
 * sont populaires.
 *
 * Les fiches reprennent le papier de l'agenda, mais avec la punaise neutre
 * d'un contenu et une inclinaison plus discrète : ce ne sont pas des
 * échéances, ce sont des propositions. Chacune dit en tête POURQUOI elle est
 * là ; sans cette ligne, le bloc ne serait qu'un second agenda.
 *
 * Rien ne s'affiche quand rien n'est marqué : un bloc vide n'apprendrait rien.
 */
export default async function ANePasManquer({
  position,
  jeu,
}: {
  position: Position | null;
  jeu: Game | null;
}) {
  const [t, locale, viewer, evenements] = await Promise.all([
    getTranslations("Home.misEnAvant"),
    getLocale(),
    lireViewer(),
    lireMisEnAvant(position, jeu),
  ]);

  if (evenements.length === 0) return null;

  // Le bloc couvre deux semaines, le calendrier un mois : « tout » s'ouvre sur
  // le mois du plus proche des événements montrés, sans quoi, en fin de mois,
  // ceux du mois suivant n'y seraient pas.
  const premier = evenements
    .map((evenement) => DateTime.fromISO(evenement.startDateTime).setZone("Europe/Paris"))
    .reduce((a, b) => (b < a ? b : a));
  const tout = `/events?highlighted=1&month=${premier.month}&year=${premier.year}`;

  return (
    <section>
      <EtiquetteSection
        icone={<Sparkles className="size-[18px]" aria-hidden />}
        action={
          <Link
            href={tout}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium"
          >
            {t("tout")}
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        }
      >
        {t("titre")}
        <span className="text-muted-foreground text-sm font-normal">· {t("sous")}</span>
      </EtiquetteSection>

      <div className="grid gap-6 pt-2 sm:grid-cols-3">
        {evenements.map((evenement, index) => (
          <CarteMisEnAvant
            key={evenement.id}
            evenement={evenement}
            viewer={viewer}
            locale={locale}
            pose={POSES[index % POSES.length]}
          />
        ))}
      </div>
    </section>
  );
}

/** Moins d'un degré : ce sont des propositions, pas des échéances punaisées en hâte. */
const POSES = ["rotate-[-0.6deg]", "rotate-[0.5deg]", "rotate-[-0.4deg]"] as const;

const TONS_RAISON = {
  friends: "text-violet-700 dark:text-violet-300",
  lairPick: "text-primary",
  popular: "text-orange-700 dark:text-orange-300",
} as const;

function CarteMisEnAvant({
  evenement,
  viewer,
  locale,
  pose,
}: {
  evenement: Event;
  viewer: User | null;
  locale: string;
  pose: string;
}) {
  const t = useTranslations("Home.agenda");
  const tMarques = useTranslations("EventHighlights");
  const raisonDe = useHighlightReason();
  const highlights = evenement.highlights;
  const raison = highlights ? raisonDe(highlights, evenement.lair?.name) : null;
  const debut = DateTime.fromISO(evenement.startDateTime).setZone("Europe/Paris").setLocale(locale);
  const statut = lireStatut(evenement, viewer);

  return (
    <Fiche className={cn("flex flex-col gap-3 p-3", pose)}>
      <Punaise ton="contenu" className="left-1/2 -ml-[11px]" />

      <Link href={`/events/${evenement.id}`} className="flex flex-col gap-3">
        <EventBanner src={evenement.banner ?? evenement.game?.banner} alt="" className="rounded-lg">
          <span className="absolute bottom-2.5 left-2.5 flex flex-col items-center rounded-lg bg-black/75 px-2.5 py-1 text-white">
            <span className="font-mono text-[10px] text-white/70 uppercase">{debut.toFormat("ccc")}</span>
            <span className="text-xl leading-tight font-bold">{debut.toFormat("d")}</span>
          </span>
        </EventBanner>

        <span className="flex flex-col gap-2 px-2">
          {raison && (
            <span className={cn("flex items-center gap-2 text-[13px] font-semibold", TONS_RAISON[raison.kind])}>
              {raison.kind === "friends" && highlights && <FriendAvatars friends={highlights.friends} size="md" />}
              {raison.kind === "lairPick" && <Award className="size-4 shrink-0" aria-hidden />}
              {raison.kind === "popular" && <Flame className="size-4 shrink-0" aria-hidden />}
              <span className="line-clamp-2">{raison.text}</span>
            </span>
          )}
          <span className="line-clamp-2 text-[17px] leading-snug font-semibold tracking-tight">{evenement.name}</span>
          <span className="text-muted-foreground text-xs">
            {[
              debut.toFormat("cccc d LLLL · HH'h'mm"),
              evenement.lair?.name,
              evenement.game?.name ?? evenement.gameName,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      </Link>

      <span className="flex flex-wrap items-center gap-2 px-2 pb-2">
        <Badge variant={statut.variante} className={statut.classe}>
          {t(`statut.${statut.cle}`, { count: statut.places ?? 0 })}
        </Badge>
        {highlights?.popular && raison?.kind !== "popular" && (
          <span className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-300">
            <Flame className="size-3 shrink-0" aria-hidden />
            {tMarques("popular")}
          </span>
        )}
      </span>
    </Fiche>
  );
}
