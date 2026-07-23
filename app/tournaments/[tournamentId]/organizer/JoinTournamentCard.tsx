"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Affiche le code de participation, le lien /t/:code/join et son QR code, pour
// inviter des joueurs à rejoindre le tournoi.
export function JoinTournamentCard({ code }: { code: string }) {
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/t/${code}/join` : "";

  useEffect(() => {
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, { width: 240, margin: 2, color: { dark: "#000000", light: "#FFFFFF" } })
      .then(setQrCodeUrl)
      .catch((err) => console.error("Erreur lors de la génération du QR code:", err));
  }, [joinUrl]);

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
        <CardTitle>Inviter des joueurs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Partagez ce code ou faites scanner ce QR code pour rejoindre le tournoi.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border bg-muted px-3 py-1 font-mono text-lg tracking-widest">
            {code}
          </span>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? "Lien copié !" : "Copier le lien"}
          </Button>
        </div>
        {qrCodeUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrCodeUrl}
            alt="QR code de participation au tournoi"
            width={240}
            height={240}
            className="rounded-lg border"
          />
        )}
      </CardContent>
    </Card>
  );
}
