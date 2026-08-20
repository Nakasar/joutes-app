"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation.ts";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";

import { cancelPlayGroupInvitationAction, resendPlayGroupInvitationAction } from "./actions.ts";

/**
 * Promouvoir, rétrograder, retirer.
 *
 * Ces trois-là passent encore par l'API des membres plutôt que par des actions
 * serveur : elle porte déjà les règles fines (un admin ne touche pas à un autre
 * admin, le fondateur n'est jamais rétrogradé), et les récrire ailleurs
 * mettrait deux vérités en concurrence.
 */
export function MemberRoleActions({
  playGroupId,
  memberId,
  role,
  canPromote,
  canRemove,
}: {
  playGroupId: string;
  memberId: string;
  role: string;
  canPromote: boolean;
  canRemove: boolean;
}) {
  const t = useTranslations("PlayGroups.hub.members");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const call = (input: RequestInfo, init: RequestInit) => {
    startTransition(async () => {
      const response = await fetch(input, init);
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(payload.error || t("error"));
        return;
      }

      router.refresh();
    });
  };

  if (!canPromote && !canRemove) {
    return null;
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {canPromote && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            call(`/api/play-groups/${playGroupId}/members/${memberId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role: role === "admin" ? "member" : "admin" }),
            })
          }
        >
          {role === "admin" ? t("demote") : t("promote")}
        </Button>
      )}

      {canRemove && (
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => call(`/api/play-groups/${playGroupId}/members/${memberId}`, { method: "DELETE" })}
        >
          {t("remove")}
        </Button>
      )}
    </div>
  );
}

/** L'invitation par pseudo ou adresse — le champ est absent pour un non-admin. */
export function InviteMemberForm({ playGroupId, canInvite }: { playGroupId: string; canInvite: boolean }) {
  const t = useTranslations("PlayGroups.hub.members");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState("");

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canInvite) {
          return;
        }

        startTransition(async () => {
          const response = await fetch(`/api/play-groups/${playGroupId}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userIdentifier: value }),
          });
          const payload = await response.json().catch(() => ({}));

          if (!response.ok) {
            toast.error(payload.error || t("error"));
            return;
          }

          setValue("");
          router.refresh();
        });
      }}
    >
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t("invitePlaceholder")}
        aria-label={t("inviteLabel")}
        disabled={!canInvite}
        className="min-w-0 flex-1"
      />
      <Button type="submit" size="sm" disabled={!canInvite || pending || value.trim().length === 0}>
        {t("invite")}
      </Button>
      {!canInvite && <p className="w-full text-[13px] text-muted-foreground">{t("adminsOnly")}</p>}
    </form>
  );
}

export function InvitationActions({ playGroupId, invitationId }: { playGroupId: string; invitationId: string }) {
  const t = useTranslations("PlayGroups.hub.members");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await resendPlayGroupInvitationAction(playGroupId, invitationId);
            if (result.success) {
              toast.success(t("resent"));
            } else {
              toast.error(t("error"));
            }
          })
        }
      >
        {t("resend")}
      </Button>

      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await cancelPlayGroupInvitationAction(playGroupId, invitationId);
            if (!result.success) {
              toast.error(t("error"));
            }
          })
        }
      >
        {t("cancelInvitation")}
      </Button>
    </div>
  );
}
