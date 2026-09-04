import { getLocale, getTranslations } from "next-intl/server";
import { Check, MapPin, Plus, Users } from "lucide-react";
import { DateTime } from "luxon";

import { Link } from "@/i18n/navigation.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { readOpeningState } from "@/lib/lairs/opening-hours.ts";
import { distanceKm } from "@/lib/lairs/creation.ts";
import type { Deck } from "@/lib/types/Deck";

import { Fiche } from "./pieces.tsx";
import {
  lireDecksEnVedette,
  lireLieux,
  lireMesDecks,
  lireSondageEnAttente,
  lireViewer,
  MAX_LIEUX,
  type Position,
} from "./accueil-data.ts";

/**
 * La colonne de droite : ce qui ne bouge pas au rythme du fil.
 *
 * Ses tuiles sont les mêmes fiches que l'agenda, à peine inclinées, mais elles
 * ne se chevauchent pas : on ne hiérarchise pas trois listes qui n'ont rien à
 * voir entre elles.
 */

const POSES_COLONNE = ["rotate-[0.7deg]", "rotate-[-0.8deg]", "rotate-[0.5deg]"] as const;

function TuileColonne({
  rang,
  titre,
  action,
  children,
}: {
  rang: number;
  titre: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Fiche className={cn("flex flex-col gap-3.5 p-5", POSES_COLONNE[rang] ?? "")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 pb-3">
        <h2 className="text-base font-semibold tracking-tight">{titre}</h2>
        {action}
      </div>
      {children}
    </Fiche>
  );
}

/**
 * Les lieux.
 *
 * Connecté, ce sont les lieux suivis, avec leur état d'ouverture. Sinon les
 * lieux autour de la position, ordonnés par distance — et la distance
 * s'affiche, puisque c'est elle qui décide de l'ordre.
 */
export async function TuileLieux({ position, rang }: { position: Position | null; rang: number }) {
  const [t, locale, viewer, lieux] = await Promise.all([
    getTranslations("Home.lieux"),
    getLocale(),
    lireViewer(),
    lireLieux(position),
  ]);

  if (lieux.length === 0) {
    return null;
  }

  const suivis = (viewer?.lairs ?? []).length > 0;
  const origine = position ? { type: "Point" as const, coordinates: [position.longitude, position.latitude] as [number, number] } : null;

  return (
    <TuileColonne
      rang={rang}
      titre={suivis ? t("titreSuivis") : t("titreProches")}
      action={
        <Link href="/lairs" className="text-muted-foreground hover:text-foreground text-xs font-medium">
          {suivis ? t("decouvrir") : t("voirTout")}
        </Link>
      }
    >
      <ul className="flex flex-col gap-3.5">
        {lieux.slice(0, MAX_LIEUX).map((lieu) => {
          const ouverture = readOpeningState(lieu.options?.openingHours, locale);
          const distance =
            origine && lieu.location ? distanceKm(origine, lieu.location) : null;

          return (
            <li key={lieu.id}>
              <Link href={`/lairs/${lieu.id}`} className="flex items-start gap-3">
                <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold">
                  {initiales(lieu.name)}
                </span>
                <span className="flex min-w-0 flex-grow flex-col gap-0.5">
                  <span className="truncate text-sm leading-5 font-semibold tracking-tight">
                    {lieu.name}
                  </span>
                  <span className="text-muted-foreground text-xs leading-4">
                    <span
                      aria-hidden
                      className={cn(
                        "mr-1.5 inline-block size-1.5 rounded-full align-middle",
                        ouverture.isOpen === true ? "bg-emerald-500" : "bg-muted-foreground/50",
                      )}
                    />
                    {ouverture.isOpen === true && ouverture.closesAt
                      ? t("ouvertJusqua", { heure: ouverture.closesAt })
                      : ouverture.isOpen === false
                        ? t("ferme")
                        : t("horairesInconnus")}
                  </span>
                  {distance != null && (
                    <span className="text-muted-foreground text-xs leading-4 tabular-nums">
                      {t("distance", { km: distance.toFixed(1) })}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </TuileColonne>
  );
}

/** Mes decks — ou, sans compte, les listes que la communauté met en avant. */
export async function TuileDecks({ jeuChoisi, rang }: { jeuChoisi: string | null; rang: number }) {
  const [t, locale, viewer] = await Promise.all([
    getTranslations("Home.decks"),
    getLocale(),
    lireViewer(),
  ]);

  const miens = viewer ? await lireMesDecks() : [];
  const decks: Deck[] = miens.length > 0 ? miens : await lireDecksEnVedette(jeuChoisi);

  if (decks.length === 0) {
    return null;
  }

  const aMoi = miens.length > 0;

  return (
    <TuileColonne
      rang={rang}
      titre={aMoi ? t("titreMiens") : t("titreVedette")}
      action={
        aMoi ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/decks">
              <Plus aria-hidden />
              {t("nouveau")}
            </Link>
          </Button>
        ) : (
          <Link
            href="/decks/library"
            className="text-muted-foreground hover:text-foreground text-xs font-medium"
          >
            {t("explorer")}
          </Link>
        )
      }
    >
      <ul className="flex flex-col gap-3.5">
        {decks.map((deck) => (
          <li key={deck.id}>
            <Link href={`/decks/${deck.id}`} className="flex flex-wrap items-center gap-2">
              <span className="flex min-w-0 flex-grow flex-col gap-0.5">
                <span className="truncate text-sm leading-5 font-semibold tracking-tight">
                  {deck.name}
                </span>
                <span className="text-muted-foreground text-xs leading-4">
                  {aMoi
                    ? t("modifie", {
                        quand:
                          DateTime.fromJSDate(new Date(deck.updatedAt)).setLocale(locale).toRelative() ??
                          "",
                      })
                    : (deck.creatorName ?? "")}
                </span>
              </span>
              {aMoi && deck.visibility !== "public" && (
                <Badge variant="secondary">{t("brouillon")}</Badge>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </TuileColonne>
  );
}

/**
 * Le sondage d'un groupe de jeu, quand il en attend un.
 *
 * La tuile ne s'affiche QUE dans ce cas : un groupe sans question ouverte n'a
 * rien à dire ici, et l'Établi du groupe montre déjà tout le reste.
 */
export async function TuileSondage({ rang }: { rang: number }) {
  const [t, locale, attente] = await Promise.all([
    getTranslations("Home.sondage"),
    getLocale(),
    lireSondageEnAttente(),
  ]);

  if (!attente) {
    return null;
  }

  const { session, groupe } = attente;
  const votants = new Set(session.slots?.flatMap((creneau) => creneau.voterIds ?? []) ?? []).size;

  return (
    <TuileColonne
      rang={rang}
      titre={
        <span className="flex items-center gap-2">
          <Users className="size-[18px]" aria-hidden />
          {groupe}
        </span>
      }
      action={<Badge variant="secondary">{t("aRepondre")}</Badge>}
    >
      <p className="text-muted-foreground text-sm leading-5">{session.title}</p>

      <ul className="flex flex-col gap-2.5">
        {(session.slots ?? []).slice(0, 3).map((creneau) => (
          <li key={creneau.id} className="flex items-baseline justify-between gap-2 text-sm">
            <span>
              {DateTime.fromISO(creneau.startsAt).setLocale(locale).toFormat("cccc d LLLL")}
            </span>
            <span className="text-muted-foreground font-mono text-[11px]">
              {(creneau.voterIds ?? []).length}
            </span>
          </li>
        ))}
      </ul>

      <Button asChild className="w-full">
        <Link href={`/play-groups/${session.playGroupId}`}>{t("repondre", { count: votants })}</Link>
      </Button>
    </TuileColonne>
  );
}

/**
 * La carte d'inscription : la seule pièce propre au visiteur.
 *
 * Ses arguments ne sont pas génériques — chacun répond à quelque chose que le
 * visiteur vient de voir plus haut sur la page : les lieux, les événements,
 * les decks, les directs.
 */
export async function CarteInscription({ rang }: { rang: number }) {
  const t = await getTranslations("Home.inscription");
  const arguments_ = ["lieux", "tournois", "decks", "directs"] as const;

  return (
    <Fiche className={cn("border-foreground flex flex-col gap-3.5 p-5", POSES_COLONNE[rang] ?? "")}>
      <h2 className="border-foreground border-b-2 pb-3 text-base font-semibold tracking-tight">
        {t("titre")}
      </h2>
      <p className="text-muted-foreground text-sm leading-5">{t("gratuit")}</p>

      <ul className="flex flex-col gap-2.5">
        {arguments_.map((cle) => (
          <li key={cle} className="flex gap-2.5 text-sm leading-5">
            <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            {t(`arguments.${cle}`)}
          </li>
        ))}
      </ul>

      <Button asChild className="w-full">
        <Link href="/login">{t("creer")}</Link>
      </Button>
      <p className="text-muted-foreground text-center text-xs">
        {t.rich("deja", {
          lien: (texte) => (
            <Link href="/login" className="text-foreground font-semibold underline-offset-2 hover:underline">
              {texte}
            </Link>
          ),
        })}
      </p>
    </Fiche>
  );
}

/** « Le Repaire du Dragon » → « LR ». Deux lettres suffisent à distinguer. */
function initiales(nom: string): string {
  const mots = nom
    .split(/\s+/)
    .filter((mot) => mot.length > 2)
    .slice(0, 2);
  return (mots.length > 0 ? mots : nom.split(/\s+/))
    .map((mot) => mot[0]?.toUpperCase() ?? "")
    .join("");
}

/** Le repère de position du visiteur, et de quoi le changer. */
export async function PuceLocalisation({ position }: { position: Position | null }) {
  const t = await getTranslations("Home.position");

  return (
    <Link
      href="/events"
      className="bg-card text-muted-foreground hover:text-foreground inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors"
    >
      <MapPin className="size-3.5" aria-hidden />
      {position ? (
        <>
          {position.nom
            ? t.rich("autourDe", {
                lieu: position.nom,
                rayon: position.rayonKm,
                nom: (texte) => <span className="text-foreground font-semibold">{texte}</span>,
              })
            : t("autourDeMoi", { rayon: position.rayonKm })}
          <span className="text-foreground border-b font-medium">{t("changer")}</span>
        </>
      ) : (
        <span className="text-foreground font-medium">{t("definir")}</span>
      )}
    </Link>
  );
}
