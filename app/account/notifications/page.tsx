import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {ArrowLeft, Calendar1Icon, MailIcon, SmartphoneIcon} from "lucide-react";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Switch} from "@/components/ui/switch";
import {Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle} from "@/components/ui/field";

export default async function AccountNotificationsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="space-y-8">
          {/* Header avec retour */}
          <div className="flex items-center gap-4">
            <Link href="/account">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2"/>
                Retour
              </Button>
            </Link>
            <div className="flex-1 space-y-2">
              <h1 className="text-4xl font-bold tracking-tight">Notifications</h1>
              <p className="text-muted-foreground">
                Gérez vos préférences de communication.
              </p>
            </div>
          </div>

          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar1Icon className="h-5 w-5"/>
                Récapitulatifs Hebdomadaires
              </CardTitle>
              <CardDescription>
                Recevez chaque lundi un récapitulatifs des évènements qui peuvent vous intéresser.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="flex items-center justify-between border-b py-4 last:border-0"
              >
                <FieldGroup className="w-full">
                  <FieldLabel htmlFor="switch-recap-email">
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>
                          <MailIcon className="mr-2 h-4 w-4" />
                          Courriels
                        </FieldTitle>
                        <FieldDescription>
                          Recevez votre récapitulatif par email.
                        </FieldDescription>
                      </FieldContent>
                      <Switch id="switch-recap-email" />
                    </Field>
                  </FieldLabel>
                  <FieldLabel htmlFor="switch-recap-app">
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>
                          <SmartphoneIcon className="mr-2 h-4 w-4" />
                          Joutes App (coming soon)
                        </FieldTitle>
                        <FieldDescription>
                          Recevez votre récapitulatif par notification push sur votre téléphone.
                        </FieldDescription>
                      </FieldContent>
                      <Switch id="switch-recap-app" disabled />
                    </Field>
                  </FieldLabel>
                </FieldGroup>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}