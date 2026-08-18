"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Copy, Loader2, QrCode, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Trade } from "@/lib/db/trades";

/**
 * Invitation du partenaire : QR code et code à recopier (l'autre joueur ouvre
 * l'échange avec son compte), ou désignation directe par tag `pseudo#1234`,
 * nom d'utilisateur ou adresse e-mail.
 */
export default function TradeInviteDialog({
  tradeId,
  code,
  disabled = false,
  onTradeChange,
}: {
  tradeId: string;
  code: string;
  disabled?: boolean;
  onTradeChange: (trade: Trade) => void;
}) {
  const t = useTranslations("Trade");

  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [inviting, setInviting] = useState(false);

  // Construite à la demande plutôt que gardée en état : la copie ne dépend donc
  // pas de l'exécution préalable de l'effet qui produit le QR code.
  const buildJoinUrl = useCallback(() => `${window.location.origin}/trade/join/${code}`, [code]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    QRCode.toDataURL(buildJoinUrl(), { width: 300, margin: 2, color: { dark: "#000000", light: "#FFFFFF" } })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch((error) => {
        console.error("Failed to build the trade QR code:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [open, buildJoinUrl]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(buildJoinUrl());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy the trade link:", error);
    }
  };

  const invite = async () => {
    const value = identifier.trim();
    if (!value) return;

    setInviting(true);
    try {
      const res = await fetch(`/api/trades/${tradeId}/partner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: value }),
      });
      const data: { trade?: Trade; error?: string } = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(
          data.error === "user-not-found"
            ? t("invite.errors.userNotFound")
            : data.error === "self-trade"
              ? t("invite.errors.self")
              : data.error === "side-taken"
                ? t("invite.errors.taken")
                : t("errors.failed")
        );
        return;
      }

      if (data.trade) onTradeChange(data.trade);
      toast.success(t("invite.invited"));
      setIdentifier("");
      setOpen(false);
    } catch (error) {
      console.error("Failed to invite a trade partner:", error);
      toast.error(t("errors.failed"));
    } finally {
      setInviting(false);
    }
  };

  return (
    <>
      <Button variant="outline" className="gap-2" disabled={disabled} onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        {t("invite.button")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("invite.title")}</DialogTitle>
            <DialogDescription>{t("invite.description")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3">
            {qrDataUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- QR code généré en data URL */
              <img src={qrDataUrl} alt={t("invite.qrAlt")} className="rounded-lg border-4 border-gray-200" />
            ) : (
              <div className="flex h-[300px] w-[300px] items-center justify-center rounded-lg border border-dashed">
                <QrCode className="size-8 text-muted-foreground" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <code className="rounded-md bg-muted px-3 py-1.5 text-lg font-bold tracking-[0.2em]">{code}</code>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void copyLink()}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? t("invite.copied") : t("invite.copyLink")}
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">{t("invite.codeHint")}</p>
          </div>

          <div className="flex flex-col gap-2 border-t pt-4">
            <p className="text-sm font-medium">{t("invite.directTitle")}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder={t("invite.identifierPlaceholder")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void invite();
                }}
              />
              <Button className="gap-2" disabled={inviting || !identifier.trim()} onClick={() => void invite()}>
                {inviting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                {t("invite.submit")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("invite.identifierHint")}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
