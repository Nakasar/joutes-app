import { getTranslations } from "next-intl/server";
import { Home, MapPin, Store } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import type { PlayGroupPlace } from "@/lib/types/PlayGroup";

const ICONS = {
  joutes: Store,
  free: MapPin,
  member: Home,
} as const;

/**
 * Le lieu d'une session.
 *
 * Un lieu Joutes est un lien : la session n'a pas à recopier l'adresse, les
 * horaires ni l'itinéraire, sa fiche les porte déjà et les tient à jour. Un
 * lieu libre n'est qu'un nom et ce que le groupe a bien voulu préciser — mais
 * il porte son badge, pour qu'on ne cherche pas une fiche qui n'existe pas.
 */
export default async function PlayGroupPlaceCard({ place }: { place: PlayGroupPlace }) {
  const t = await getTranslations("PlayGroups.hub.place");
  const Icon = ICONS[place.kind];
  const label = place.label ?? t(place.kind === "joutes" ? "unnamedLair" : "unnamedPlace");

  const body = (
    <>
      <Icon className="size-4 shrink-0 text-[var(--group-accent-text)]" aria-hidden />
      <span className="font-semibold">{label}</span>
      <span
        className={
          place.kind === "joutes"
            ? "rounded-[5px] bg-cyan-400/15 px-1.5 py-0.5 font-mono text-[10px] tracking-[.08em] text-cyan-300 uppercase"
            : "rounded-[5px] border px-1.5 py-0.5 font-mono text-[10px] tracking-[.08em] text-muted-foreground uppercase"
        }
      >
        {t(place.kind === "joutes" ? "badgeLair" : "badgeFree")}
      </span>
      {place.detail && <span className="text-[13px] text-muted-foreground">{place.detail}</span>}
    </>
  );

  const className =
    "flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-[10px] border bg-background/40 px-3.5 py-3 text-sm";

  if (place.kind === "joutes" && place.lairId) {
    return (
      <Link href={`/lairs/${place.lairId}`} className={`${className} transition-colors hover:bg-accent`}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}
