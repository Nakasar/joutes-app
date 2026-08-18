"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Users } from "lucide-react";

export type FriendOwnership = {
  id: string;
  username: string;
  displayName?: string;
  discriminator?: string;
  avatar?: string;
  count: number;
};

export type PlayGroupOwnership = {
  id: string;
  name: string;
  count: number;
};

function displayNameFor(user: { username: string; displayName?: string; discriminator?: string }): string {
  return user.displayName && user.discriminator
    ? `${user.displayName}#${user.discriminator}`
    : user.displayName || user.username;
}

export default function CardSocialOwnership({
  friends,
  playGroups,
}: {
  friends: FriendOwnership[];
  playGroups: PlayGroupOwnership[];
}) {
  const t = useTranslations("Games.cards.detail.social");
  const [friendsExpanded, setFriendsExpanded] = useState(false);
  const [groupsExpanded, setGroupsExpanded] = useState(false);

  if (friends.length === 0 && playGroups.length === 0) {
    return null;
  }

  const friendsCopies = friends.reduce((sum, friend) => sum + friend.count, 0);
  const groupsCopies = playGroups.reduce((sum, group) => sum + group.count, 0);

  return (
    <div className="mb-6 space-y-3">
      {friends.length > 0 && (
        <div>
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => setFriendsExpanded((v) => !v)}>
            <Users className="h-4 w-4" />
            <span>{t("friendsSummary", { friendCount: friends.length })}</span>
            <span className="text-muted-foreground">({t("copies", { count: friendsCopies })})</span>
            {friendsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          {friendsExpanded && (
            <div className="mt-2 divide-y rounded-lg border">
              {friends.map((friend) => (
                <div key={friend.id} className="flex items-center gap-3 p-3">
                  {friend.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={friend.avatar}
                      alt={displayNameFor(friend)}
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {displayNameFor(friend).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">{displayNameFor(friend)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t("copies", { count: friend.count })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {playGroups.length > 0 && (
        <div>
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => setGroupsExpanded((v) => !v)}>
            <Users className="h-4 w-4" />
            <span>{t("playGroupsSummary", { groupCount: playGroups.length })}</span>
            <span className="text-muted-foreground">({t("copies", { count: groupsCopies })})</span>
            {groupsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          {groupsExpanded && (
            <div className="mt-2 divide-y rounded-lg border">
              {playGroups.map((group) => (
                <div key={group.id} className="flex items-center justify-between gap-3 p-3">
                  <Link
                    href={`/play-groups/${group.id}/collection`}
                    className="min-w-0 flex-1 truncate text-sm text-blue-600 hover:underline"
                  >
                    {group.name}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{t("copies", { count: group.count })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
