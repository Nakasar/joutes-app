"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CalendarRange, Link2, Link2Off, MapPin, Plus } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { linkEventAction, unlinkEventAction } from "../actions.ts";

export type RelatedEventItem = {
  id: string;
  name: string;
  /** `linked` : lien posé par l'organisation ; `similar` : titre proche. */
  kind: "linked" | "similar";
  month: string;
  day: string;
  when: string;
  /** Renseigné seulement quand l'événement est dans un autre lieu. */
  lairName?: string;
  cancelled: boolean;
  past: boolean;
};

/**
 * Liste des événements liés. L'organisation y colle le lien d'un autre
 * événement pour le lier, confirme une suggestion d'un clic, ou retire un lien.
 */
export default function RelatedEventsList({
  eventId,
  items,
  canManage,
}: {
  eventId: string;
  items: RelatedEventItem[];
  canManage: boolean;
}) {
  const t = useTranslations("EventDetail.related");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => ReturnType<typeof linkEventAction>, onSuccess?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(t(`errors.${result.error}`));
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  };

  const link = (ref: string, onSuccess?: () => void) => run(() => linkEventAction(eventId, ref), onSuccess);
  const unlink = (otherId: string) => run(() => unlinkEventAction(eventId, otherId));

  const linkedItems = items.filter((item) => item.kind === "linked");
  const similarItems = items.filter((item) => item.kind === "similar");

  // Les titres d'une même série ne diffèrent souvent que par la fin : ils
  // passent à la ligne plutôt que d'être tronqués, et les boutons gardent
  // leur libellé, quitte à passer sous l'événement sur un écran étroit.
  const renderItem = (item: RelatedEventItem) => (
    <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5">
      <div className="flex min-w-0 flex-[1_1_14rem] items-center gap-3">
        <div className="w-11 shrink-0 overflow-hidden rounded-md border text-center" aria-hidden>
          <div className="bg-muted py-px text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {item.month}
          </div>
          <div className="py-0.5 text-lg font-bold tabular-nums">{item.day}</div>
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/events/${item.id}`} className="block break-words font-medium leading-snug hover:underline">
            {item.name}
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="first-letter:uppercase">{item.when}</span>
            {item.lairName && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {item.lairName}
              </span>
            )}
            {item.cancelled && <Badge variant="destructive">{t("cancelled")}</Badge>}
            {!item.cancelled && item.past && <Badge variant="secondary">{t("past")}</Badge>}
          </div>
        </div>
      </div>
      {canManage && (
        <div className="ml-auto flex flex-wrap justify-end gap-1">
          {item.kind === "linked" ? (
            <Button size="sm" variant="ghost" onClick={() => unlink(item.id)} disabled={isPending}>
              <Link2Off className="mr-2 h-4 w-4" />
              {t("unlink")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => link(item.id)}
              disabled={isPending}
              title={t("linkSuggestion")}
            >
              <Link2 className="mr-2 h-4 w-4" />
              {t("link")}
            </Button>
          )}
        </div>
      )}
    </li>
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarRange className="h-5 w-5" />
          {t("title")}
        </h2>
        {canManage && !formOpen && (
          <Button variant="ghost" size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("add")}
          </Button>
        )}
      </div>

      {formOpen && (
        <form
          className="space-y-2 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            link(reference, () => {
              setReference("");
              setFormOpen(false);
            });
          }}
        >
          <label htmlFor="related-event-reference" className="text-sm font-medium">
            {t("referenceLabel")}
          </label>
          <Input
            id="related-event-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={t("referencePlaceholder")}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={isPending || !reference.trim()}>
              <Link2 className="mr-2 h-4 w-4" />
              {t("link")}
            </Button>
            <Button size="sm" type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={isPending}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="space-y-4">
          {/* Liens posés et suggestions en deux groupes : un visiteur doit
              savoir ce que l'organisation a lié et ce qui n'est que proposé. */}
          {linkedItems.length > 0 && (
            <RelatedGroup title={similarItems.length > 0 ? t("linkedGroup") : null}>
              {linkedItems.map(renderItem)}
            </RelatedGroup>
          )}
          {similarItems.length > 0 && (
            <RelatedGroup title={t("similarGroup")}>{similarItems.map(renderItem)}</RelatedGroup>
          )}
        </div>
      )}
    </section>
  );
}

function RelatedGroup({ title, children }: { title: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      {title && <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>}
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}
