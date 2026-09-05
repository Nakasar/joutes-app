import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { EyeOff } from "lucide-react";

import { SocialLinkIcon } from "@/components/SocialLinkIcon.tsx";
import { externalUrl } from "@/lib/lairs/urls.ts";
import { formatSocialDuration } from "@/lib/social/youtube-posts.ts";
import { socialPlatform } from "@/lib/social/platforms.ts";
import type { GameSocialPost } from "@/lib/types/GameSocialPost";

import HidePostButton from "./HidePostButton.tsx";

/**
 * Une publication, en vignette.
 *
 * Partagée par la section de la fiche et par la page dédiée : les deux montrent
 * la même chose, seul le nombre change. Le composant est **serveur** — il n'a
 * aucune interaction propre, et le seul bouton qu'il porte
 * (`HidePostButton`) est client et n'apparaît qu'à l'administration.
 *
 * Ce qui est affiché vient d'un tiers, et cela dicte trois choses :
 *
 * - le texte est rendu **en texte brut**, jamais en HTML ;
 * - la miniature passe par `externalUrl` **au rendu**, comme partout ailleurs
 *   dans le dépôt : la base peut contenir ce qu'une plateforme y a mis ;
 * - le lien porte `rel="noopener noreferrer"` et sort dans un onglet neuf.
 */
export default async function SocialPostCard({
  post,
  canModerate = false,
  gameSlug,
}: {
  post: GameSocialPost;
  canModerate?: boolean;
  gameSlug?: string;
}) {
  const [t, locale] = await Promise.all([getTranslations("Games.social"), getLocale()]);

  const thumbnail = externalUrl(post.thumbnail);
  const platform = socialPlatform(post.platform);
  const hidden = Boolean(post.hiddenAt);

  const published = DateTime.fromISO(post.publishedAt).setLocale(locale);
  const relative = published.isValid ? published.toRelative() : null;

  const duration = formatSocialDuration(post.durationSeconds);

  return (
    <article
      className={`relative flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-colors hover:border-white/30 ${
        hidden ? "opacity-40" : ""
      }`}
    >
      <a
        href={post.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-full flex-col"
        aria-label={t("openOn", { platform: platform.label })}
      >
        {thumbnail && (
          /* Le conteneur porte le fond : sans proxy d'images ni `onError`
             possible côté serveur, une miniature morte doit laisser un cadre
             propre plutôt qu'une icône cassée. */
          <span className="relative block aspect-video w-full overflow-hidden bg-white/5">
            {/* Miniature servie par la plateforme : hôte non déclaré dans
                `next.config.ts`, donc balise ordinaire et non `next/image`.
                `no-referrer` évite d'annoncer au CDN quelle fiche on lit. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="absolute inset-0 size-full object-cover"
            />
            {duration && (
              <span className="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white">
                {duration}
              </span>
            )}
            {post.kind === "short" && (
              <span className="absolute top-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-white uppercase">
                {t("kind.short")}
              </span>
            )}
          </span>
        )}

        <span className="flex flex-1 flex-col gap-3 p-4">
          {post.text && (
            <span
              className={`text-sm leading-relaxed text-gray-200 ${thumbnail ? "line-clamp-3" : "line-clamp-6"}`}
            >
              {post.text}
            </span>
          )}

          {/* `flex-wrap` obligatoire : cette rangée aligne plusieurs éléments
              qui ne rétrécissent pas, et sans lui c'est la page entière qui
              s'élargit sur un téléphone (voir `scripts/check-flex-rows.mjs`). */}
          <span className="mt-auto flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <SocialLinkIcon kind={post.platform} className="size-4 shrink-0" />
            <span className="min-w-0 truncate font-medium">{post.account.handle}</span>
            {relative && (
              <>
                <span aria-hidden>·</span>
                <time dateTime={post.publishedAt}>{relative}</time>
              </>
            )}
          </span>
        </span>
      </a>

      {hidden && (
        <span className="pointer-events-none absolute top-2 right-2 flex items-center gap-1.5 rounded bg-black/80 px-2 py-1 text-[10px] font-medium text-white">
          <EyeOff className="size-3" aria-hidden />
          {t("moderation.hidden")}
        </span>
      )}

      {canModerate && gameSlug && (
        <div className="border-t border-white/10 p-2">
          <HidePostButton postId={post.id} hidden={hidden} gameSlug={gameSlug} />
        </div>
      )}
    </article>
  );
}
