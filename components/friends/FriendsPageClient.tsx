'use client';

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type FriendUser = {
  id: string;
  username: string;
  displayName?: string;
  discriminator?: string;
  avatar?: string;
};

type FriendRequest = {
  id: string;
  requesterId: string;
  recipientId: string;
  status: string;
  createdAt: string;
  requester: FriendUser | null;
};

function displayNameFor(user: FriendUser | null | undefined): string {
  if (!user) {
    return "";
  }
  return user.displayName && user.discriminator
    ? `${user.displayName}#${user.discriminator}`
    : user.displayName || user.username;
}

export default function FriendsPageClient() {
  const t = useTranslations("Friends");
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [friendsResponse, requestsResponse] = await Promise.all([
        fetch("/api/friends"),
        fetch("/api/friends/requests"),
      ]);

      const friendsData = await friendsResponse.json();
      const requestsData = await requestsResponse.json();

      if (!friendsResponse.ok) {
        throw new Error(friendsData.error || "Impossible de charger la liste d'amis");
      }

      if (!requestsResponse.ok) {
        throw new Error(requestsData.error || "Impossible de charger les demandes d'ami");
      }

      setFriends(friendsData.friends || []);
      setRequests(requestsData.requests || []);
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

  const handleAddFriend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const response = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Impossible d'envoyer la demande d'ami");
      return;
    }

    setUsername("");
    setSuccess(t("page.requestSent"));
    await loadData();
  };

  const handleAcceptRequest = async (requestId: string) => {
    setError(null);
    const response = await fetch(`/api/friends/requests/${requestId}`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Impossible d'accepter la demande");
      return;
    }

    await loadData();
  };

  const handleDeclineRequest = async (requestId: string) => {
    setError(null);
    const response = await fetch(`/api/friends/requests/${requestId}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Impossible de refuser la demande");
      return;
    }

    await loadData();
  };

  const handleRemoveFriend = async (friendId: string) => {
    setError(null);
    const response = await fetch(`/api/friends/${friendId}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Impossible de retirer cet ami");
      return;
    }

    await loadData();
  };

  return (
    <div className="space-y-8">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold">{t("page.addTitle")}</h2>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={handleAddFriend}>
          <input
            className="flex-1 rounded-md border border-input bg-background px-3 py-2"
            placeholder={t("page.addPlaceholder")}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Button type="submit">{t("page.addSubmit")}</Button>
        </form>
      </div>

      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-primary">{success}</p> : null}

      {requests.length > 0 ? (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold">{t("page.requestsTitle")}</h2>
          <div className="mt-4 space-y-3">
            {requests.map((request) => (
              <div className="flex items-center justify-between rounded-lg border p-4" key={request.id}>
                <p className="font-medium">{displayNameFor(request.requester)}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void handleAcceptRequest(request.id)}>
                    {t("page.accept")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void handleDeclineRequest(request.id)}>
                    {t("page.decline")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold">{t("page.friendsTitle")}</h2>
        {loading ? <p className="mt-4 text-sm text-muted-foreground">{t("page.loading")}</p> : null}
        {!loading && friends.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">{t("page.empty")}</p> : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {friends.map((friend) => (
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4" key={friend.id}>
              <div className="flex items-center gap-3 min-w-0">
                {friend.avatar ? (
                  <img src={friend.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : null}
                <Link href={`/users/${friend.id}`} className="font-semibold truncate hover:underline">
                  {displayNameFor(friend)}
                </Link>
              </div>
              <Button size="sm" variant="destructive" onClick={() => void handleRemoveFriend(friend.id)}>
                {t("page.remove")}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
