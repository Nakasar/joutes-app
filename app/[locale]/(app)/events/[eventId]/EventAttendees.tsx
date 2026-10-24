"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Lock, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation.ts";
import { Input } from "@/components/ui/input.tsx";
import { getEventAttendeesAction, type EventAttendee } from "../actions.ts";
import ListPagination from "./ListPagination.tsx";
import { ATTENDEES_PAGE_SIZE, initials, type AttendeesPage } from "@/lib/events/attendees.ts";
import type { ParticipantsVisibility } from "@/lib/types/Event.ts";

/**
 * « Qui vient ? » : les inscrits confirmés, pseudos seulement, cherchables et
 * paginés. La première page arrive avec la page ; les suivantes, et chaque
 * recherche, sont relues auprès du serveur, qui revérifie la visibilité.
 */
export default function EventAttendees({
  eventId,
  count,
  initial,
  hidden,
  viewerId,
}: {
  eventId: string;
  /** Nombre d'inscrits confirmés, affiché même quand la liste est masquée. */
  count: number;
  initial: AttendeesPage<EventAttendee> | null;
  /** La raison du masquage, quand la personne ne peut pas lire la liste. */
  hidden?: Exclude<ParticipantsVisibility, "public">;
  viewerId: string | null;
}) {
  const t = useTranslations("EventDetail.attendees");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const requested = useRef({ query: "", page: 0 });

  const load = (nextQuery: string, page: number) => {
    requested.current = { query: nextQuery, page };
    startTransition(async () => {
      const response = await getEventAttendeesAction(eventId, { query: nextQuery, page });
      // Une réponse arrivée après une saisie plus récente est ignorée.
      if (requested.current.query !== nextQuery || requested.current.page !== page) return;
      if (response.success) {
        setResult({ items: response.items, total: response.total, page: response.page, pageCount: response.pageCount });
      }
    });
  };

  // La recherche part après une courte pause dans la saisie.
  useEffect(() => {
    if (!initial || query === requested.current.query) return;
    const timer = setTimeout(() => load(query, 0), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <section className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {t("title")} <span className="font-medium text-muted-foreground">· {count}</span>
        </h2>
        {result && count > 0 && (
          <label className="relative block w-full sm:w-64">
            <span className="sr-only">{t("search")}</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-9"
            />
          </label>
        )}
      </div>

      {!result ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" />
          <span>{hidden === "participants" ? t("hiddenParticipants") : t("hiddenOrganizers")}</span>
        </div>
      ) : count === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <ul className={`grid grid-cols-2 gap-2 lg:grid-cols-3 ${isPending ? "opacity-60" : ""}`} aria-busy={isPending}>
            {result.items.map((attendee) => (
              <li key={attendee.id}>
                <Link
                  href={`/users/${attendee.id}`}
                  className="flex min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors hover:bg-accent"
                >
                  <AttendeeAvatar attendee={attendee} />
                  <span className="min-w-0 truncate text-sm font-medium">
                    {attendee.displayName}
                    {attendee.discriminator && (
                      <span className="font-normal text-muted-foreground">#{attendee.discriminator}</span>
                    )}
                  </span>
                  {attendee.id === viewerId && (
                    <span className="ml-auto shrink-0 text-xs font-semibold text-primary">{t("you")}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {result.total === 0 && (
            <p className="text-sm text-muted-foreground">{t("noResult", { query })}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              {result.total > 0 &&
                t("range", {
                  from: result.page * ATTENDEES_PAGE_SIZE + 1,
                  to: Math.min(result.total, result.page * ATTENDEES_PAGE_SIZE + result.items.length),
                  total: result.total,
                })}
            </span>
            <ListPagination
              page={result.page}
              pageCount={result.pageCount}
              disabled={isPending}
              onPageChange={(page) => load(query, page)}
            />
          </div>
        </>
      )}
    </section>
  );
}

function AttendeeAvatar({ attendee }: { attendee: EventAttendee }) {
  if (attendee.profileImage) {
    // eslint-disable-next-line @next/next/no-img-element -- avatars de fournisseurs d'identité variés
    return <img src={attendee.profileImage} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold uppercase text-primary">
      {initials(attendee.displayName) || "?"}
    </span>
  );
}
