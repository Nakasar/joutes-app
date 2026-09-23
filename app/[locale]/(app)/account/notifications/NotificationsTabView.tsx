import { getTranslations } from "next-intl/server";
import { BellIcon, Calendar1Icon, ImageIcon, MailIcon, MessageCircleIcon, SmartphoneIcon } from "lucide-react";
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
import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import { findDiscordAccountId } from "@/lib/db/discord-notifications.ts";
import { getPosterDigest } from "@/lib/db/poster-digest.ts";
import { listAccountPosters } from "@/lib/posters/library.ts";
import { formatPosterRef } from "@/lib/posters/references.ts";
import { MAX_DIGEST_POSTERS } from "@/lib/posters/digest.ts";
import { plansForUserId } from "@/lib/subscriptions/access.ts";
import { grantsEntitlement } from "@/lib/subscriptions/entitlements.ts";
import { PosterDigestPicker } from "./PosterDigestPicker.tsx";

/**
 * L'onglet « Notifications ».
 *
 * Le contenu de l'ancienne page `/account/notifications`, déplacé sans changer
 * ce qu'il règle. Les préférences ne sont **pas** converties par `toUser` — le
 * test de conversion le constate — d'où la lecture directe, projetée sur le
 * seul champ utile, telle qu'elle était déjà écrite.
 */
export default async function NotificationsTabView({ user }: { user: User }) {
  const [document, devices, discordAccountId, plans, posterDigest, t] = await Promise.all([
    db.collection<Pick<User, "notifications">>("user").findOne(
      { _id: new ObjectId(user.id) },
      { projection: { _id: 1, notifications: 1 } },
    ),
    listMyPushDevicesAction(),
    findDiscordAccountId(user.id),
    plansForUserId(user.id),
    getPosterDigest(user.id),
    getTranslations("Account.notifications"),
  ]);

  const notifications = document?.notifications;

  // Les affiches de la semaine en MP : Joutes Expert seulement. La liste des
  // affiches ne se lit que pour qui peut s'en servir.
  const canUsePosterDigest = grantsEntitlement(plans, "sub:poster-digest");
  const posterChoices = canUsePosterDigest
    ? (await listAccountPosters(user.id)).map((choice) => ({
        ref: formatPosterRef(choice),
        name: choice.name,
        kind: choice.kind,
      }))
    : [];

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
            <MessageCircleIcon className="h-5 w-5" aria-hidden />
            {t("discord.title")}
          </CardTitle>
          <CardDescription>{t("discord.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldGroup className="w-full">
            <NotificationPreferenceSwitch
              type="dm"
              channel="discord"
              label={t("discord.switchLabel")}
              icon={<MessageCircleIcon className="mr-2 h-4 w-4" />}
              description={discordAccountId ? t("discord.switchHint") : t("discord.notLinked")}
              initialEnabled={Boolean(discordAccountId) && notifications?.discord?.dm?.enabled === true}
              disabled={!discordAccountId}
            />
          </FieldGroup>
          {!discordAccountId && (
            <Button asChild variant="outline" size="sm">
              <Link href="/account/security">{t("discord.linkAction")}</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" aria-hidden />
            {t("posterDigest.title")}
          </CardTitle>
          <CardDescription>{t("posterDigest.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canUsePosterDigest ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("posterDigest.expertOnly")}</p>
              <Button asChild variant="outline" size="sm">
                <Link href="/pricing">{t("posterDigest.discoverExpert")}</Link>
              </Button>
            </div>
          ) : (
            <>
              {!discordAccountId && (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-muted-foreground">{t("posterDigest.notLinked")}</p>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/account/security">{t("discord.linkAction")}</Link>
                  </Button>
                </div>
              )}
              <PosterDigestPicker
                choices={posterChoices}
                initialRefs={posterDigest.refs.filter((ref) => posterChoices.some((choice) => choice.ref === ref))}
                max={MAX_DIGEST_POSTERS}
              />
            </>
          )}
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
