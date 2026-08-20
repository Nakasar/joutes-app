import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Car, Mail, MessageCircle, Phone, TrainFront, User2 } from "lucide-react";

import GameMarkdown from "@/components/GameMarkdown.tsx";
import { Button } from "@/components/ui/button.tsx";
import { embedVideoUrl, externalUrl } from "@/lib/lairs/urls.ts";
import { isSectionEnabled, readLairSections } from "@/lib/lairs/sections.ts";
import type { Lair } from "@/lib/types/Lair";

import LairMap from "./LairMap.tsx";
import { SidebarCard } from "./LairSidebar.tsx";

/**
 * L'onglet « À propos » : le lieu raconté par lui-même.
 *
 * Chaque bloc — texte, équipements, photos, vidéo — disparaît s'il est vide.
 * Un lieu qui n'a renseigné qu'une description n'affiche donc pas trois
 * cadres en attente de contenu, mais un paragraphe.
 */
export default async function LairAboutTab({ lair }: { lair: Lair }) {
  const [t, locale] = await Promise.all([getTranslations("Lairs.portal.about"), getLocale()]);

  // Les deux réglages qui portent sur cet onglet : `about` pour le texte et la
  // galerie, `media` pour la vidéo intégrée.
  const sections = readLairSections(lair);
  const showAbout = isSectionEnabled(sections, "about");
  const showMedia = isSectionEnabled(sections, "media");

  const about = showAbout ? lair.options?.about : undefined;
  const photos = about?.photos ?? [];
  const amenities = about?.amenities ?? [];
  const ruleLang = locale === "fr" ? "fr" : "en";

  // Une `iframe` donne à l'hôte appelé la page entière qu'il rend : la vidéo de
  // présentation n'est intégrée que si elle vient d'une plateforme attendue,
  // les formes publiques de YouTube étant traduites au passage.
  const video = showMedia ? embedVideoUrl(lair.options?.about?.videoUrl) : null;

  if (!about?.description && amenities.length === 0 && photos.length === 0 && !video) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-[30px]">
      {(about?.description || amenities.length > 0) && (
        <section className="flex flex-col gap-4">
          <h2 className="text-[22px] font-bold">{t("title")}</h2>

          {about?.description && (
            <div className="prose prose-sm dark:prose-invert max-w-[720px] text-[15px] leading-[1.7] text-pretty">
              <GameMarkdown markdown={about.description} gameSlug="" ruleLang={ruleLang} />
            </div>
          )}

          {amenities.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {amenities.map((amenity) => (
                <li key={amenity} className="rounded-full border px-3 py-1.5 text-[13px]">
                  {amenity}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {photos.length > 0 && <LairGallery photos={photos} title={t("photos")} />}

      {video && (
        <section className="flex flex-col gap-4">
          <h2 className="text-[22px] font-bold">{t("video")}</h2>
          <div className="overflow-hidden rounded-xl border bg-black">
            <iframe
              src={video}
              title={t("video")}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
              allowFullScreen
              className="aspect-video w-full"
            />
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * La galerie du lieu.
 *
 * La première photo tient deux rangées et la quatrième deux colonnes : une
 * mosaïque, plutôt qu'une grille régulière, parce qu'une vitrine de lieu vaut
 * surtout par sa première image — celle qui montre la salle.
 */
function LairGallery({ photos, title }: { photos: string[]; title: string }) {
  const shown = photos.slice(0, 4);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[22px] font-bold">{title}</h2>
      <div className="grid auto-rows-[130px] grid-cols-2 gap-2.5 sm:grid-cols-[2fr_1fr_1fr]">
        {shown.map((photo, index) => (
          <div
            key={photo}
            className={
              index === 0
                ? "relative col-span-2 row-span-2 overflow-hidden rounded-xl border bg-muted sm:col-span-1"
                : index === 3
                  ? "relative col-span-2 overflow-hidden rounded-xl border bg-muted"
                  : "relative overflow-hidden rounded-xl border bg-muted"
            }
          >
            <Image
              src={photo}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 400px"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/** La colonne de droite de l'onglet « À propos » : accès, contact, équipe. */
export async function LairAboutSidebar({ lair }: { lair: Lair }) {
  const t = await getTranslations("Lairs.portal.about");

  // La colonne suit la même bascule que le corps de l'onglet : éteindre la
  // section devait tout cacher, pas seulement le texte et la galerie.
  const about = isSectionEnabled(readLairSections(lair), "about")
    ? lair.options?.about
    : undefined;
  const phone = lair.options?.contact?.phone;
  const email = lair.options?.contact?.email;
  const discordLink = lair.options?.links?.find((link) => link.type === "discord");
  const discord = externalUrl(discordLink?.url);
  const organizers = about?.organizers ?? [];

  const directionsUrl = lair.location
    ? `https://www.google.com/maps/dir/?api=1&destination=${lair.location.coordinates[1]},${lair.location.coordinates[0]}`
    : lair.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lair.address)}`
      : null;

  return (
    <>
      {(lair.address || lair.location || about?.transit || about?.parking) && (
        <SidebarCard title={t("access")}>
          <LairMap location={lair.location} name={lair.name} className="h-[150px]" />
          <div className="flex flex-col gap-2.5 text-[13px] leading-[1.5]">
            {lair.address && <p className="text-foreground/80">{lair.address}</p>}
            {about?.transit && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <TrainFront className="size-3.5 shrink-0" aria-hidden />
                {about.transit}
              </p>
            )}
            {about?.parking && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Car className="size-3.5 shrink-0" aria-hidden />
                {about.parking}
              </p>
            )}
          </div>
          {directionsUrl && (
            <Button
              asChild
              size="sm"
              className="bg-[var(--lair-accent)] text-[var(--lair-accent-foreground)] hover:bg-[var(--lair-accent)]/90"
            >
              <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                {t("directions")}
              </a>
            </Button>
          )}
        </SidebarCard>
      )}

      {(phone || email || discord) && (
        <SidebarCard title={t("contact")}>
          <div className="flex flex-col gap-2.5 text-[13px] text-foreground/80">
            {phone && (
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="flex items-center gap-2 hover:text-foreground">
                <Phone className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {phone}
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="flex items-center gap-2 break-all hover:text-foreground">
                <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {email}
              </a>
            )}
            {discord && (
              <a
                href={discord}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-foreground"
              >
                <MessageCircle className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {discordLink?.label ?? t("discord")}
              </a>
            )}
          </div>
        </SidebarCard>
      )}

      {organizers.length > 0 && (
        <SidebarCard title={t("organizers")}>
          <ul className="flex flex-col gap-2.5 text-[13px]">
            {organizers.map((organizer) => (
              <li key={`${organizer.name}-${organizer.role ?? ""}`} className="flex items-center gap-2.5">
                {organizer.avatar ? (
                  <Image
                    src={organizer.avatar}
                    alt=""
                    width={28}
                    height={28}
                    className="size-7 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <User2 className="size-3.5 text-muted-foreground" aria-hidden />
                  </span>
                )}
                <span className="text-foreground/80">
                  {organizer.role ? `${organizer.name} — ${organizer.role}` : organizer.name}
                </span>
              </li>
            ))}
          </ul>
        </SidebarCard>
      )}
    </>
  );
}
