"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitationAction } from "@/app/account/private-lairs-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle, XCircle, Lock, MapPin } from "lucide-react";
import Link from "next/link";

interface InvitePageProps {
  params: {
    code: string;
  };
}

export default function InvitePage({ params }: InvitePageProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lairName, setLairName] = useState<string | null>(null);
  const [lairId, setLairId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const acceptInvitation = async () => {
      try {
        const result = await acceptInvitationAction(params.code);

        if (result.success && result.lairId && result.lairName) {
          setSuccess(true);
          setLairId(result.lairId);
          setLairName(result.lairName);
          setError(null);
        } else {
          setError(result.error || "Erreur lors de l'acceptation de l'invitation");
          setSuccess(false);
        }
      } catch (err) {
        console.error("Erreur:", err);
        setError("Une erreur inattendue s'est produite");
        setSuccess(false);
      } finally {
        setIsLoading(false);
      }
    };

    acceptInvitation();
  }, [params.code]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg text-muted-foreground">
              Traitement de votre invitation...
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
            <CardTitle className="text-center text-2xl">Invitation invalide</CardTitle>
            <CardDescription className="text-center">{error}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Alert variant="destructive">
              <AlertDescription>
                Le code d&apos;invitation est peut-être expiré ou invalide. Contactez le
                propriétaire du lieu pour obtenir un nouveau code.
              </AlertDescription>
            </Alert>
            <Button onClick={() => router.push("/lairs")} className="w-full">
              <MapPin className="mr-2 h-4 w-4" />
              Voir tous les lieux
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
              Invitation acceptée !
            </CardTitle>
            <CardDescription className="text-center text-lg">
              Vous suivez maintenant le lieu privé{" "}
              <span className="font-semibold">{lairName}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Alert>
              <AlertDescription>
                Vous pouvez maintenant voir les événements de ce lieu dans votre calendrier et
                dans votre liste de lieux suivis.
              </AlertDescription>
            </Alert>
            <div className="flex gap-2 w-full">
              <Button asChild className="flex-1">
                <Link href={`/lairs/${lairId}`}>
                  <MapPin className="mr-2 h-4 w-4" />
                  Voir le lieu
                </Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link href="/account">Mon compte</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
