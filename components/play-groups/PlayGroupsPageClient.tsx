'use client';

import { Button } from "@/components/ui/button";
import { DateTime } from "luxon";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type PlayGroupSummary = {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: Array<{ userId: string; role: string; joinedAt: string }>;
  createdAt: string;
  updatedAt: string;
};

type PlayGroupInvitation = {
  id: string;
  playGroupId: string;
  playGroupName: string;
  invitedUserId: string;
  invitedById: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export default function PlayGroupsPageClient() {
  const t = useTranslations("PlayGroups");
  const [groups, setGroups] = useState<PlayGroupSummary[]>([]);
  const [invitations, setInvitations] = useState<PlayGroupInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [groupsResponse, invitationsResponse] = await Promise.all([
        fetch("/api/play-groups"),
        fetch("/api/play-groups/invitations"),
      ]);

      const groupsData = await groupsResponse.json();
      const invitationsData = await invitationsResponse.json();

      if (!groupsResponse.ok) {
        throw new Error(groupsData.error || "Impossible de charger les groupes");
      }

      if (!invitationsResponse.ok) {
        throw new Error(invitationsData.error || "Impossible de charger les invitations");
      }

      setGroups(groupsData.groups || []);
      setInvitations(invitationsData.invitations || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleAcceptInvitation = async (invitationId: string) => {
    setError(null);
    const response = await fetch(`/api/play-groups/invitations/${invitationId}`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Impossible d'accepter l'invitation");
      return;
    }

    await loadData();
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Button asChild>
          <Link href="/play-groups/new">{t("page.createTitle")}</Link>
        </Button>
      </div>

      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      {invitations.length > 0 ? (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold">{t("page.invitesTitle")}</h2>
          <div className="mt-4 space-y-3">
            {invitations.map((invitation) => (
              <div className="flex items-center justify-between rounded-lg border p-4" key={invitation.id}>
                <div>
                  <p className="font-medium">{invitation.playGroupName}</p>
                  <p className="text-sm text-muted-foreground">{t("page.invitedBy", { defaultValue: "Invitation reçue" })}</p>
                </div>
                <Button size="sm" onClick={() => void handleAcceptInvitation(invitation.id)}>
                  {t("page.accept")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold">{t("page.groupsTitle")}</h2>
        {loading ? <p className="mt-4 text-sm text-muted-foreground">{t("page.loading")}</p> : null}
        {!loading && groups.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">{t("page.empty")}</p> : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {groups.map((group) => (
            <div className="rounded-lg border p-4" key={group.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{group.name}</h3>
                  {group.description ? <p className="mt-2 text-sm text-muted-foreground">{group.description}</p> : null}
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
                  {t("page.memberCount", { count: group.members.length })}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {t("page.createdAt", { value: DateTime.fromISO(group.createdAt).toLocaleString(DateTime.DATE_MED) })}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href={`/play-groups/${group.id}`}>{t("page.details")}</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/play-groups/${group.id}/members`}>{t("page.members")}</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
