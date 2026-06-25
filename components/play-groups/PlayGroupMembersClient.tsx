'use client';

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type GroupMember = {
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
  group: {
    id: string;
    name: string;
    description?: string;
  };
  currentUserRole: string;
  members: GroupMember[];
};

export default function PlayGroupMembersClient() {
  const t = useTranslations("PlayGroups");
  const params = useParams<{ playGroupId?: string }>();
  const playGroupId = params?.playGroupId;
  const [data, setData] = useState<GroupPayload | null>(null);
  const [inviteValue, setInviteValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = async () => {
    if (!playGroupId) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/play-groups/${playGroupId}/members`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Impossible de charger les membres");
      }

      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMembers();
  }, [playGroupId]);

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!playGroupId) {
      return;
    }

    const response = await fetch(`/api/play-groups/${playGroupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIdentifier: inviteValue }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Impossible d'inviter ce joueur");
      return;
    }

    setInviteValue("");
    await loadMembers();
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    if (!playGroupId) {
      return;
    }

    const response = await fetch(`/api/play-groups/${playGroupId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Impossible de modifier le rôle");
      return;
    }

    await loadMembers();
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!playGroupId) {
      return;
    }

    const response = await fetch(`/api/play-groups/${playGroupId}/members/${memberId}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Impossible de retirer le membre");
      return;
    }

    await loadMembers();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{data?.group.name || t("page.membersTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t("page.membersDescription")}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/play-groups/${playGroupId}`}>{t("page.back")}</Link>
        </Button>
      </div>

      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      {data && (data.currentUserRole === "owner" || data.currentUserRole === "admin") ? (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold">{t("page.inviteTitle")}</h2>
          <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={handleInvite}>
            <input
              className="flex-1 rounded-md border border-input bg-background px-3 py-2"
              placeholder={t("page.invitePlaceholder")}
              value={inviteValue}
              onChange={(event) => setInviteValue(event.target.value)}
            />
            <Button type="submit">{t("page.inviteSubmit")}</Button>
          </form>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold">{t("page.membersTitle")}</h2>
        {loading ? <p className="mt-4 text-sm text-muted-foreground">{t("page.loading")}</p> : null}
        {!loading && data?.members.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">{t("page.noMembers")}</p> : null}
        <div className="mt-4 space-y-3">
          {data?.members.map((member) => {
            const displayName = member.user?.displayName || member.user?.username || member.user?.email || member.userId;
            return (
              <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between" key={member.userId}>
                <div>
                  <p className="font-medium">{displayName}</p>
                  <p className="text-sm text-muted-foreground">{member.role}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.currentUserRole === "owner" ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => void handleRoleChange(member.userId, member.role === "admin" ? "member" : "admin")}>
                        {member.role === "admin" ? t("page.demote") : t("page.promote")}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => void handleRemoveMember(member.userId)}>
                        {t("page.remove")}
                      </Button>
                    </>
                  ) : null}
                  {data.currentUserRole === "admin" && member.role === "member" ? (
                    <Button size="sm" variant="destructive" onClick={() => void handleRemoveMember(member.userId)}>
                      {t("page.remove")}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

