import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {ArrowLeft, Calendar1Icon, MailIcon, SmartphoneIcon} from "lucide-react";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {FieldGroup} from "@/components/ui/field";
import {NotificationPreferenceSwitch} from "@/app/account/notifications/components";
import db from "@/lib/mongodb";
import {ObjectId} from "mongodb";
import {User} from "@/lib/types/User";

export default async function AccountNotificationsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const user = await db.collection<Pick<User, "notifications">>('user').findOne({
    _id: new ObjectId(session.user.id),
  }, { projection: { _id: 1, notifications: 1 } });

  if (!user) {
    redirect("/login");
  }

  console.log(user);

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
                  <NotificationPreferenceSwitch type="weekly" channel="emails" label="Courriels" icon={<MailIcon className="mr-2 h-4 w-4" />} description="Recevez votre récapitulatif par curriel." initialEnabled={user.notifications?.emails?.weekly?.enabled ?? false} />
                  <NotificationPreferenceSwitch type="weekly" channel="app" label="App Joutes (coming soon)" icon={<SmartphoneIcon className="mr-2 h-4 w-4" />} description="Recevez votre récapitulatif par notifications push sur l'application." initialEnabled={user.notifications?.app?.weekly?.enabled ?? false} disabled />
                </FieldGroup>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar1Icon className="h-5 w-5"/>
                Actualités de Joutes
              </CardTitle>
              <CardDescription>
                Tenez vous au courant des dernières nouveautés de la plateforme Joutes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="flex items-center justify-between border-b py-4 last:border-0"
              >
                <FieldGroup className="w-full">
                  <NotificationPreferenceSwitch type="platform" channel="emails" label="Courriels" icon={<MailIcon className="mr-2 h-4 w-4" />} description="Recevez nos actualités par courriel." initialEnabled={user.notifications?.emails?.platform?.enabled ?? false} />
                </FieldGroup>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}