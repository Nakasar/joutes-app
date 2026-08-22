import { getTranslations } from "next-intl/server";
import { BellIcon, Calendar1Icon, MailIcon, SmartphoneIcon } from "lucide-react";
import { ObjectId } from "mongodb";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { FieldGroup } from "@/components/ui/field.tsx";
import db from "@/lib/mongodb.ts";
import type { User } from "@/lib/types/User";
import { listMyPushDevicesAction } from "@/app/[locale]/(app)/account/actions.ts";
import { NotificationPreferenceSwitch } from "./components.tsx";
import { PushDevicesSection } from "./PushDevicesSection.tsx";

/**
 * L'onglet « Notifications ».
 *
 * Le contenu de l'ancienne page `/account/notifications`, déplacé sans changer
 * ce qu'il règle. Les préférences ne sont **pas** converties par `toUser` — le
 * test de conversion le constate — d'où la lecture directe, projetée sur le
 * seul champ utile, telle qu'elle était déjà écrite.
 */
export default async function NotificationsTabView({ user }: { user: User }) {
  const [document, devices, t] = await Promise.all([
    db.collection<Pick<User, "notifications">>("user").findOne(
      { _id: new ObjectId(user.id) },
      { projection: { _id: 1, notifications: 1 } },
    ),
    listMyPushDevicesAction(),
    getTranslations("Account.notifications"),
  ]);

  const notifications = document?.notifications;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar1Icon className="h-5 w-5" aria-hidden />
            {t("weekly.title")}
          </CardTitle>
          <CardDescription>{t("weekly.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="w-full">
            <NotificationPreferenceSwitch
              type="weekly"
              channel="emails"
              label={t("channels.email")}
              icon={<MailIcon className="mr-2 h-4 w-4" />}
              description={t("weekly.emailHint")}
              initialEnabled={notifications?.emails?.weekly?.enabled ?? false}
            />
            <NotificationPreferenceSwitch
              type="weekly"
              channel="app"
              label={t("channels.app")}
              icon={<SmartphoneIcon className="mr-2 h-4 w-4" />}
              description={t("weekly.appHint")}
              initialEnabled={notifications?.app?.weekly?.enabled ?? false}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellIcon className="h-5 w-5" aria-hidden />
            {t("push.title")}
          </CardTitle>
          <CardDescription>{t("push.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FieldGroup className="w-full">
            <NotificationPreferenceSwitch
              type="push"
              channel="app"
              label={t("push.title")}
              icon={<SmartphoneIcon className="mr-2 h-4 w-4" />}
              description={t("push.switchHint")}
              initialEnabled={notifications?.app?.push?.enabled ?? true}
            />
          </FieldGroup>
          <div className="space-y-3">
            <h3 className="text-sm font-medium">{t("push.devices")}</h3>
            <PushDevicesSection devices={devices} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar1Icon className="h-5 w-5" aria-hidden />
            {t("platform.title")}
          </CardTitle>
          <CardDescription>{t("platform.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="w-full">
            <NotificationPreferenceSwitch
              type="platform"
              channel="emails"
              label={t("channels.email")}
              icon={<MailIcon className="mr-2 h-4 w-4" />}
              description={t("platform.emailHint")}
              initialEnabled={notifications?.emails?.platform?.enabled ?? false}
            />
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
