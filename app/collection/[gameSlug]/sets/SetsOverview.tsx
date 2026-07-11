import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Layers, LayoutGrid } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CompletionBar } from "@/app/collection/CollectionOverview";
import type { SetCompletion } from "@/lib/db/collection";

export default async function SetsOverview({
  gameSlug,
  gameName,
  sets,
}: {
  gameSlug: string;
  gameName: string;
  sets: SetCompletion[];
}) {
  const t = await getTranslations("Collection");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/collection/${gameSlug}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("game.backToCollection", { game: gameName })}
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">{t("sets.title")}</h1>
          <p className="text-muted-foreground">{t("sets.subtitle", { game: gameName })}</p>
        </div>
      </div>

      {sets.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t("sets.noSets")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sets.map((set) => (
            <Link
              key={set.setCode}
              href={`/collection/${gameSlug}?setCode=${encodeURIComponent(set.setCode)}`}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
            >
              <Badge variant="outline" className="w-fit font-mono text-xs">
                {set.setCode}
              </Badge>
              <CompletionBar
                label={t("masterSet.short")}
                owned={set.masterOwned}
                total={set.masterTotal}
                tone="master"
                icon={<Layers className="size-4 text-primary" />}
              />
              <CompletionBar
                label={t("gameSet.short")}
                owned={set.gameOwned}
                total={set.gameTotal}
                tone="game"
                icon={<LayoutGrid className="size-4 text-emerald-500" />}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
