"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitationAction } from "@/app/account/private-lairs-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle, XCircle, Lock, MapPin } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface InvitePageProps {
  params: Promise<{
    code: string;
  }>;
}

export default function InvitePage({ params }: InvitePageProps) {
  const { code } = use(params);
  const router = useRouter();
  const t = useTranslations("Lairs");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lairName, setLairName] = useState<string | null>(null);
  const [lairId, setLairId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!code) return;
    const acceptInvitation = async () => {
      try {
        const result = await acceptInvitationAction(code);

        if (result.success && result.lairId && result.lairName) {
          setSuccess(true);
          setLairId(result.lairId);
          setLairName(result.lairName);
          setError(null);
        } else {
          setError(result.error || t("invite.errors.acceptFailed"));
          setSuccess(false);
        }
      } catch (err) {
        console.error("Erreur:", err);
        setError(t("invite.errors.unexpected"));
        setSuccess(false);
      } finally {
        setIsLoading(false);
      }
    };

    acceptInvitation();
  }, [code, t]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg text-muted-foreground">
              {t("invite.loading")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-center mb-4">
              <XCircle className="h-16 w-16 text-destructive" />
            </div>
            <CardTitle className="text-center text-2xl">{t("invite.invalidTitle")}</CardTitle>
            <CardDescription className="text-center">{error}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Alert variant="destructive">
              <AlertDescription>
                {t("invite.invalidDescription")}
              </AlertDescription>
            </Alert>
            <Button onClick={() => router.push("/lairs")} className="w-full">
              <MapPin className="mr-2 h-4 w-4" />
              {t("invite.viewAllLairs")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success && lairName && lairId) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <CardTitle className="text-center text-2xl flex items-center justify-center gap-2">
              <Lock className="h-6 w-6" />
              {t("invite.successTitle")}
            </CardTitle>
            <CardDescription className="text-center text-lg">
              {t("invite.successDescription", { name: lairName })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Alert>
              <AlertDescription>
                {t("invite.successInfo")}
              </AlertDescription>
            </Alert>
            <div className="flex gap-2 w-full">
              <Button asChild className="flex-1">
                <Link href={`/lairs/${lairId}`}>
                  <MapPin className="mr-2 h-4 w-4" />
                  {t("invite.viewLair")}
                </Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link href="/account">{t("invite.myAccount")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
