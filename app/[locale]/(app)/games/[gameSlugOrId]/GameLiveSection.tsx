import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";

import { readLiveEmbed } from "@/lib/media/live-embed.ts";
import type { GameStream } from "@/lib/types/GameStream";

/**
 * Le direct de l'éditeur, en tête de la fiche du jeu.
 *
 * En grand, et au-dessus de tout le reste : c'est le seul contenu de la page
 * qui soit périssable. Les outils, les actualités et l'agenda seront encore là
 * dans une heure ; le direct, non.
 *
 * La section DISPARAÎT quand rien ne tourne — pas d'état vide, pas de
 * silhouette. C'est le choix qu'ont déjà fait `LairLiveSection` et le bandeau
 * de l'accueil, pour la même raison : le cas courant est qu'il n'y ait aucun
 * direct, et lui réserver sa place laisserait un trou sur toutes les fiches.
 */
export default async function GameLiveSection({
  stream,
  gameName,
}: {
  stream: GameStream;
  gameName: string;
}) {
  const [t, locale, requestHeaders] = await Promise.all([
    getTranslations("Games.detail.live"),
    getLocale(),
    headers(),
  ]);

  const live = stream.live;

  // L'hôte réel, et non une valeur en dur : Twitch refuse un lecteur dont le
  // `parent` ne correspond pas au domaine qui l'intègre. YouTube s'en moque,
  // mais la reconnaissance d'URL est commune aux deux plateformes.
  const embed = live?.url ? readLiveEmbed(live.url, requestHeaders.get("host") ?? "localhost") : null;

  if (!live || !embed) {
    return null;
  }

  const startedAt = DateTime.fromISO(live.startedAt);
  // La durée écoulée plutôt que l'heure de début : ce qu'on veut savoir d'un
  // direct, c'est s'il commence ou s'il s'achève. Même calcul que sur un lieu.
  const elapsed = startedAt.isValid ? DateTime.now().diff(startedAt) : null;
  const duration =
    elapsed && elapsed.as("minutes") >= 1
      ? elapsed
          .shiftTo(...(elapsed.as("hours") >= 1 ? (["hours", "minutes"] as const) : (["minutes"] as const)))
          .mapUnits((value) => Math.floor(value))
          .reconfigure({ locale })
          .toHuman({ unitDisplay: "short" })
      : null;

  return (
    <section className="space-y-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-6 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-[7px] rounded-full bg-red-600 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[.1em] text-white">
          <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden />
          {t("badge")}
        </span>
        <h2 className="text-2xl font-bold text-white">
          {t("title", { channel: stream.channelTitle ?? gameName })}
        </h2>
        {duration && <p className="text-sm text-gray-300">{t("since", { duration })}</p>}
      </div>

      {live.title && <p className="text-lg text-gray-200">{live.title}</p>}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
        <iframe
          src={embed.embedUrl}
          title={live.title ?? t("badge")}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full"
        />
      </div>

      <a
        href={embed.channelUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block font-mono text-[11px] text-gray-400 hover:text-white"
      >
        {t("watchOn")}
      </a>
    </section>
  );
}
