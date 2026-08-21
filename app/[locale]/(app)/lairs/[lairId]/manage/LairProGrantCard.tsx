"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Gift, Loader2, ShieldCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import type { LairProGrant } from "@/lib/types/Lair";

import {
  grantProToLairAction,
  revokeProFromLairAction,
  type LairProGrantError,
} from "./pro-grant-actions.ts";

const ERROR_KEYS: Record<LairProGrantError, string> = {
  INVALID_LAIR: "errors.invalidLair",
  REASON_REQUIRED: "errors.reasonRequired",
  NOT_FOUND: "errors.notFound",
  NOT_GRANTED: "errors.notGranted",
  FAILED: "errors.failed",
};

/**
 * Offrir Joutes Pro à un lieu — réservé à l'équipe.
 *
 * Distinct du rattachement à un abonnement juste au-dessus : celui-ci consomme
 * un siège chez un abonné, celui-là n'appartient à personne. La carte le dit,
 * parce que les deux mènent au même résultat visible et qu'on ne saurait pas
 * autrement lequel a joué.
 *
 * Le motif est obligatoire, et l'action serveur le réclame aussi.
 */
export default function LairProGrantCard({
  lairId,
  lairName,
  grant,
  isSponsored,
}: {
  lairId: string;
  lairName: string;
  grant: LairProGrant | null;
  isSponsored: boolean;
}) {
  const t = useTranslations("Lairs.manage.proGrant");
  const [reason, setReason] = useState(grant?.reason ?? "");
  const [isConfirmingRevoke, setIsConfirmingRevoke] = useState(false);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const motif = reason.trim();

    if (motif.length === 0) {
      toast.error(t("errors.reasonRequired"));
      return;
    }

    startTransition(async () => {
      const result = await grantProToLairAction(lairId, motif);

      if (result.success) {
        toast.success(grant ? t("updated") : t("granted", { name: lairName }));
        return;
      }

      toast.error(t(ERROR_KEYS[result.error]));
    });
  };

  const revoke = () => {
    startTransition(async () => {
      const result = await revokeProFromLairAction(lairId);

      if (result.success) {
        setReason("");
        setIsConfirmingRevoke(false);
        toast.success(t("revoked"));
        return;
      }

      toast.error(t(ERROR_KEYS[result.error]));
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={grant ? "default" : "outline"}>
          <ShieldCheck className="mr-1 size-3" aria-hidden />
          {grant ? t("statusGranted") : t("statusNone")}
        </Badge>
        {/* Un lieu peut tenir Pro des deux côtés : le dire évite de croire que
            retirer l'octroi lui retirera ses options. */}
        {grant && isSponsored && <Badge variant="outline">{t("alsoSponsored")}</Badge>}
      </div>

      <p className="text-sm text-muted-foreground">{t("description")}</p>

      {grant && (
        <dl className="flex flex-col gap-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <dt className="text-muted-foreground">{t("grantedAt")}</dt>
            <dd className="font-mono text-[13px]">
              {DateTime.fromJSDate(new Date(grant.grantedAt)).toFormat("dd/MM/yyyy")}
            </dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="text-muted-foreground">{t("reason")}</dt>
            <dd>{grant.reason}</dd>
          </div>
        </dl>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lair-pro-reason">{t("reasonLabel")}</Label>
        <Input
          id="lair-pro-reason"
          value={reason}
          maxLength={200}
          placeholder={t("reasonPlaceholder")}
          onChange={(event) => setReason(event.target.value)}
        />
        <p className="text-[13px] text-muted-foreground">{t("reasonHint")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={isPending} onClick={submit}>
          {isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          ) : (
            <Gift className="mr-2 size-4" aria-hidden />
          )}
          {grant ? t("update") : t("grant")}
        </Button>

        {grant && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => setIsConfirmingRevoke(true)}
          >
            <Trash2 className="mr-2 size-4" aria-hidden />
            {t("revoke")}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={isConfirmingRevoke}
        onOpenChange={setIsConfirmingRevoke}
        title={t("revokeConfirmTitle")}
        description={isSponsored ? t("revokeConfirmSponsored") : t("revokeConfirmDescription")}
        confirmLabel={t("revoke")}
        cancelLabel={t("cancel")}
        destructive
        busy={isPending}
        onConfirm={revoke}
      />
    </div>
  );
}
