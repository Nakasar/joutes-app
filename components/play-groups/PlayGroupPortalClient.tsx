'use client';

import { Button } from "@/components/ui/button";
import { DateTime } from "luxon";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Settings } from "lucide-react";

type PlayGroupMember = {
  userId: string;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    username?: string;
    displayName?: string;
    email?: string;
    avatar?: string;
  } | null;
};

type GroupPayload = {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: PlayGroupMember[];
  createdAt: string;
  updatedAt: string;
};

export default function PlayGroupPortalClient() {
  const t = useTranslations("PlayGroups");
  const params = useParams<{ playGroupId?: string }>();
  const playGroupId = params?.playGroupId;
  const { data: session } = useSession();
  const [group, setGroup] = useState<GroupPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentMember = group?.members.find((member) => member.userId === session?.user?.id);
  const canManageSettings = currentMember?.role === "owner" || currentMember?.role === "admin";

  useEffect(() => {
    if (!playGroupId) {
      setLoading(false);
      return;
    }

    const loadGroup = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/play-groups/${playGroupId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Impossible de charger le groupe");
        }

        setGroup(data.group);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    };

    void loadGroup();
  }, [playGroupId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{group?.name || t("page.portalTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{group?.description || t("page.portalDescription")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageSettings && group ? (
            <Button asChild variant="outline">
              <Link href={`/play-groups/${group.id}/settings`}>
                <Settings className="mr-2 size-4" />
                {t("page.settings")}
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/play-groups">{t("page.back")}</Link>
          </Button>
        </div>
      </div>

      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      {loading ? <p className="text-sm text-muted-foreground">{t("page.loading")}</p> : null}

      {group ? (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold">{t("page.portalOverview")}</h2>
            <dl className="mt-4 space-y-3">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t("page.createdAtLabel")}</dt>
                <dd>{DateTime.fromISO(group.createdAt).toLocaleString(DateTime.DATE_MED)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t("page.members")}</dt>
                <dd>{t("page.memberCountValue", { count: group.members.length })}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{t("page.members")}</h2>
              <Button asChild size="sm">
                <Link href={`/play-groups/${group.id}/members`}>{t("page.manageMembers")}</Link>
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {group.members.map((member) => {
                const displayName = member.user?.displayName || member.user?.username || member.user?.email || member.userId;
                return (
                  <div className="rounded-lg border p-3" key={member.userId}>
                    <p className="font-medium">{displayName}</p>
                    <p className="text-sm text-muted-foreground">{member.role}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{t("page.collectionTitle")}</h2>
              <Button asChild size="sm">
                <Link href={`/play-groups/${group.id}/collection`}>{t("page.viewCollection")}</Link>
              </Button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t("page.collectionDescription")}</p>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{t("page.wishlistsTitle")}</h2>
              <Button asChild size="sm">
                <Link href={`/play-groups/${group.id}/wishlists`}>{t("page.viewWishlists")}</Link>
              </Button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t("page.wishlistsDescription")}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

