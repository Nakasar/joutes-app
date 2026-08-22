import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation.ts";
import { LiveBadge } from "@/components/users/LiveBadge.tsx";
import { ProfileAvatar } from "@/components/users/ProfileAvatar.tsx";
import { readLiveEmbed } from "@/lib/media/live-embed.ts";
import { userProfilePath } from "@/lib/users/handle.ts";

import { readLiveNow } from "./registry-data.ts";

/**
 * La bande des directs.
 *
 * En tête du registre parce que c'est ce qui est périssable : les autres fiches
 * seront encore là demain. Les vignettes sont celles que les plateformes
 * servent — intégrer une dizaine de lecteurs sur une page de liste coûterait
 * plus que toute la page.
 *
 * Cliquer mène au profil, pas à la plateforme : c'est le profil qui porte le
 * lecteur, le titre et le reste de la personne.
 */
export default async function LiveNowStrip() {
  const [live, t, headerList] = await Promise.all([
    readLiveNow(),
    getTranslations("Users.registry.live"),
    headers(),
  ]);

  // L'hôte réel, et non une valeur en dur : Twitch refuse un lecteur dont le
  // `parent` ne correspond pas au domaine qui l'intègre. Cette bande n'affiche
  // aujourd'hui que la vignette, qui s'en moque — mais la première personne qui
  // y posera un lecteur hériterait sinon d'un cadre vide en production.
  const host = headerList.get("host") ?? "localhost";

  if (live.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <LiveBadge label={t("badge")} />
        <h2 className="text-sm font-semibold">{t("title", { count: live.length })}</h2>
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {live.slice(0, 4).map((entry) => {
          const embed = readLiveEmbed(entry.live.url, host);
          const displayName = entry.user.displayName || entry.user.username;

          return (
            <li key={entry.user.id}>
              <Link
                href={userProfilePath(entry.user)}
                className="flex flex-col gap-2 overflow-hidden rounded-xl border bg-card transition-colors hover:bg-accent"
              >
                <span className="relative block h-24 w-full bg-muted">
                  {embed && (
                    // Vignette servie par la plateforme : hôte non déclaré.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={embed.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute top-1.5 left-1.5">
                    <LiveBadge label={t("badge")} />
                  </span>
                </span>

                <span className="flex items-center gap-2 px-2.5 pb-2.5">
                  <ProfileAvatar
                    src={entry.user.avatar}
                    name={displayName}
                    plan={entry.badges.plan}
                    size={28}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] font-medium">{displayName}</span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground uppercase">
                      {entry.platform}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
