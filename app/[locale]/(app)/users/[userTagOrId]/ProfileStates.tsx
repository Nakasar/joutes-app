import { getTranslations } from "next-intl/server";
import { Check, Lock } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { readShowcaseCompletion } from "@/lib/users/completion.ts";
import { cn } from "@/lib/utils.ts";

import {
  readProfilePlans,
  readProfileViewer,
  requireProfile,
} from "./profile-data.ts";

/**
 * Le profil privé, vu par quelqu'un d'autre.
 *
 * Le titre et le cadenas suffisent à dire que la page n'est pas cassée. Ce qui
 * reste malgré tout visible — la liste de vente, les listes de souhaits
 * marquées publiques — s'affiche juste en dessous : l'inventorier en toutes
 * lettres au-dessus revenait à décrire à quelqu'un ce qu'il a sous les yeux.
 */
export async function PrivateProfileCard({ userTagOrId }: { userTagOrId: string }) {
  const [viewer, t] = await Promise.all([
    readProfileViewer(userTagOrId),
    getTranslations("Users.profile.private"),
  ]);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-dashed p-6">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold">
        <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {t("title")}
      </h2>

      {viewer.isOwner && (
        <Button variant="default" size="sm" asChild className="self-start">
          <Link href="/account?tab=showcase">{t("makePublic")}</Link>
        </Button>
      )}
    </section>
  );
}

/**
 * La liste d'amorçage d'une vitrine neuve.
 *
 * **Elle ne s'affiche que pour le propriétaire, et disparaît une fois
 * complétée.** Une liste de courses laissée sur la vitrine de quelqu'un
 * d'autre ne lui apprend rien, et une liste toute cochée n'apprend plus rien à
 * personne.
 *
 * La jauge et les étapes sortent de la même fonction : elles ne peuvent pas se
 * contredire.
 */
export async function ProfileOnboarding({ userTagOrId }: { userTagOrId: string }) {
  const [subject, viewer, plans, t] = await Promise.all([
    requireProfile(userTagOrId),
    readProfileViewer(userTagOrId),
    readProfilePlans(userTagOrId),
    getTranslations("Users.profile.onboarding"),
  ]);

  if (!viewer.isOwner) {
    return null;
  }

  const completion = readShowcaseCompletion({
    hasDisplayName: Boolean(subject.user.displayName),
    hasAvatar: Boolean(subject.avatar),
    hasDescription: Boolean(subject.user.description),
    hasBanner: Boolean(subject.user.showcase?.banner),
    canUseBanner: plans.canUseBanner,
    followedGames: subject.user.games?.length ?? 0,
    followedLairs: subject.user.lairs?.length ?? 0,
    isPublic: subject.isPublic,
  });

  if (completion.complete) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-[17px] font-semibold">{t("title", { percent: completion.percent })}</h2>

        <div
          className="h-1.5 overflow-hidden rounded-[3px] bg-secondary"
          role="progressbar"
          aria-valuenow={completion.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("title", { percent: completion.percent })}
        >
          <div
            className="h-full rounded-[3px] bg-primary"
            style={{ width: `${completion.percent}%` }}
          />
        </div>
      </div>

      <ol className="flex flex-col gap-2">
        {completion.steps.map((step) => (
          <li
            key={step.key}
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-lg border p-3",
              step.done && "text-muted-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
                step.done && "border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
              )}
            >
              {step.done && <Check className="size-3" />}
            </span>

            <span className="min-w-0 flex-1 text-sm">
              {t(`steps.${step.key}` as "steps.username")}
              {step.locked && (
                <span className="block text-xs text-muted-foreground">{t("bannerLocked")}</span>
              )}
            </span>

            {/* Une étape faite perd son bouton : il n'y a plus rien à y faire,
                et le garder ferait douter qu'elle le soit. */}
            {!step.done && (
              <Button variant="outline" size="sm" asChild>
                <Link href={step.locked ? "/pricing" : "/account?tab=showcase"}>
                  {step.locked ? t("subscribe") : t("go")}
                </Link>
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
