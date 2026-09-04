import { getLocale, getTranslations } from "next-intl/server";
import { Newspaper } from "lucide-react";
import { DateTime } from "luxon";

import { Link } from "@/i18n/navigation.ts";
import { cn } from "@/lib/utils.ts";

import { EtiquetteSection, Fiche, Punaise, Tirage, poseCoupure } from "./pieces.tsx";
import { lireFil, MAX_FIL, TYPES_CONTENU, type EntreeFil, type TypeContenu } from "./accueil-data.ts";

/**
 * Le fil : actualités, vidéos et listes sur une seule file.
 *
 * Les directs n'y sont PAS. Ils ont leur bandeau en haut de page ; les
 * répéter ici montrerait deux fois la même chose à trois cents pixels d'écart.
 * Le fil garde ce qui se lit après coup.
 *
 * La bascule passe par l'URL, comme le filtre par jeu : un onglet est un lien,
 * pas un état de client.
 */
export default async function Fil({
  jeuChoisi,
  typeChoisi,
  params,
}: {
  jeuChoisi: string | null;
  typeChoisi: TypeContenu | null;
  params: Record<string, string | undefined>;
}) {
  const locale = await getLocale();
  const [t, tout] = await Promise.all([getTranslations("Home.fil"), lireFil(jeuChoisi, locale)]);

  const entrees = (typeChoisi ? tout.filter((entree) => entree.type === typeChoisi) : tout).slice(
    0,
    MAX_FIL,
  );

  const lien = (type: TypeContenu | undefined) => ({
    pathname: "/" as const,
    query: { ...params, fil: type },
  });

  return (
    <section>
      <EtiquetteSection
        icone={<Newspaper className="size-[18px]" aria-hidden />}
        action={
          <span className="bg-card inline-flex overflow-hidden rounded-lg border shadow-xs">
            <Bascule href={lien(undefined)} actif={typeChoisi === null} nombre={tout.length}>
              {t("tout")}
            </Bascule>
            {TYPES_CONTENU.map((type) => (
              <Bascule
                key={type}
                href={lien(type)}
                actif={typeChoisi === type}
                nombre={tout.filter((entree) => entree.type === type).length}
              >
                {t(`types.${type}`)}
              </Bascule>
            ))}
          </span>
        }
      >
        {t("titre")}
      </EtiquetteSection>

      {entrees.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          {t("vide")}
        </p>
      ) : (
        <div className="flex flex-col gap-5 pt-3">
          {entrees.map((entree, index) => (
            <Coupure
              key={`${entree.type}-${entree.id}`}
              entree={entree}
              locale={locale}
              genre={t(`types.${entree.type}`)}
              index={index}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Bascule({
  href,
  actif,
  nombre,
  children,
}: {
  href: { pathname: "/"; query: Record<string, string | undefined> };
  actif: boolean;
  nombre: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={actif ? "page" : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 border-r px-3.5 text-sm font-medium whitespace-nowrap transition-colors last:border-r-0",
        actif ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      <span className="font-mono text-[11px] opacity-70">{nombre}</span>
    </Link>
  );
}

/** Une coupure du fil. Elle penche à peine : une bande large ne penche pas. */
function Coupure({
  entree,
  locale,
  genre,
  index,
}: {
  entree: EntreeFil;
  locale: string;
  genre: string;
  index: number;
}) {
  const quand = DateTime.fromISO(entree.publieLe).setLocale(locale).toRelative();

  return (
    <Fiche className={cn("hover:bg-accent transition-colors", poseCoupure(index))}>
      {index % 2 === 1 && <Punaise ton="contenu" className="left-11" />}
      <Link href={entree.href} className="flex gap-4 p-4">
        <Tirage
          src={entree.vignette}
          type={entree.type}
          cadrage={entree.cadrage}
          duree={entree.duree}
          className="h-[100px] w-[148px]"
        />
        <span className="flex min-w-0 flex-grow flex-col gap-2">
          <span className="bg-muted text-muted-foreground w-fit rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium tracking-wider uppercase">
            {genre}
          </span>
          <span className="line-clamp-2 text-lg leading-6 font-semibold tracking-tight">
            {entree.titre}
          </span>
          <span className="border-border h-px border-t" aria-hidden />
          <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            {entree.source && (
              <>
                <span className="truncate">{entree.source}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span>{quand}</span>
          </span>
        </span>
      </Link>
    </Fiche>
  );
}
