import { BoosterCard } from "@/lib/types/booster";
import ReactMarkdown from "react-markdown";
import CardSearchBar from "./CardSearchBar";
import CollectionManager from "./CollectionManager";
import db from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Metadata } from "next/types";
import { getErratasByCardId } from "@/lib/db/erratas";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import BanCardButton from "@/app/games/[gameSlugOrId]/cards/[cardId]/BanCardButton";
import EditErrataDialog from "@/components/EditErrataDialog";
import DeleteErrataButton from "@/components/DeleteErrataButton";
import ErrataVoteButtons from "@/components/ErrataVoteButtons";
import {isAdmin} from "@/lib/config/admins";
import {hasPermission} from "@/lib/db/permissions";
import AddErrataButton from "@/app/games/[gameSlugOrId]/cards/[cardId]/AddErrataButton";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cardId: string }>;
}): Promise<Metadata> {
  const { cardId } = await params;
  const t = await getTranslations("Games");

  const card = await db.collection<BoosterCard>("cards").findOne({ id: cardId });

  if (!card) {
    return {
      title: t("cards.detail.metadata.notFoundTitle"),
    };
  }

  const erratas = await getErratasByCardId(cardId);

  return {
    title: t("cards.detail.metadata.title", { cardName: card.name }),
    description: t("cards.detail.metadata.description", { cardName: card.name, count: erratas.length, banned: card.banned ? t("cards.detail.metadata.banned") : "" }),
    openGraph: {
      title: t("cards.detail.metadata.title", { cardName: card.name }),
      description: t("cards.detail.metadata.description", { cardName: card.name, count: erratas.length, banned: card.banned ? t("cards.detail.metadata.banned") : "" }),
      images: [card.image],
    },
  };
}

export default async function RiftboundCardDetailPage({
  params,
}: {
  params: Promise<{ cardId: string; gameSlugOrId: string }>;
}) {
  const { cardId, gameSlugOrId } = await params;
  const locale = await getLocale();
  const t = await getTranslations("Games");

  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;

  const card = await db.collection<BoosterCard>("cards").findOne({ id: cardId });

  if (!card) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">{t("cards.detail.notFoundTitle")}</h1>
        <Button asChild>
          <Link href={`/games/${gameSlugOrId}/cards`} className="text-blue-600 hover:underline">
            ← {t("cards.detail.backToList")}
          </Link>
        </Button>

        <p>{t("cards.detail.notFoundMessage", { cardId })}</p>
      </div>
    );
  }

  const erratas = await getErratasByCardId(cardId, userId);
  const userIsAdmin = isAdmin(session?.user?.email);
  const userCanVoteErratas = await hasPermission("erratas:vote");

  return (
    <div className="container mx-auto p-6">
      <Button asChild>
        <Link href={`/games/${"riftbound"}/cards`} className="text-blue-600 hover:underline">
          ← {t("cards.detail.backToList")}
        </Link>
      </Button>

      <div className="mb-8 flex justify-center">
        <CardSearchBar />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <img
            src={card.image}
            alt={card.name}
            className="w-full rounded-lg shadow-lg"
          />
        </div>

        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h1 className="text-3xl font-bold">{card.name}</h1>
            {card.banned && (
              <span className="bg-red-600 text-white text-sm font-semibold px-2 py-1 rounded">
                {t("cards.detail.banned")}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mb-6">
            <p className="text-muted-foreground">
              {card.setCode} #{card.collectorNumber}
            </p>
            {userIsAdmin && (
              <BanCardButton cardId={cardId} banned={card.banned} />
            )}
          </div>

          {userId && (
            <div className="mb-6">
              <CollectionManager
                cardId={card.id}
                gameSlug="riftbound"
                cardName={card.name}
                setCode={card.setCode}
                collectorNumber={card.collectorNumber}
                image={card.image}
              />
            </div>
          )}

          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold">
                {t("cards.detail.errataSectionTitle")}
              </h2>
              {userIsAdmin && <AddErrataButton cardId={cardId} />}
            </div>

            {erratas.length === 0 ? (
              <p className="text-muted-foreground">
                {t("cards.detail.noErrata")}
              </p>
            ) : (
              <div className="space-y-4">
                {erratas.map((errata) => (
                  <div
                    key={errata.id}
                    className={`border rounded-lg p-4 bg-card ${errata.deprecatedAt ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ${
                            errata.type === "errata"
                              ? "bg-red-100 text-red-800"
                              : errata.type === "clarification"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          {errata.type === "errata"
                            ? t("cards.detail.errataTypes.errata")
                            : errata.type === "clarification"
                            ? t("cards.detail.errataTypes.clarification")
                            : t("cards.detail.errataTypes.ruling")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {DateTime.fromJSDate(new Date(errata.errataDate)).setLocale(locale).toLocaleString(DateTime.DATE_MED)}
                        </span>
                      </div>
                      {userIsAdmin && (
                        <div className="flex gap-1">
                          <EditErrataDialog errata={errata} cardId={cardId} />
                          <DeleteErrataButton errataId={errata.id} cardId={cardId} />
                        </div>
                      )}
                    </div>
                    {errata.deprecatedAt && (
                      <span className="inline-block mb-2 text-xs font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        {t("cards.detail.deprecated")}
                      </span>
                    )}
                    <div className="prose prose-sm dark:prose-invert max-w-none ">
                      <ReactMarkdown>{errata.details}</ReactMarkdown>
                    </div>
                    {errata.source && (
                      <div className="mt-2 pt-2 border-t">
                        <a
                          href={errata.source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {t("cards.detail.source")} →
                        </a>
                      </div>
                    )}
                    {errata.deprecatedAt && (
                      <div className="mt-2 pt-2 border-t">
                        <span className="text-xs text-muted-foreground italic">
                          {t("cards.detail.deprecatedOn", { date: DateTime.fromJSDate(new Date(errata.deprecatedAt)).setLocale(locale).toLocaleString(DateTime.DATE_MED) })}
                        </span>
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t">
                      <ErrataVoteButtons
                        errataId={errata.id}
                        votes={errata.votes}
                        userCanVote={userCanVoteErratas}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
