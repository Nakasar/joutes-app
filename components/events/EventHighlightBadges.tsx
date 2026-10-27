import { useLocale, useTranslations } from "next-intl";
import { Award, Flame } from "lucide-react";

import { cn } from "@/lib/utils.ts";
import { initials } from "@/lib/events/attendees.ts";
import { POPULAR_MIN_INTEREST } from "@/lib/events/highlights.ts";
import type { EventHighlights, HighlightFriend } from "@/lib/types/Event";

/**
 * Les marques d'un événement : choix du lieu, populaire, des amis y vont.
 *
 * Une couleur par marque, la même partout où elles s'affichent — accueil,
 * calendrier, vitrine d'un lieu : la primaire pour le lieu, l'orange pour la
 * popularité, le violet pour les amis. La rosette du lieu n'est pas une
 * étoile : l'étoile est déjà le favori.
 *
 * Sans `"use client"` : les fiches de l'accueil le rendent côté serveur, le
 * calendrier côté client, et `useTranslations` sert les deux.
 */
export default function EventHighlightBadges({
  highlights,
  className,
}: {
  highlights: EventHighlights | undefined;
  className?: string;
}) {
  const t = useTranslations("EventHighlights");
  const locale = useLocale();
  if (!highlights) return null;

  const { lairPick, popular, friends } = highlights;
  if (!lairPick && !popular && friends.length === 0) return null;

  /*
   * `Badge` porte `whitespace-nowrap shrink-0` : ces pastilles-ci sont écrites
   * à la main pour pouvoir se replier dans une rangée étroite.
   */
  return (
    <span className={cn("contents", className)}>
      {lairPick && (
        <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium">
          <Award className="size-3 shrink-0" aria-hidden />
          {t("lairPick")}
        </span>
      )}
      {popular && (
        <span className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-300">
          <Flame className="size-3 shrink-0" aria-hidden />
          {t("popular")}
        </span>
      )}
      {friends.length > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/10 py-0.5 pr-2 pl-1 text-xs font-medium text-violet-700 dark:text-violet-300">
          <FriendAvatars friends={friends} />
          {friendsSentence(friends, t, locale, 2)}
        </span>
      )}
    </span>
  );
}

/** Les avatars des amis, empilés : trois au plus. */
export function FriendAvatars({
  friends,
  size = "sm",
}: {
  friends: HighlightFriend[];
  size?: "xs" | "sm" | "md";
}) {
  const box = { xs: "size-3.5 text-[8px]", sm: "size-4 text-[9px]", md: "size-[22px] text-[11px]" }[size];

  return (
    <span aria-hidden className="flex shrink-0">
      {friends.slice(0, 3).map((friend, index) => (
        <span
          key={friend.id}
          className={cn(
            "ring-card flex items-center justify-center overflow-hidden rounded-full bg-violet-600 font-semibold text-white ring-2",
            box,
            index > 0 && "-ml-1.5",
          )}
        >
          {friend.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={friend.avatar} alt="" className="size-full object-cover" />
          ) : (
            initials(friend.displayName).slice(0, 1).toUpperCase()
          )}
        </span>
      ))}
    </span>
  );
}

type Translate = ReturnType<typeof useTranslations<"EventHighlights">>;

/**
 * « Léa et Tom y vont, Malo l'a en favori » : les inscrits d'abord, puis les
 * intéressés. `max` borne le nombre de pseudos cités par groupe ; au-delà,
 * « et 2 autres ».
 */
export function friendsSentence(friends: HighlightFriend[], t: Translate, locale: string, max = 3): string {
  const going = friends.filter((friend) => friend.kind === "registered");
  const interested = friends.filter((friend) => friend.kind === "interested");

  const parts = [
    going.length > 0 ? t("going", { names: listNames(going, t, locale, max), count: going.length }) : null,
    interested.length > 0
      ? t("interested", { names: listNames(interested, t, locale, max), count: interested.length })
      : null,
  ].filter(Boolean);

  return parts.join(", ");
}

function listNames(friends: HighlightFriend[], t: Translate, locale: string, max: number): string {
  const names = friends.slice(0, max).map((friend) => friend.displayName);
  const rest = friends.length - names.length;
  if (rest > 0) names.push(t("others", { count: rest }));
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(names);
}

/**
 * Pourquoi l'événement est mis en avant, en une ligne, la raison la plus forte
 * d'abord : des amis, puis le lieu, puis la popularité.
 */
export function useHighlightReason(): (highlights: EventHighlights, lairName?: string) => {
  kind: "friends" | "lairPick" | "popular";
  text: string;
} | null {
  const t = useTranslations("EventHighlights");
  const locale = useLocale();

  return (highlights, lairName) => {
    if (highlights.friends.length > 0) {
      return { kind: "friends", text: friendsSentence(highlights.friends, t, locale) };
    }
    if (highlights.lairPick) {
      return { kind: "lairPick", text: lairName ? t("byLair", { lair: lairName }) : t("lairPick") };
    }
    if (highlights.popular) {
      return {
        kind: "popular",
        text: highlights.interest >= POPULAR_MIN_INTEREST ? t("popularCount", { count: highlights.interest }) : t("popularFilling"),
      };
    }
    return null;
  };
}
