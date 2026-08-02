import {BoosterCard} from "@/lib/types/booster";
import CardSearchBar from "./CardSearchBar";
import CollectionManager from "./CollectionManager";
import AddToWishlistButton from "@/components/AddToWishlistButton";
import CardSocialOwnership, {type FriendOwnership, type PlayGroupOwnership} from "./CardSocialOwnership";
import db from "@/lib/mongodb";
import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import {Metadata} from "next/types";
import {getErratasByCardId} from "@/lib/db/erratas";
import {Button} from "@/components/ui/button";
import Link from "next/link";
import BanCardButton from "@/app/games/[gameSlugOrId]/cards/[cardId]/BanCardButton";
import EditErrataDialog from "@/components/EditErrataDialog";
import DeleteErrataButton from "@/components/DeleteErrataButton";
import ErrataVoteButtons from "@/components/ErrataVoteButtons";
import ReportButton from "@/components/ReportButton";
import {isAdmin} from "@/lib/config/admins";
import {hasPermission} from "@/lib/db/permissions";
import AddErrataButton from "@/app/games/[gameSlugOrId]/cards/[cardId]/AddErrataButton";
import {getLocale, getTranslations} from "next-intl/server";
import {DateTime} from "luxon";
import {getGameBySlugOrId} from "@/lib/db/games";
import {ObjectId} from "mongodb";
import {GameToolsNavBar} from "@/components/games/GameToolsNavBar";
import {Errata} from "@/lib/types/errata";
import {getCardsByNames} from "@/lib/db/cards";
import {getCardOwnershipByOwners, type CollectionOwner} from "@/lib/db/collection";
import {getUserById, getUsersByIds, toPublicUser} from "@/lib/db/users";
import {getPlayGroupsForUser} from "@/lib/db/play-groups";
import {getWishlistIdsContainingCard} from "@/lib/db/wishlists";
import {extractBracketedMentions} from "@/lib/errata-markdown";
import {annotateCardText} from "@/lib/card-text-markdown";
import GameMarkdown from "@/components/GameMarkdown";
import AnnotatedMarkdown from "@/components/AnnotatedMarkdown";
import CopyCardTextButton from "@/components/CopyCardTextButton";
import {Locale} from "@/i18n/config";
import {CARD_ATTRIBUTE_KEYS, type CardPrinting} from "@/lib/types/card";
import ErrataList, {type ErrataEntry} from "@/app/games/[gameSlugOrId]/cards/[cardId]/ErrataList";

function hasNegativeVoteRatio(errata: Errata): boolean {
  return errata.votes.negative > errata.votes.positive;
}

export async function generateMetadata({
                                         params,
                                       }: {
  params: Promise<{ cardId: string }>;
}): Promise<Metadata> {
  const {cardId} = await params;
  const t = await getTranslations("Games");

  const card = await db.collection<BoosterCard>("cards").findOne({id: cardId});

  if (!card) {
    return {
      title: t("cards.detail.metadata.notFoundTitle"),
    };
  }

  const erratas = await getErratasByCardId(cardId);

  return {
    title: t("cards.detail.metadata.title", {cardName: card.name}),
    description: t("cards.detail.metadata.description", {
      cardName: card.name,
      count: erratas.length,
      banned: card.banned ? t("cards.detail.metadata.banned") : ""
    }),
    openGraph: {
      title: t("cards.detail.metadata.title", {cardName: card.name}),
      description: t("cards.detail.metadata.description", {
        cardName: card.name,
        count: erratas.length,
        banned: card.banned ? t("cards.detail.metadata.banned") : ""
      }),
      images: [card.image],
    },
  };
}

export default async function RiftboundCardDetailPage({
                                                        params,
                                                      }: {
  params: Promise<{ cardId: string; gameSlugOrId: string }>;
}) {
  const {cardId, gameSlugOrId} = await params;
  const locale = await getLocale();
  const ruleLang = locale === "fr" ? "fr" : "en";
  const t = await getTranslations("Games");

  const session = await auth.api.getSession({headers: await headers()});
  const userId = session?.user?.id;

  const game = await getGameBySlugOrId(gameSlugOrId);
  if (!game) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-row flex-wrap justify-between">
          <div className="flex flex-row flex-wrap gap-4">
            <Button asChild>
              <Link href={`/games/${gameSlugOrId}/cards`} className="text-blue-600 hover:underline">
                ← {t("cards.detail.backToList")}
              </Link>
            </Button>
            <h1 className="text-3xl font-bold mb-6">{t("cards.detail.notFoundTitle")}</h1>
          </div>
          <GameToolsNavBar gameSlug={gameSlugOrId} currentTab={'cards'}/>
        </div>

        <p>{t("cards.detail.notFoundMessage", {cardId})}</p>
      </div>
    );
  }

  // `BoosterCard` décrit une carte de collection ; le document de catalogue
  // porte en plus ses variantes d'impression.
  const card = await db
    .collection<BoosterCard & { printings?: CardPrinting[] }>("cards")
    .findOne({id: cardId, gameId: new ObjectId(game.id)});

  if (!card) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-row flex-wrap justify-between">
          <div className="flex flex-row flex-wrap gap-4">
            <Button asChild>
              <Link href={`/games/${gameSlugOrId}/cards`} className="text-blue-600 hover:underline">
                ← {t("cards.detail.backToList")}
              </Link>
            </Button>
            <h1 className="text-3xl font-bold mb-6">{t("cards.detail.notFoundTitle")}</h1>
          </div>
          <GameToolsNavBar gameSlug={gameSlugOrId} currentTab={'cards'}/>
        </div>

        <p>{t("cards.detail.notFoundMessage", {cardId})}</p>
      </div>
    );
  }

  // Cœur rouge si la carte est déjà dans une wishlist de l'utilisateur
  // (requête ciblée sur cette seule carte).
  const cardInWishlist = userId
    ? (await getWishlistIdsContainingCard(userId, game.id, card.id)).length > 0
    : false;

  const printings = card.printings ?? [];

  const erratas = [...await getErratasByCardId(cardId, userId)].sort(
    (a, b) => Number(hasNegativeVoteRatio(a)) - Number(hasNegativeVoteRatio(b))
  );
  const userIsAdmin = isAdmin(session?.user?.email);
  const userCanVoteErratas = await hasPermission("erratas:vote");
  // Un errata se modifie et se supprime par son auteur ; les modérateurs
  // (`erratas:manage`) peuvent agir sur tous.
  const userCanManageErratas = await hasPermission("erratas:manage");

  const mentionedCardNames = [
    ...new Set(
      erratas.flatMap((errata) => [
        ...extractBracketedMentions(errata.details),
        ...(errata.translations ?? []).flatMap((tr) => extractBracketedMentions(tr.details)),
      ])
    ),
  ];
  const mentionedCards = await getCardsByNames(new ObjectId(game.id), mentionedCardNames);
  const cardIdByName = Object.fromEntries(mentionedCards.map((c) => [c.name.toLowerCase(), c.id]));
  const cardsById = Object.fromEntries(mentionedCards.map((c) => [c.id, c]));

  let friendOwnership: FriendOwnership[] = [];
  let playGroupOwnership: PlayGroupOwnership[] = [];
  if (userId) {
    const [me, myPlayGroups] = await Promise.all([getUserById(userId), getPlayGroupsForUser(userId)]);
    const friendIds = me?.friends ?? [];
    const owners: CollectionOwner[] = [
      ...friendIds.map((id): CollectionOwner => ({type: "user", id})),
      ...myPlayGroups.map((group): CollectionOwner => ({type: "playGroup", id: group.id})),
    ];
    const breakdown = owners.length > 0 ? await getCardOwnershipByOwners(owners, card.id) : [];
    const countByOwnerId = new Map(breakdown.map((b) => [b.owner.id, b.count]));

    const friendUsers = friendIds.length > 0 ? await getUsersByIds(friendIds) : [];
    friendOwnership = friendUsers
      .filter((friend) => countByOwnerId.has(friend.id))
      .map((friend) => ({...toPublicUser(friend), count: countByOwnerId.get(friend.id)!}))
      .sort((a, b) => b.count - a.count);

    playGroupOwnership = myPlayGroups
      .filter((group) => countByOwnerId.has(group.id))
      .map((group) => ({id: group.id, name: group.name, count: countByOwnerId.get(group.id)!}))
      .sort((a, b) => b.count - a.count);
  }

  // Ce que le jeu renseigne sur la carte — énergie, domaines, rareté… — était
  // jusqu'ici indexé pour la recherche sans jamais être montré sur la fiche.
  // Les clés restent celles de la base : aucun jeu n'est codé en dur.
  const attributeChips = CARD_ATTRIBUTE_KEYS.flatMap((key) => {
    const value = (card as unknown as Record<string, unknown>)[key];
    const text = Array.isArray(value) ? value.filter(Boolean).join(", ") : value === undefined || value === null ? "" : String(value);
    if (!text) {
      return [];
    }
    return [{key, label: key.charAt(0).toUpperCase() + key.slice(1), value: text}];
  });

  const errataTypeLabel = (type: Errata["type"]) =>
    type === "errata"
      ? t("cards.detail.errataTypes.errata")
      : type === "clarification"
        ? t("cards.detail.errataTypes.clarification")
        : t("cards.detail.errataTypes.ruling");

  const errataEntries: ErrataEntry[] = erratas.map((errata) => {
    const totalVotes = errata.votes.positive + errata.votes.negative;
    const consensus = totalVotes > 0 ? Math.round((errata.votes.positive / totalVotes) * 100) : null;

    return {
      id: errata.id,
      type: errata.type,
      muted: Boolean(errata.deprecatedAt) || hasNegativeVoteRatio(errata),
      node: (
        <div
          className={`rounded-xl border border-l-[3px] bg-card p-4 ${
            errata.type === "errata"
              ? "border-l-red-500"
              : errata.type === "clarification"
                ? "border-l-blue-500"
                : "border-l-emerald-500"
          } ${errata.deprecatedAt ? "opacity-60" : ""}`}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                  errata.type === "errata"
                    ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                    : errata.type === "clarification"
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                      : "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                }`}
              >
                {errataTypeLabel(errata.type)}
              </span>
              {errata.deprecatedAt && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {t("cards.detail.deprecated")}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {DateTime.fromJSDate(new Date(errata.errataDate)).setLocale(locale).toLocaleString(DateTime.DATE_MED)}
              </span>
            </div>
            {(userCanManageErratas || errata.createdBy === userId) && (
              <div className="flex gap-1">
                <EditErrataDialog errata={errata} cardId={cardId} gameSlugOrId={gameSlugOrId}/>
                <DeleteErrataButton errataId={errata.id} cardIds={errata.cardIds}/>
              </div>
            )}
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <AnnotatedMarkdown
              content={errata.details}
              cardIdByName={cardIdByName}
              cardsById={cardsById}
              gameSlug={game.slug ?? gameSlugOrId}
              ruleLang={ruleLang}
              originalLang={errata.originalLang}
              translations={errata.translations?.map((tr) => ({lang: tr.lang, content: tr.details, updatedAt: tr.updatedAt}))}
              interfaceLocale={locale as Locale}
              originalLabel={t("cards.detail.originalLangLabel")}
              languagePickerLabel={t("cards.detail.languagePickerLabel")}
              contentUpdatedAt={errata.contentUpdatedAt}
              staleTranslationWarning={t("cards.detail.staleTranslationWarning")}
            />
          </div>
          {errata.cards && errata.cards.filter((c) => c.id !== cardId).length > 0 && (
            <div className="mt-2 border-t pt-2">
              <span className="text-xs text-muted-foreground">
                {t("cards.detail.alsoAppliesTo")}{" "}
                {errata.cards
                  .filter((c) => c.id !== cardId)
                  .map((c, index, arr) => (
                    <span key={c.id}>
                      <Link
                        href={`/games/${game.slug ?? gameSlugOrId}/cards/${c.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {c.name}
                      </Link>
                      {index < arr.length - 1 ? ", " : ""}
                    </span>
                  ))}
              </span>
            </div>
          )}
          {errata.deprecatedAt && (
            <p className="mt-2 border-t pt-2 text-xs italic text-muted-foreground">
              {t("cards.detail.deprecatedOn", {date: DateTime.fromJSDate(new Date(errata.deprecatedAt)).setLocale(locale).toLocaleString(DateTime.DATE_MED)})}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
            <ErrataVoteButtons
              errataId={errata.id}
              votes={errata.votes}
              userCanVote={userCanVoteErratas}
            />
            {/* Un ruling contesté doit se voir : la barre dit d'un coup d'œil
                si la communauté est d'accord, sans compter les voix. */}
            {consensus !== null && (
              <div className="flex flex-1 items-center gap-2">
                <div className="h-1 w-full max-w-[160px] overflow-hidden rounded-full bg-muted">
                  <div
                    className={consensus >= 70 ? "h-full bg-emerald-500" : consensus >= 50 ? "h-full bg-amber-500" : "h-full bg-red-500"}
                    style={{width: `${consensus}%`}}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {t("cards.detail.consensus", {percent: consensus})}
                </span>
              </div>
            )}
            <div className="ml-auto flex items-center gap-3">
              {errata.source && (
                <a
                  href={errata.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  {t("cards.detail.source")} →
                </a>
              )}
              <ReportButton contentType="errata" contentId={errata.id} />
            </div>
          </div>
        </div>
      ),
    };
  });

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-row flex-wrap justify-between gap-4">
        <div className="flex flex-row flex-wrap items-center gap-4">
          <Button asChild variant="outline">
            <Link href={`/games/${gameSlugOrId}/cards`}>
              ← {t("cards.detail.backToList")}
            </Link>
          </Button>
        </div>
        <GameToolsNavBar gameSlug={gameSlugOrId} currentTab={'cards'} />
      </div>

      <div className="mb-8 mt-4 flex justify-center">
        <CardSearchBar/>
      </div>

      {/* La carte reste sous les yeux pendant qu'on lit ses errata : colonne
          étroite et collante à gauche, tout le texte à droite. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-start">
        {/* Collante, mais jamais plus haute que l'écran : sur un portable, une
            carte suivie de ses variantes dépasse la fenêtre, et son bas
            deviendrait alors impossible à atteindre. */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          {/* Une carte toujours foil est présentée comme telle : voile irisé sur
              l'illustration, comme dans la collection. */}
          <div className={`relative overflow-hidden rounded-xl shadow-lg ${card.foil ? "foil-shine" : ""}`}>
            <img
              src={card.image}
              alt={card.name}
              className="w-full"
            />
          </div>

          {userId && (
            <div className="flex flex-wrap items-center gap-2">
              <CollectionManager
                cardId={card.id}
                gameSlug={game.slug ?? gameSlugOrId}
                cardName={card.name}
                setCode={card.setCode}
                collectorNumber={card.collectorNumber}
                image={card.image}
                alwaysFoil={card.foil === true}
                printings={printings}
              />
              <AddToWishlistButton
                cardId={card.id}
                gameSlug={game.slug ?? gameSlugOrId}
                cardName={card.name}
                setCode={card.setCode}
                collectorNumber={card.collectorNumber}
                image={card.image}
                cardFoil={card.foil === true}
                printings={printings}
                inWishlist={cardInWishlist}
              />
            </div>
          )}

          {printings.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("cards.detail.printingsTitle")} · {printings.length}
              </span>
              <ul className="grid grid-cols-3 gap-2">
                {printings.map((printing) => (
                  <li key={printing.id} className="flex flex-col gap-1">
                    <div
                      className={`relative overflow-hidden rounded-md border ${printing.foil ? "foil-shine" : ""}`}
                    >
                      <img
                        src={printing.image || card.image}
                        alt={`${card.name} — ${printing.name}`}
                        className="w-full"
                      />
                    </div>
                    <span className="text-xs font-medium leading-tight">{printing.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {printing.foil ? t("cards.detail.foil") : null}
                      {printing.foil && !printing.image ? " · " : null}
                      {!printing.image ? t("cards.detail.printingsBaseImage") : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{card.name}</h1>
              <span className="font-mono text-sm text-muted-foreground">
                #{card.setCode}-{card.collectorNumber}
              </span>
              {card.foil && (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {t("cards.detail.foil")}
                </span>
              )}
              {card.banned && (
                <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                  {t("cards.detail.banned")}
                </span>
              )}
              {userIsAdmin && (
                <div className="ml-auto">
                  <BanCardButton cardId={cardId} banned={card.banned}/>
                </div>
              )}
            </div>

            {attributeChips.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attributeChips.map((chip) => (
                  <div
                    key={chip.key}
                    className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5"
                  >
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{chip.label}</span>
                    <span className="text-sm font-semibold">{chip.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {card.text && (
            <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("cards.detail.cardTextTitle")}
                </span>
                <CopyCardTextButton
                  text={card.text}
                  label={t("cards.detail.copyCardText")}
                  copiedLabel={t("cards.detail.copyCardTextCopied")}
                />
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <GameMarkdown
                  markdown={annotateCardText(card.text)}
                  gameSlug={game.slug ?? gameSlugOrId}
                  ruleLang={ruleLang}
                />
              </div>
            </div>
          )}

          {userId && <CardSocialOwnership friends={friendOwnership} playGroups={playGroupOwnership} />}

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">
                {t("cards.detail.errataSectionTitle")}
              </h2>
              {userId && (
                <AddErrataButton
                  cardId={cardId}
                  cardName={card.name}
                  setCode={card.setCode}
                  collectorNumber={card.collectorNumber}
                  image={card.image}
                  gameSlugOrId={gameSlugOrId}
                />
              )}
            </div>

            {errataEntries.length === 0 ? (
              <p className="text-muted-foreground">
                {t("cards.detail.noErrata")}
              </p>
            ) : (
              <ErrataList
                entries={errataEntries}
                allLabel={t("cards.detail.errataFilterAll")}
                typeLabels={{
                  errata: t("cards.detail.errataTypes.errata"),
                  clarification: t("cards.detail.errataTypes.clarification"),
                  ruling: t("cards.detail.errataTypes.ruling"),
                }}
                emptyForFilter={t("cards.detail.errataNoneForFilter")}
                showMutedLabel={t("cards.detail.errataShowMuted")}
                hideMutedLabel={t("cards.detail.errataHideMuted")}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
