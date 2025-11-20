"use client";

import { useState, useTransition, useEffect } from "react";
import { regenerateInvitationCodeAction } from "@/app/account/private-lairs-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import QRCode from "qrcode";

interface PrivateLairInvitationManagerProps {
  lairId: string;
  lairName: string;
  initialInvitationCode?: string;
}

export default function PrivateLairInvitationManager({
  lairId,
  lairName,
  initialInvitationCode,
}: PrivateLairInvitationManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [invitationCode, setInvitationCode] = useState(initialInvitationCode);
  const [copiedCode, setCopiedCode] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  useEffect(() => {
    if (invitationCode) {
      const invitationUrl = `${window.location.origin}/lairs/invite/${invitationCode}`;
      
      QRCode.toDataURL(invitationUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      })
        .then((url) => {
          setQrCodeUrl(url);
        })
        .catch((err) => {
          console.error("Erreur lors de la génération du QR code:", err);
        });
    }
  }, [invitationCode]);

  const getInvitationUrl = () => {
    if (typeof window === "undefined" || !invitationCode) return "";
    return `${window.location.origin}/lairs/invite/${invitationCode}`;
  };

  const copyInvitationUrl = () => {
    const url = getInvitationUrl();
    navigator.clipboard.writeText(url);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleRegenerateCode = () => {
    if (
      !confirm(
        "Êtes-vous sûr de vouloir régénérer le code d'invitation ? L'ancien code ne fonctionnera plus."
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await regenerateInvitationCodeAction(lairId);

      if (result.success && result.invitationCode) {
        setSuccess("Code d'invitation régénéré avec succès !");
        setInvitationCode(result.invitationCode);
        setError(null);
      } else {
        setError(result.error || "Erreur lors de la régénération du code");
        setSuccess(null);
      }
    });
  };

  if (!invitationCode) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Code d&apos;invitation</CardTitle>
        <CardDescription>
          Partagez ce lien ou ce QR code pour inviter des utilisateurs à suivre ce lieu privé.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={getInvitationUrl()}
              readOnly
              className="font-mono text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={copyInvitationUrl}
            >
              {copiedCode ? (
                "Copié !"
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copier
                </>
              )}
            </Button>
          </div>

          <div className="flex justify-center bg-white p-4 rounded-lg border">
            {qrCodeUrl ? (
              <img
                src={qrCodeUrl}
                alt="QR Code d'invitation"
                className="w-48 h-48 border-4 border-gray-200 rounded-lg"
              />
            ) : (
              <div className="flex items-center justify-center h-48 w-48">
                <p className="text-muted-foreground text-sm">Génération du QR code...</p>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerateCode}
            disabled={isPending}
            className="w-full"
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Régénérer le code
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
