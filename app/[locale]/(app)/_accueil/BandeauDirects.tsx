import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { LiveBadge } from "@/components/users/LiveBadge.tsx";
import { Tirage } from "./pieces.tsx";
import { lireDirects, type Position } from "./accueil-data.ts";

/**
 * Ce qui se passe à l'instant, dans les lieux que la page regarde.
 *
 * La section DISPARAÎT quand rien ne tourne — elle n'a pas d'état vide. C'est
 * déjà le choix de `LairLiveSection` sur la vitrine d'un lieu : le cas courant
 * étant qu'il n'y ait pas de direct, un cadre « aucun direct » annoncerait un
 * contenu qui ne viendra pas.
 *
 * C'est aussi pour cela qu'elle n'a pas de squelette : on ne réserve pas la
 * place de ce qui, la plupart du temps, n'existe pas.
 */
export default async function BandeauDirects({ position }: { position: Position | null }) {
  const [t, directs] = await Promise.all([getTranslations("Home.directs"), lireDirects(position)]);

  if (directs.length === 0) {
    return null;
  }

  return (
    <section className="border-destructive/45 bg-destructive/5 rounded-xl border p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <LiveBadge label={t("enCours")} />
        <h2 className="text-base font-semibold tracking-tight">
          {t("titre", { count: directs.length })}
        </h2>
        <Link
          href="/lairs"
          className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-sm font-medium"
        >
          {t("tous")}
          <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {directs.map((direct) => (
          <Link
            key={direct.lairId}
            href={`/lairs/${direct.lairId}`}
            className="bg-card hover:bg-accent flex gap-4 rounded-lg border p-3 transition-colors"
          >
            <Tirage type="direct" className="h-[84px] w-[148px]" />
            <span className="flex min-w-0 flex-col gap-1 pt-0.5">
              <span className="text-sm leading-5 font-semibold tracking-tight">{direct.titre}</span>
              <span className="text-muted-foreground text-xs">{direct.lieu}</span>
              {direct.live.viewers != null && (
                <span className="text-muted-foreground text-xs">
                  {t("spectateurs", { count: direct.live.viewers })}
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
