import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { LiveBadge } from "@/components/users/LiveBadge.tsx";
import { Tirage } from "./pieces.tsx";
import { lireDirects, lireViewer, type Position } from "./accueil-data.ts";

/**
 * Ce qui se passe à l'instant : les directs des lieux que la page regarde, et
 * ceux des éditeurs des jeux suivis.
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
  const [t, viewer, directs] = await Promise.all([
    getTranslations("Home.directs"),
    lireViewer(),
    lireDirects(position),
  ]);

  if (directs.length === 0) {
    return null;
  }

  /*
   * Le titre nomme la source, et ne peut donc le faire que si elle est unique.
   * « Dans vos lieux » ne se dit qu'à qui en suit : les mêmes directs, pour un
   * visiteur, viennent des lieux autour de lui et ne sont les siens en rien.
   * Même partage que `TuileLieux`, et pour la même raison — c'est la condition
   * exacte sur laquelle `lireLieux` choisit sa source. Dès qu'un direct
   * d'éditeur s'y mêle, aucune des deux phrases n'est vraie : le titre devient
   * neutre plutôt que faux.
   */
  const jeux = directs.some((direct) => direct.jeu);
  const suivis = (viewer?.lairs ?? []).length > 0;
  const titre = jeux ? "titreMixte" : suivis ? "titreSuivis" : "titreProches";

  return (
    <section className="border-destructive/45 bg-destructive/5 rounded-xl border p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <LiveBadge label={t("enCours")} />
        <h2 className="text-base font-semibold tracking-tight">
          {t(titre, { count: directs.length })}
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
            key={direct.cle}
            href={direct.href}
            className="bg-card hover:bg-accent flex gap-4 rounded-lg border p-3 transition-colors"
          >
            <Tirage type="direct" src={direct.vignette} className="h-[84px] w-[148px]" />
            <span className="flex min-w-0 flex-col gap-1 pt-0.5">
              <span className="text-sm leading-5 font-semibold tracking-tight">{direct.titre}</span>
              <span className="text-muted-foreground text-xs">{direct.source}</span>
              {direct.viewers != null && (
                <span className="text-muted-foreground text-xs">
                  {t("spectateurs", { count: direct.viewers })}
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
