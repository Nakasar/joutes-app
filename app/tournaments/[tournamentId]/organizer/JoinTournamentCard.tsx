"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useJoinQrCode } from "@/app/tournaments/useJoinQrCode";

// Affiche le code de participation, le lien /t/:code/join et son QR code, pour
// inviter des joueurs à rejoindre le tournoi.
export function JoinTournamentCard({ code }: { code: string }) {
  const t = useTranslations("Tournaments");
  const { joinUrl, qrCodeUrl } = useJoinQrCode(code);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Copie indisponible (permissions) : le lien reste visible/scannable.
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("organizerJoin.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("organizerJoin.description")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border bg-muted px-3 py-1 font-mono text-lg tracking-widest">
            {code}
          </span>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? t("organizerJoin.copied") : t("organizerJoin.copyLink")}
          </Button>
        </div>
        {qrCodeUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrCodeUrl}
            alt={t("organizerJoin.qrAlt")}
            width={240}
            height={240}
            className="rounded-lg border"
          />
        )}
      </CardContent>
    </Card>
  );
}
