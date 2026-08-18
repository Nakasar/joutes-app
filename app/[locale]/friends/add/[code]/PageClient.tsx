"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Loader2, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";

type PublicUser = {
  id: string;
  username: string;
  displayName?: string;
  discriminator?: string;
  avatar?: string;
};

function displayNameFor(user: PublicUser): string {
  return user.displayName && user.discriminator
    ? `${user.displayName}#${user.discriminator}`
    : user.displayName || user.username;
}

export default function AddFriendByCodePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const session = useSession();
  const t = useTranslations("Friends.addByCode");
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [error, setError] = useState<string | null>(null);
  const [friend, setFriend] = useState<PublicUser | null>(null);

  useEffect(() => {
    if (session.isPending) {
      return;
    }
    if (!session?.data?.user) {
      router.push(`/login?redirect=/friends/add/${code}`);
      return;
    }

    let cancelled = false;
    fetch("/api/friends/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok && response.status !== 409) {
          throw new Error(data.error || t("errors.generic"));
        }
        setFriend(data.friend || null);
        setStatus("success");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("errors.generic"));
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [code, session, t, router]);

  return (
    <div className="container mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      {status === "pending" && (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">{t("pending")}</p>
        </>
      )}

      {status === "success" && (
        <>
          <UserCheck className="h-10 w-10 text-primary" />
          <p className="font-medium">{friend ? t("success", { name: displayNameFor(friend) }) : t("successGeneric")}</p>
          <Button asChild>
            <Link href="/friends">{t("backToFriends")}</Link>
          </Button>
        </>
      )}

      {status === "error" && (
        <>
          <UserX className="h-10 w-10 text-destructive" />
          <p className="text-destructive">{error}</p>
          <Button asChild variant="outline">
            <Link href="/friends">{t("backToFriends")}</Link>
          </Button>
        </>
      )}
    </div>
  );
}
