"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  CardZoom,
  CostCurve,
  GroupCounts,
  LimitedCard,
  SeatStrip,
  useFaceLine,
} from "@/components/play/limited/limited-kit";
import { Button } from "@/components/ui/button";
import { stacks, type LimitedView, type Pulled } from "@/lib/engine/limited";
import {
  faceCurve,
  groupCounts,
  mainOnly,
  PACK_SORTS,
  sortPack,
  type Faces,
  type PackSort,
} from "@/lib/engine/limited-faces";
import { cn } from "@/lib/utils";

/** Le draft : un paquet devant soi, une carte à prendre, le reste passe au voisin. */
export function DraftScreen({
  view,
  seat,
  faces,
  packSize,
  onPick,
}: {
  view: LimitedView<unknown>;
  seat: number;
  faces: Faces;
  /** Le nombre de cartes d'un booster au début d'un tour de table. */
  packSize: number;
  /** Prend une carte ; rend le refus du moteur, s'il y en a un. */
  onPick: (card: Pulled) => string | null;
}) {
  const t = useTranslations("Games.Limited");
  const line = useFaceLine();
  const [sort, setSort] = useState<PackSort>("rarity");
  // La carte regardée, par sa place dans le paquet du moteur.
  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState<Pulled | null>(null);

  const pack = view.you?.pack ?? null;
  const pool = view.you?.pool ?? [];
  // Avant les boosters, un jeu peut faire tourner d'autres paquets : les leaders
  // de Star Wars: Unlimited, un par booster (règle 10.3.3.a).
  const prelude = view.prelude ?? 0;
  const leaders = view.round < prelude;
  const size = leaders ? view.rounds : packSize;
  const booster = view.round - prelude;
  const chosen = pack && selected !== null ? (pack[selected] ?? null) : null;
  const mainPool = mainOnly(
    pool.map((card) => card.code),
    faces,
  );
  const chosenFace = chosen ? faces.get(chosen.code) : undefined;
  const title = leaders
    ? pack
      ? t("draft.titleLeaders", { pick: size - pack.length + 1, size })
      : t("draft.titleLeadersWaiting")
    : pack
      ? t("draft.title", { round: booster + 1, rounds: view.rounds, pick: size - pack.length + 1, size })
      : t("draft.titleWaiting", { round: booster + 1, rounds: view.rounds });
  const passing = leaders
    ? t(view.pass_next ? "draft.leadersNext" : "draft.leadersPrevious")
    : t(view.pass_next ? "draft.passNext" : "draft.passPrevious", { set: view.packs[booster] ?? "" });

  const pick = (card: Pulled) => {
    const refused = onPick(card);
    if (refused) toast.error(refused);
    setSelected(null);
    setZoom(null);
  };

  const take = chosen && (
    <Button className="self-start" onClick={() => pick(chosen)}>
      {t("draft.take")}
    </Button>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <SeatStrip view={view} seat={seat} />
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <div className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{passing}</p>
            </div>
            <div className="inline-flex overflow-hidden rounded-lg border" role="group" aria-label={t("draft.sort")}>
              {PACK_SORTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={sort === value}
                  onClick={() => setSort(value)}
                  className={cn(
                    "min-h-9 px-3 text-xs transition",
                    sort === value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value === "group" ? faces.groupWord : t(`draft.sortBy.${value}`)}
                </button>
              ))}
            </div>
          </div>

          {pack ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
              {sortPack(pack, faces, sort).map((card) => {
                const index = pack.indexOf(card);
                return (
                  <LimitedCard
                    key={index}
                    code={card.code}
                    foil={card.foil}
                    faces={faces}
                    showRarity
                    selected={selected === index}
                    label={t("draft.look", { name: faces.name(card.code) })}
                    onClick={() => setSelected(index)}
                    onDoubleClick={() => pick(card)}
                    onInspect={() => {
                      setSelected(index);
                      setZoom(card);
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground" role="status">
              {t("draft.waiting")}
            </p>
          )}
          {pack && <p className="text-xs text-muted-foreground">{t("draft.hint")}</p>}
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5" aria-live="polite">
          <h2 className="font-semibold">{t("draft.selected")}</h2>
          {chosen ? (
            <>
              <div className="flex flex-row gap-3">
                <LimitedCard code={chosen.code} foil={chosen.foil} faces={faces} className="w-24 shrink-0" />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium">{faces.name(chosen.code)}</span>
                  <span className="text-xs text-muted-foreground">{line(chosenFace, chosen.foil)}</span>
                </div>
              </div>
              {chosenFace?.text && <p className="whitespace-pre-line text-sm text-muted-foreground">{chosenFace.text}</p>}
              {take}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("draft.none")}</p>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">{t("draft.picks", { count: pool.length })}</h2>
          {pool.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("draft.noPicks")}</p>
          ) : (
            <>
              <GroupCounts counts={groupCounts(mainPool, faces)} faces={faces} />
              <CostCurve curve={faceCurve(mainPool, faces)} />
              <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto text-sm">
                {stacks(pool).map((stack) => (
                  <li key={stack.code}>
                    <button
                      type="button"
                      onClick={() => setZoom({ code: stack.code, foil: stack.foil })}
                      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-secondary"
                    >
                      <span className="w-6 shrink-0 text-muted-foreground">×{stack.count}</span>
                      <span className="truncate">{faces.name(stack.code)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </aside>

      <CardZoom
        code={zoom?.code ?? null}
        foil={zoom?.foil}
        faces={faces}
        onClose={() => setZoom(null)}
        action={
          zoom && chosen && zoom.code === chosen.code && Boolean(zoom.foil) === Boolean(chosen.foil) ? take : undefined
        }
      />
    </div>
  );
}
