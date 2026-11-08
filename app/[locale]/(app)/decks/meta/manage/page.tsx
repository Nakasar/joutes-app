import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChartLine } from "lucide-react";

import { AccountPanelSkeleton } from "@/components/AccountPanelSkeleton.tsx";
import { Link } from "@/i18n/navigation.ts";
import { auth } from "@/lib/auth.ts";
import { hasPermission } from "@/lib/db/permissions.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { searchDecks } from "@/lib/db/decks.ts";
import { countMetaDecks, getSingleSourceBatch, listMetaSources } from "@/lib/db/meta-decks.ts";
import { META_DECKS_PERMISSION } from "@/lib/meta/permissions.ts";
import { resolveMetaSettings } from "@/lib/meta/settings.ts";
import { readPage, toURLSearchParams } from "@/lib/navigation/url-query.ts";
import { cn } from "@/lib/utils.ts";
import { MetaGamePicker } from "./MetaGamePicker.tsx";
import { MetaImportForm } from "./MetaImportForm.tsx";
import { MetaDeckList } from "./MetaDeckList.tsx";
import { MetaSettingsForm } from "./MetaSettingsForm.tsx";

export const metadata: Metadata = {
  title: "Méta des decks",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS = [
  { key: "import", label: "Importer" },
  { key: "decks", label: "Decks méta" },
  { key: "settings", label: "Réglages" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function MetaManageContent({ searchParams }: { searchParams: SearchParams }) {
  const [session, params] = await Promise.all([auth.api.getSession({ headers: await headers() }), searchParams]);

  // L'écran n'existe pas pour qui n'a pas la permission : pas de porte à pousser.
  if (!session?.user?.id || !(await hasPermission(META_DECKS_PERMISSION))) {
    notFound();
  }

  const games = (await getAllGames()).filter((game) => game.features?.decks || game.slug === "riftbound");
  const requested = first(params.game);
  const game =
    games.find((candidate) => candidate.slug === requested || candidate.id === requested) ??
    games.find((candidate) => candidate.slug === "riftbound") ??
    games[0];

  if (!game) {
    notFound();
  }

  const tabParam = first(params.tab);
  const tab: TabKey = TABS.some((candidate) => candidate.key === tabParam) ? (tabParam as TabKey) : "import";
  const gameKey = game.slug ?? game.id;
  const tabHref = (key: TabKey) => `/decks/meta/manage?game=${encodeURIComponent(gameKey)}${key === "import" ? "" : `&tab=${key}`}`;

  const total = await countMetaDecks(game.id);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-7 pb-16 sm:px-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
              <ChartLine className="size-7 text-primary" aria-hidden />
              Méta des decks
            </h1>
            <p className="text-[15px] text-muted-foreground">
              Les decks de tournoi importés ou marqués ici deviennent des decks publics et nourrissent les
              statistiques de la méta du jeu.
            </p>
          </div>
          {games.length > 1 && (
            <MetaGamePicker games={games.map((g) => ({ key: g.slug ?? g.id, name: g.name }))} value={gameKey} tab={tab} />
          )}
        </div>
      </header>

      <nav aria-label="Sections" className="-mx-4 flex gap-6 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {TABS.map((candidate) => (
          <Link
            key={candidate.key}
            href={tabHref(candidate.key)}
            aria-current={candidate.key === tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 border-transparent py-3 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              candidate.key === tab && "border-primary font-semibold text-foreground"
            )}
          >
            {candidate.label}
            {candidate.key === "decks" && <span className="ml-1.5 font-mono text-xs">{total}</span>}
          </Link>
        ))}
      </nav>

      {tab === "import" && (
        <MetaImportForm
          gameId={game.id}
          gameName={game.name}
          formats={(game.formats ?? []).map((format) => format.name)}
          decksHref={tabHref("decks")}
        />
      )}

      {tab === "decks" && <MetaDecksTab gameId={game.id} gameKey={gameKey} params={params} />}

      {tab === "settings" && <MetaSettingsForm gameId={game.id} settings={resolveMetaSettings(game.metaSettings)} />}
    </div>
  );
}

async function MetaDecksTab({
  gameId,
  gameKey,
  params,
}: {
  gameId: string;
  gameKey: string;
  params: Record<string, string | string[] | undefined>;
}) {
  const source = first(params.source);
  const page = readPage(toURLSearchParams(params));
  const [result, sources, sourceBatch] = await Promise.all([
    searchDecks({
      gameId,
      metaOnly: true,
      metaSource: source || undefined,
      sortBy: "meta.eventDate",
      sortOrder: "desc",
      page,
      limit: 20,
    }),
    listMetaSources(gameId),
    source ? getSingleSourceBatch(gameId, source) : null,
  ]);

  return (
    <MetaDeckList
      decks={result.decks.map((deck) => ({
        id: deck.id,
        name: deck.name,
        legendName: deck.legendName,
        coverImage: deck.coverImage,
        creatorName: deck.creatorName,
        domains: deck.domains ?? [],
        visibility: deck.visibility,
        meta: deck.meta
          ? {
              imported: deck.meta.imported,
              source: deck.meta.source,
              eventDate: new Date(deck.meta.eventDate).toISOString(),
              placement: deck.meta.placement,
            }
          : undefined,
      }))}
      sources={sources.map((row) => ({ ...row, lastEventDate: new Date(row.lastEventDate).toISOString() }))}
      activeSource={source}
      sourceBatch={sourceBatch ?? undefined}
      page={result.page}
      totalPages={result.totalPages}
      total={result.total}
      baseHref={`/decks/meta/manage?game=${encodeURIComponent(gameKey)}&tab=decks`}
    />
  );
}

export default function MetaManagePage(props: Parameters<typeof MetaManageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl px-4 pt-7 sm:px-8">
          <AccountPanelSkeleton cards={2} label="Chargement de la méta" />
        </div>
      }
    >
      <MetaManageContent {...props} />
    </Suspense>
  );
}
